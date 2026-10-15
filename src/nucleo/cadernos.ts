/**
 * Os cadernos no vault — o porte da parte pura do agente anterior (spec 10 §5).
 *
 * Aqui o plugin CRIA pastas e arquivos, coisa que a metade dos dias recusa por
 * princípio (sem criar nota nem cabeçalho). O princípio não sai sem substituto: são
 * os cinco freios da 10 §5, e cada um tem casos no corpus.
 *
 *   1. A lista de pastas mora no APARELHO (os ajustes), não na nuvem. A nuvem
 *      propõe o destino; o aparelho decide. A recusa nomeia as aceitas.
 *   2. Pasta com `.md` que o plugin não escreveu não se adota (`codex: folio`).
 *   3. O `index.md` se escreve só entre marcadores.
 *   4. Apagar move para `.lixeira/`; nunca apaga.
 *   5. A primeira rodada depois do pareamento é ensaio (isso mora na casca).
 *
 * O que muda em relação ao agente: a lista do freio 1 deixa de ser a constante
 * `SILOS_PERMITIDOS` e passa a ser `pastasDosCadernos`, e uma pasta da lista pode
 * ter mais de um nível (`Projetos/Escrita`). Com a lista do agente, a regra é a
 * mesma. O link simbólico para fora do vault, que o agente confere no disco,
 * não se confere aqui: a API do vault do Obsidian não expõe link simbólico.
 */

import { FIM_DE_LINHA, S, fatiar, lstripChars, nosInicios, rstripChars, splitlines, strip } from "./py.ts";
import { T } from "./textos.ts";
import { sha256Hex } from "./sha.ts";

export const TETO_DO_NOME = 120;
export const PREFIXO_TEMPORARIO = ".tmp-";
export const marcaAbre = (slug: string) => `<!-- codex:caderno ${slug} -->`;
export const MARCA_FECHA = "<!-- /codex -->";

// `[\w-]` do Python: letra e número Unicode, `_` e `-`.
const RE_ABRE = () => new RegExp(`<!--${S}*codex:caderno${S}+([\\p{L}\\p{N}_-]+)${S}*-->`, "u");
const RE_FECHA = () => new RegExp(`<!--${S}*/codex${S}*-->`);

export type CodigoDaRecusa = "DESTINO_FORA_DOS_SILOS" | "PASTA_OCUPADA";

/** Um freio de destino disparou. A mensagem nomeia o conjunto válido. */
export class DestinoRecusado extends Error {
  codigo: CodigoDaRecusa;
  constructor(mensagem: string, codigo: CodigoDaRecusa = "DESTINO_FORA_DOS_SILOS") {
    super(mensagem);
    this.codigo = codigo;
  }
}

/** O arquivo no vault não tem a forma que o plugin deixou. Não se escreve. */
export class SurpresaDoIndex extends Error {}

const partesDe = (caminho: string) => caminho.split("/").filter((p) => p !== "" && p !== ".");

// ══ Freio 1: o destino ═════════════════════════════════════════════════════

/** O caminho do caderno no vault, ou `DestinoRecusado` — que nomeia as pastas aceitas. */
export function conferirDestino(destino: string, pastas: string[]): string {
  const aceitas = pastas.map((p) => `\`${partesDe(p).join("/")}/\``).join(", ") || T().nenhumaPasta;
  const pedido = strip(destino ?? "");

  if (!pedido) throw new DestinoRecusado(T().destinoVazio(aceitas));
  if (pedido.startsWith("/")) {
    throw new DestinoRecusado(T().destinoAbsoluto(pedido, aceitas));
  }
  const partes = partesDe(pedido);
  if (partes.includes("..")) throw new DestinoRecusado(T().destinoSobe(pedido, aceitas));
  if (!partes.length) throw new DestinoRecusado(T().destinoVazio(aceitas));

  // Comparação por PARTES do caminho, nunca por prefixo de texto:
  // `TextosX` começa com `Textos` e não está dentro dele.
  const raiz = pastas
    .map(partesDe)
    .filter((p) => p.length > 0 && p.length <= partes.length && p.every((x, i) => partes[i] === x))
    .sort((a, b) => b.length - a.length)[0];
  if (!raiz) {
    throw new DestinoRecusado(T().destinoFora(pedido, aceitas));
  }
  // Um caderno ocupa uma PASTA PRÓPRIA, nunca a pasta permitida inteira:
  // aceitar daria ao plugin autoridade para renomear tudo o que já mora ali.
  if (partes.length === raiz.length) {
    throw new DestinoRecusado(T().destinoNaRaiz(pedido, `${raiz.join("/")}/${T().exemploDeCaderno}`, aceitas));
  }
  return partes.join("/");
}

// ══ Freio 2: pasta ocupada ═════════════════════════════════════════════════

/** O `.md` foi escrito pela Lareia? O marcador do `index.md`, ou `codex: folio` na cabeça. */
export function ehDoCodex(texto: string): boolean {
  if (RE_ABRE().test(texto)) return true;
  return nosInicios(fatiar(texto, 800), `codex:${S}*folio${S}*${FIM_DE_LINHA}`).length > 0;
}

/**
 * A pasta pode receber um caderno? Livre é: não existe, está vazia, ou só tem
 * `.md` da Lareia. Arquivo que não é `.md` não conta; `.lixeira/`, `anexos/` e
 * subpastas também não. Adotar arquivo alheio é como um conto some: o caderno
 * reordena, renomeia por número, e um arquivo que nunca foi dele vira `04 — algo.md`.
 */
export async function pastaLivre(
  existe: "pasta" | "arquivo" | null,
  entradas: { nome: string; pasta: boolean }[],
  ler: (nome: string) => Promise<string | null>,
): Promise<boolean> {
  if (existe === null) return true;
  if (existe !== "pasta") return false;
  for (const e of entradas) {
    if (e.nome === ".lixeira" || e.nome === "anexos") continue;
    if (e.pasta || sufixoPy(e.nome) !== ".md") continue;
    const texto = await ler(e.nome);
    if (texto === null || !ehDoCodex(texto)) return false;
  }
  return true;
}

function sufixoPy(nome: string): string {
  const i = nome.lastIndexOf(".");
  return i > 0 && i < nome.length - 1 ? nome.slice(i) : "";
}

// ══ O nome do arquivo ══════════════════════════════════════════════════════

/** O título como nome de arquivo: acento fica; `/`, `\` e `: ` saem. */
export function sanear(titulo: string): string {
  let limpo = strip((titulo || "").normalize("NFC"));
  limpo = limpo.replaceAll(":", " -").replaceAll("/", "-").replaceAll("\\", "-");
  // eslint-disable-next-line no-control-regex -- tirar os caracteres de controle do nome do arquivo é o propósito desta linha
  limpo = limpo.replace(/[\x00-\x1f]/g, "");
  limpo = strip(limpo.replace(new RegExp(`${S}+`, "g"), " "));
  limpo = strip(lstripChars(limpo, "."));
  return strip(fatiar(limpo, TETO_DO_NOME));
}

/** `01 — O trem.md`: a largura do número é a da contagem, para a pasta mostrar a ordem. */
export function nomeDoArquivo(posicao: number, total: number, titulo: string): string {
  const largura = String(Math.max(total, 1)).length;
  return `${String(posicao).padStart(largura, "0")} — ${sanear(titulo) || "sem título"}.md`;
}

// ══ O front matter, e o corpo que o hash mede ══════════════════════════════

const CAMPOS_DO_AGENTE = ["title", "date", "created", "modified", "tags", "codex"];

function partir(conteudo: string): [string[], string] {
  if (!conteudo.startsWith("---\n")) return [[], conteudo];
  const fim = conteudo.indexOf("\n---\n", 3);
  if (fim < 0) return [[], conteudo];
  return [splitlines(conteudo.slice(4, fim)), lstripChars(conteudo.slice(fim + 5), "\n")];
}

/** Do fim do front matter até o fim do arquivo: o que o guarda-corpo mede (o INGEST mexe na frente). */
export function corpoDe(conteudo: string): string {
  return partir(conteudo)[1];
}

export const hashCorpo = (corpo: string) => sha256Hex(corpo);

/** `Meus Textos` → `meus-textos`. */
export function slugDoSilo(silo: string): string {
  // eslint-disable-next-line no-control-regex -- «fora do ASCII» inclui, de propósito, a faixa de controle na classe negada
  const limpo = silo.normalize("NFKD").replace(/[^\x00-\x7f]/g, "");
  return limpo.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * O fólio: front matter mecânico + corpo. O front matter tem duas autorias: da
 * Lareia, `title`, `date`, `created`, `modified`, `tags`, `codex`; de quem
 * descreve as notas, `description` e `aliases`. Toda chave que a Lareia não
 * conhece é preservada.
 */
export function montarFolio(
  titulo: string,
  corpo: string,
  o: { slug: string; silo: string; criado: string; modificado: string; existente: string | null },
): string {
  const [velhas] = partir(o.existente ?? "");
  const preservadas = velhas.filter(
    (l) => strip(l) && !CAMPOS_DO_AGENTE.some((c) => l.startsWith(`${c}:`)) && !l.startsWith("description:"),
  );
  const descricao = velhas.find((l) => l.startsWith("description:")) ?? 'description: ""';
  const frente = [
    "---",
    `title: "${titulo || "sem título"}"`,
    `date: ${o.criado}`,
    `created: ${o.criado}`,
    `modified: ${o.modificado}`,
    `tags: [${slugDoSilo(o.silo)}, ${o.slug}, codex]`,
    descricao,
    // A marca de autoria que o freio 2 lê.
    "codex: folio",
    ...preservadas,
    "---",
    "",
  ];
  return frente.join("\n") + rstripChars(corpo, "\n") + "\n";
}

// ══ Freio 3: o index.md entre marcadores ═══════════════════════════════════

/** O `index.md` do caderno, com a lista SÓ entre os marcadores. Fora deles é da pessoa. */
export function montarIndex(atual: string | null, o: { nome: string; slug: string; linhas: string[]; resumo: string }): string {
  const miolo = [...(o.linhas.length ? o.linhas : ["*Ainda sem fólios.*"]), "", `*${o.resumo}*`].join("\n");
  const bloco = `${marcaAbre(o.slug)}\n${miolo}\n${MARCA_FECHA}`;

  if (!atual) {
    return `---\ntitle: "${o.nome}"\ntags: [codex, ${o.slug}]\ndescription: ""\n---\n\n# ${o.nome}\n\n${bloco}\n`;
  }
  const abre = RE_ABRE().exec(atual);
  const fecha = RE_FECHA().exec(atual);
  if (abre && !fecha) {
    // Reescrever daqui engoliria o resto do arquivo. Recusar não perde texto.
    throw new SurpresaDoIndex(T().indexSemFecho);
  }
  if (fecha && !abre) throw new SurpresaDoIndex(T().indexSemAbertura);
  if (!abre || !fecha) return rstripChars(atual, "\n") + `\n\n${bloco}\n`;
  if (fecha.index < abre.index) throw new SurpresaDoIndex(T().indexForaDeOrdem);
  return atual.slice(0, abre.index) + bloco + atual.slice(fecha.index + fecha[0].length);
}

// ══ A renomeação em duas fases ═════════════════════════════════════════════

/**
 * Os movimentos que levam do disco à ordem desejada. Trocar `01 — A` com
 * `02 — B` é uma permutação, e renomear na ordem ingênua sobrescreveria um dos
 * dois: quem colidiria vai antes por um nome temporário. Quem já está no lugar
 * não se move. Nome `.tmp-` em `atual` é rodada interrompida: conclui.
 */
export function planoDeRenomeacao(atual: Map<string, string>, desejado: [string, string][]): [string, string][] {
  const mover = desejado.filter(([id, nome]) => atual.has(id) && atual.get(id) !== nome).map(([id, nome]) => [id, atual.get(id)!, nome] as const);
  if (!mover.length) return [];
  const ocupados = new Set(atual.values());
  const plano: [string, string][] = [];
  const temporarios: [string, string, string][] = [];
  for (const [id, origem, destino] of mover) {
    if (ocupados.has(destino)) {
      const tmp = `${PREFIXO_TEMPORARIO}${id}`;
      plano.push([origem, tmp]);
      temporarios.push([id, tmp, destino]);
      ocupados.delete(origem);
    } else {
      plano.push([origem, destino]);
      ocupados.delete(origem);
      ocupados.add(destino);
    }
  }
  for (const [, tmp, destino] of temporarios) plano.push([tmp, destino]);
  return plano;
}
