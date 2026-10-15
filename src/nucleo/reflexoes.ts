/**
 * O bloco da Lareia dentro da nota do dia — o porte do agente anterior (formato da spec 05).
 *
 * É o módulo perigoso do plugin: decide o que escrever num arquivo que a
 * pessoa edita à mão. NENHUMA função aqui toca no vault — elas recebem texto e
 * devolvem texto, e quem grava é a casca, por `app.vault.process`. É essa
 * separação que deixa testar a decisão inteira, inclusive os casos de
 * corrupção, contra o mesmo corpus que o agente Python roda (I8).
 *
 * O que muda em relação ao agente, e só isso:
 *
 *   1. **A regra do conjunto (spec 26 §4.5, a armadilha A2).** O agente compara
 *      o miolo com o ÚLTIMO hash que escreveu. Com o vault replicado (iCloud,
 *      Obsidian Sync, Git) e numa troca de escritor, o aparelho novo pode ter a
 *      cópia de uma versão anterior, e o último hash acusaria divergência sem
 *      que ninguém tivesse tocado no texto. Aqui conta como do app todo miolo
 *      cujo hash está em `hashesAplicados ∪ {hashAplicado}`.
 *   2. **O cabeçalho é ajuste**, e a nota pode ser criada pelo modelo da daily
 *      e o cabeçalho acrescentado ao fim (§4.6). Com os ajustes do agente, nada
 *      disso acontece, e a saída é a do agente byte a byte.
 *   3. **O modo arquivo**: um arquivo por dia, sem cabeçalho.
 *
 * O que NÃO muda: o bloco ausente com o último hash de texto é o bloco apagado
 * à mão, e diverge (05 §5) — a regra do conjunto vale para o miolo que existe.
 */

import { D, FIM_DE_LINHA, S, escaparRegex, lstripChars, nosInicios, rstripChars, strip, stripChars } from "./py.ts";
import { T } from "./textos.ts";
import { sha256Hex } from "./sha.ts";
import { baseDoNome, fonteDoMapa, nomeDoArquivo as nomeDoMapa, partes } from "./mapas.ts";

export const CABECALHO_PADRAO = "## Lareia";

export const abertura = (data: string) => `<!-- codex:${data} -->`;
export const FECHAMENTO = "<!-- /codex -->";

// Tolerantes a espaçamento: um editor pode reformatar o comentário.
const fonteAbertura = `<!--${S}*codex:(${D}{4}-${D}{2}-${D}{2})${S}*-->`;
const fonteFechamento = `<!--${S}*/codex${S}*-->`;

/** G5 — algo que não se esperava. Nada se escreve, nada se confirma. */
export class Surpresa extends Error {}

export interface Bloco {
  de: number;
  ate: number;
  miolo: string;
}

export const hashMiolo = (miolo: string) => sha256Hex(miolo);

function todos(fonte: string, texto: string): RegExpExecArray[] {
  return [...texto.matchAll(new RegExp(fonte, "gu"))];
}

/** O bloco deste dia, se houver. `Surpresa` se a forma estiver rota. */
export function localizar(conteudo: string, data: string): Bloco | null {
  const todasAsAberturas = todos(fonteAbertura, conteudo);
  const aberturas = todasAsAberturas.filter((m) => m[1] === data);
  const fechamentos = todos(fonteFechamento, conteudo);

  if (aberturas.length > 1) throw new Surpresa(T().blocosDoMesmoDia(aberturas.length, data));
  // Blocos de outros dias são preservados e ignorados; mas os fechamentos são
  // todos iguais, então a conta de pares é sobre o arquivo inteiro.
  if (fechamentos.length !== todasAsAberturas.length) {
    throw new Surpresa(T().marcadoresSemPar);
  }
  if (!aberturas.length) return null;

  const ab = aberturas[0];
  const fimAb = ab.index + ab[0].length;
  const fecha = fechamentos.find((f) => f.index > fimAb);
  if (!fecha) throw new Surpresa(T().blocoNaoFecha(data));

  for (const f of fechamentos) {
    if (f.index < ab.index && !todasAsAberturas.some((a) => a.index + a[0].length <= f.index)) {
      throw new Surpresa(T().fechamentoAntes);
    }
  }
  return { de: ab.index, ate: fecha.index + fecha[0].length, miolo: stripChars(conteudo.slice(fimAb, fecha.index), "\n") };
}

/** O texto do diário não pode conter os marcadores. Escapar mutilaria o texto; é surpresa. */
function conferirTexto(texto: string): void {
  if (new RegExp(fonteAbertura, "u").test(texto) || new RegExp(fonteFechamento).test(texto)) {
    throw new Surpresa(T().textoComMarcador);
  }
}

/** O índice do cabeçalho: exatamente um, ou é surpresa (ambiguidade marca o lugar errado). */
function acharCabecalho(conteudo: string, cabecalho: string): number | null {
  const achados = nosInicios(conteudo, `${escaparRegex(cabecalho)}${S}*${FIM_DE_LINHA}`);
  if (achados.length > 1) throw new Surpresa(T().cabecalhoRepetido(cabecalho, achados.length));
  return achados.length ? achados[0] : null;
}

const bloco = (data: string, texto: string) => `${abertura(data)}\n${texto}\n${FECHAMENTO}`;

/**
 * O bloco no seu lugar, com UMA linha em branco de cada lado (05 §4) — e não
 * mais que isso, nem quando o vão de antes era maior.
 *
 * O agente não faz assim: a cada reescrita ele devolve o `\n` final do bloco
 * sem tirar o que já estava depois do fechamento, e o vão cresce uma linha por
 * versão (uma daily de 15/10 medida já tinha cinco quebras depois de
 * `<!-- /codex -->`). É defeito do agente, não regra: o plugin o corrige, e
 * reescrever fica idempotente no espaço —
 * `escrever(escrever(f, t1), t2) = escrever(f, t2)`. O dia já aplicado (hash e
 * texto iguais) não é reescrito, então a troca de escritor segue sem diff (I13).
 */
function encaixar(antes: string, oBloco: string, depois: string): string {
  const a = rstripChars(antes, "\n");
  const d = lstripChars(depois, "\n");
  return (a ? a + "\n\n" : "") + oBloco + "\n" + (d ? "\n" + d : "");
}

/** O cabeçalho no fim do arquivo: com `\n` antes se faltar, e uma linha em branco. */
export function comCabecalhoAoFim(conteudo: string, cabecalho: string): string {
  let base = conteudo;
  if (base && !base.endsWith("\n")) base += "\n";
  if (base) base += "\n";
  return base + cabecalho + "\n";
}

export type Acao = "escrever" | "nada" | "divergente" | "surpresa" | "segurar";

export interface Decisao {
  /**
   * `escrever` grava e confirma · `nada` não grava e CONFIRMA (o ack pode ter
   * se perdido) · `divergente` não grava e marca o dia · `surpresa` não grava
   * nem confirma · `segurar` a nota não existe e não se cria: espera.
   */
  acao: Acao;
  conteudo: string | null;
  hash: string | null;
  motivo?: string;
}

export interface OpcoesDoDia {
  modo: "daily" | "arquivo";
  cabecalho: string;
  criarNota: boolean;
  acrescentarCabecalho: boolean;
  /** O modelo da daily, já com as variáveis trocadas. Só conta com `criarNota`. */
  modelo?: string;
}

export interface DiaPendente {
  /** O arquivo como está no vault; `null` quando ele não existe. */
  conteudo: string | null;
  data: string;
  /** O texto do dia JÁ reescrito pela mídia (`reescreverMidia`). */
  texto: string;
  hashAplicado: string | null;
  hashesAplicados?: string[];
}

/** O que fazer com este arquivo, neste dia. Nunca lança: a surpresa vira `acao`. */
export async function decidir(dia: DiaPendente, opcoes: OpcoesDoDia): Promise<Decisao> {
  try {
    return await decidirOuLancar(dia, opcoes);
  } catch (e) {
    if (e instanceof Surpresa) return { acao: "surpresa", conteudo: null, hash: null, motivo: e.message };
    throw e;
  }
}

async function decidirOuLancar(dia: DiaPendente, op: OpcoesDoDia): Promise<Decisao> {
  const texto = stripChars(dia.texto, "\n");
  const vazio = await hashMiolo("");

  // A nota ausente vem ANTES de tudo, como no agente: quem não cria a nota
  // espera, sem olhar o texto.
  if (dia.conteudo === null && op.modo === "daily" && !op.criarNota) {
    return { acao: "segurar", conteudo: null, hash: null, motivo: "a nota do dia não existe" };
  }
  // Nada a escrever num arquivo que não existe: não se cria arquivo para dizer «vazio».
  if (dia.conteudo === null && !texto) return { acao: "nada", conteudo: null, hash: vazio };

  conferirTexto(dia.texto);

  let base = dia.conteudo ?? (op.modo === "daily" ? (op.modelo ?? "") : "");
  let inicioDoCabecalho: number | null = null;

  if (op.modo === "daily") {
    inicioDoCabecalho = acharCabecalho(base, op.cabecalho);
    if (inicioDoCabecalho === null) {
      if (!op.acrescentarCabecalho) throw new Surpresa(T().cabecalhoAusente(op.cabecalho));
      if (!texto) return { acao: "nada", conteudo: null, hash: vazio };
      base = comCabecalhoAoFim(base, op.cabecalho);
      inicioDoCabecalho = acharCabecalho(base, op.cabecalho);
      if (inicioDoCabecalho === null) throw new Surpresa(T().cabecalhoAcrescentadoSumiu);
    }
  }

  const achado = localizar(base, dia.data);

  // ── O bloco ainda não existe ──────────────────────────────────────────
  if (achado === null) {
    if (!texto) return { acao: "nada", conteudo: null, hash: vazio };
    if (dia.hashAplicado !== null && dia.hashAplicado !== vazio) {
      // O app já escreveu texto neste dia e o bloco sumiu: alguém o apagou à
      // mão, e reinserir desfaria uma decisão humana. (O hash vazio é o bloco
      // que o próprio app removeu — o conserto de 31/08.)
      return { acao: "divergente", conteudo: null, hash: null };
    }
    let novo: string;
    if (op.modo === "arquivo") {
      novo = encaixar(base, bloco(dia.data, texto), "");
    } else {
      let fimDaLinha = base.indexOf("\n", inicioDoCabecalho!);
      if (fimDaLinha < 0) {
        // O cabeçalho na última linha, sem quebra (o agente quebraria aqui):
        // o fim do arquivo é o fim da linha.
        base += "\n";
        fimDaLinha = base.length - 1;
      }
      // Logo depois da linha do cabeçalho.
      novo = encaixar(base.slice(0, fimDaLinha + 1), bloco(dia.data, texto), base.slice(fimDaLinha + 1));
    }
    return { acao: "escrever", conteudo: novo, hash: await hashMiolo(texto) };
  }

  // ── O bloco existe: é do app se o hash do miolo está no conjunto ──────
  const conjunto = new Set([...(dia.hashesAplicados ?? []), dia.hashAplicado].filter((h): h is string => !!h));
  if (!conjunto.has(await hashMiolo(achado.miolo))) return { acao: "divergente", conteudo: null, hash: null };

  // O arquivo já tem o que se ia escrever: nada a gravar, tudo a confirmar.
  if (achado.miolo === texto) return { acao: "nada", conteudo: null, hash: await hashMiolo(texto) };

  if (!texto) {
    // O bloco inteiro sai, marcadores incluídos.
    const novo = rstripChars(base.slice(0, achado.de), "\n") + "\n" + lstripChars(base.slice(achado.ate), "\n");
    return { acao: "escrever", conteudo: novo, hash: vazio };
  }

  // O par e o miolo trocam, e o vão em volta volta a ser uma linha em branco
  // de cada lado — o excedente que o agente deixou some aqui.
  return { acao: "escrever", conteudo: encaixar(base.slice(0, achado.de), bloco(dia.data, texto), base.slice(achado.ate)), hash: await hashMiolo(texto) };
}

// ── A mídia (C-32, C-34, C-88) ─────────────────────────────────────────────
//
// No app, a imagem é `![…](codex://midia/{data}/{id}.{ext})` — a CHAVE do S3,
// estável. No vault, a mesma linha vira um embed do Obsidian `![[{data}-{id}.{ext}]]`
// e o arquivo desce para a pasta da mídia. O anexo (sem `!`) vira `[[arquivo|rótulo]]`.
// O mapa não tem extensão e passa ANTES, pelo seu padrão: a regex da mídia
// nunca o veria, e ele ficaria no vault como `codex://` cru.

const fonteMidia = `!\\[[^\\]\\n]*\\]\\(codex://(midia/(${D}{4}-${D}{2}-${D}{2})/([0-9a-f-]{36})\\.([a-z0-9]{2,5}))\\)`;
// O anexo é o mesmo link SEM o `!` da frente. O «sem» era um `(?<!!)`, e o
// lookbehind não compila no iOS < 16.4; quem confere o `!` agora é
// `trocarAnexos`, que reproduz o lookbehind posição a posição.
export const fonteAnexo = `\\[([^\\]\\n]*)\\]\\(codex://(midia/(${D}{4}-${D}{2}-${D}{2})/([0-9a-f-]{36})\\.([a-z0-9]{2,5}))\\)`;

/**
 * `texto.replace(/(?<!!)…/gu, troca)` sem o lookbehind: o casamento logo depois
 * de um `!` não se troca, e a busca recomeça UM caractere adiante — não no fim
 * dele —, como o motor faria ao recusar aquela posição. Sem isso,
 * `![a[b](codex://…)` perderia o anexo `[b](…)` que mora dentro do rótulo.
 */
export function trocarAnexos(texto: string, troca: (...grupos: string[]) => string): string {
  const re = new RegExp(fonteAnexo, "gu");
  let saida = "";
  let feito = 0;
  for (let m = re.exec(texto); m; m = re.exec(texto)) {
    if (m.index > 0 && texto[m.index - 1] === "!") {
      re.lastIndex = m.index + 1;
      continue;
    }
    saida += texto.slice(feito, m.index) + troca(...m.slice(1));
    feito = m.index + m[0].length;
  }
  return saida + texto.slice(feito);
}

export type Midia = [chave: string, nome: string];

/** O texto com as referências em forma de embed, e o que baixar — deduplicado. Puro. */
export function reescreverMidia(texto: string): { texto: string; midias: Midia[] } {
  const midias: Midia[] = [];
  const vistas = new Set<string>();

  let novo = texto.replace(new RegExp(fonteDoMapa, "gu"), (_m, embed: string, rotulo: string, chave: string, data: string, id: string, versao: string) => {
    const nome = nomeDoMapa(data, id);
    const anterior = midias.findIndex(([, n]) => n === nome);
    // Duas versões do mesmo mapa no mesmo texto pousam no mesmo arquivo: desce a maior.
    if (anterior < 0) midias.push([chave, nome]);
    else if (partes(midias[anterior][0])[2] < Number(versao)) midias[anterior] = [chave, nome];
    const base = baseDoNome(data, id);
    if (embed) return `![[${base}]]`;
    const r = strip(rotulo);
    return r ? `[[${base}|${r}]]` : `[[${base}]]`;
  });

  const registrar = (chave: string, data: string, id: string, ext: string) => {
    const nome = `${data}-${id}.${ext}`;
    if (!vistas.has(chave)) {
      vistas.add(chave);
      midias.push([chave, nome]);
    }
    return nome;
  };

  // Os embeds primeiro: depois deles, o `!` da frente não confunde o anexo.
  novo = novo.replace(new RegExp(fonteMidia, "gu"), (_m, chave: string, data: string, id: string, ext: string) => `![[${registrar(chave, data, id, ext)}]]`);
  novo = trocarAnexos(novo, (rotulo, chave, data, id, ext) => {
    const nome = registrar(chave, data, id, ext);
    const r = strip(rotulo);
    return r ? `[[${nome}|${r}]]` : `[[${nome}]]`;
  });
  return { texto: novo, midias };
}
