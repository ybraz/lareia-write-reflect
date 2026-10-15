/**
 * O mapa da Lareia no vault — o porte do agente anterior (spec 14 §5).
 *
 * A metade PURA do pouso: reconhecer a referência, dar nome ao arquivo, montar
 * o `.excalidraw.md` e decidir, pelo arquivo que já está no vault, se a versão
 * nova desce, se nada há a fazer, ou se o arquivo foi editado no Obsidian e o
 * plugin tem de parar nele. O efeito mora em `midia.ts`.
 *
 * O nome do arquivo é ESTÁVEL entre versões (`{data}-mapa-{id8}.excalidraw.md`):
 * a v4 cai por cima da v3, e o embed do dia não muda. Por isso a decisão é por
 * `codex-versao` no front matter, nunca pelo tamanho (14 §5.3, defeito 2). E o
 * `codex-sha` mede só o CORPO: o plugin do Excalidraw mexe no front matter sem
 * que isso seja edição de mapa.
 */

import { D, S, splitlines } from "./py.ts";
import { sha256Hex } from "./sha.ts";
import { T } from "./textos.ts";
import { escreverJsonIndent0, JsonInvalido, lerJson, obter, strPy, verdadeiro, type ValorPy } from "./json-py.ts";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** A referência no texto do dia. O `!` opcional é capturado: sem ele, vira wikilink. */
export const fonteDoMapa = `(!?)\\[([^\\]\\n]*)\\]\\(codex://(mapas/(${D}{4}-${D}{2}-${D}{2})/(${UUID})/v([1-9]${D}*))\\)`;
// O `$` do `re.match` do Python também aceita um `\n` final.
const RE_CHAVE_MAPA = new RegExp(`^mapas/(${D}{4}-${D}{2}-${D}{2})/(${UUID})/v([1-9]${D}*)(?:$|(?=\\n$))`, "u");

/**
 * O aviso no alto de todo mapa que o PLUGIN escreve. O do agente anterior
 * trazia o nome interno do app, que saiu do público (spec 16). Só
 * o mapa novo (ou a versão nova que desce) leva o texto novo: o mapa já
 * pousado não se reescreve por isso (`decidir` dá «atual», e o `codex-sha`
 * mede o corpo de cada arquivo contra ele mesmo), então a troca de escritor segue
 * sem diff (I13). No corpus, os casos em que o plugin escreve um mapa são
 * `vale: agente` com o gêmeo `-nucleo` (spec 26 §4.7). É contrato, não
 * relatório: não muda com a língua do Obsidian.
 */
export const AVISO =
  "==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠==\n" +
  "Mapa da Lareia: **editar no app Lareia**. Editado aqui, o plugin para de atualizar " +
  "este arquivo e o marca `codex-divergente`.\n";

export function ehMapa(chave: string): boolean {
  return RE_CHAVE_MAPA.test(chave);
}

/** `mapas/{data}/{id}/v{n}` → `[data, id, n]`. */
export function partes(chave: string): [string, string, number] {
  const m = RE_CHAVE_MAPA.exec(chave);
  if (!m) throw new Error(`chave de mapa fora da forma: ${chave}`);
  return [m[1], m[2], Number(m[3])];
}

/** O que o embed cita: `{data}-mapa-{mapaId8}.excalidraw`. */
export function baseDoNome(data: string, mapaId: string): string {
  return `${data}-mapa-${mapaId.slice(0, 8)}.excalidraw`;
}

/** O arquivo no vault: o embed + `.md`, que é como o plugin do Excalidraw o guarda. */
export function nomeDoArquivo(data: string, mapaId: string): string {
  return baseDoNome(data, mapaId) + ".md";
}

/** `[frente, corpo]`. Sem front matter, o arquivo inteiro é corpo. */
export function separar(conteudo: string): [string, string] {
  if (!conteudo.startsWith("---\n")) return ["", conteudo];
  const fim = conteudo.indexOf("\n---\n", 3);
  if (fim < 0) return ["", conteudo];
  return [conteudo.slice(0, fim + 5), conteudo.slice(fim + 5)];
}

const RE_CAMPO = new RegExp(`^([A-Za-z0-9_-]+):${S}*(.*?)${S}*$`);

/** As chaves `chave: valor` de primeiro nível do front matter. Só o que o pouso precisa. */
export function lerFrontMatter(conteudo: string): Record<string, string> {
  const [fm] = separar(conteudo);
  const campos: Record<string, string> = {};
  for (const linha of splitlines(fm)) {
    const m = RE_CAMPO.exec(linha);
    if (m) Object.defineProperty(campos, m[1], { value: m[2], enumerable: true, writable: true, configurable: true });
  }
  return campos;
}

export function shaCorpo(corpo: string): Promise<string> {
  return sha256Hex(corpo);
}

export class CenaInvalida extends Error {}

/** A cena que desceu é uma cena do Excalidraw? `CenaInvalida` se não for. */
export function conferirCena(bruto: Uint8Array | ArrayBuffer): ValorPy {
  let texto: string;
  try {
    texto = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bruto);
  } catch (e) {
    throw new CenaInvalida(T().cenaNaoUtf8((e as Error).message));
  }
  let cena: ValorPy;
  try {
    cena = lerJson(texto);
  } catch (e) {
    if (e instanceof JsonInvalido) throw new CenaInvalida(T().cenaNaoJson(e.message));
    throw e;
  }
  const tipo = obter(cena, "type");
  const elementos = obter(cena, "elements");
  if (cena.t !== "obj" || tipo?.t !== "str" || tipo.v !== "excalidraw" || elementos?.t !== "lista") {
    throw new CenaInvalida(T().cenaSemForma);
  }
  return cena;
}

/**
 * O `.excalidraw.md`, no formato que o plugin Excalidraw lê: os textos
 * vivos em `## Text Elements` e a cena aberta em ` ```json `, um valor por linha.
 */
export async function montar(cena: ValorPy, mapaId: string, versao: number): Promise<string> {
  const elementos = obter(cena, "elements");
  const textos = (elementos?.t === "lista" ? elementos.itens : []).filter((e) => {
    if (e.t !== "obj") return false;
    const tipo = obter(e, "type");
    return tipo?.t === "str" && tipo.v === "text" && !verdadeiro(obter(e, "isDeleted")) && verdadeiro(obter(e, "id"));
  });
  const linhas = textos.map((e) => {
    const texto = obter(e, "text");
    return `${texto === undefined ? "" : strPy(texto)} ^${strPy(obter(e, "id")!)}`;
  });
  const corpo =
    AVISO +
    "\n\n# Excalidraw Data\n\n## Text Elements\n" +
    linhas.join("\n\n") +
    "\n%%\n## Drawing\n```json\n" +
    escreverJsonIndent0(cena) +
    "\n```\n%%\n";
  const fm =
    "---\n\n" +
    "excalidraw-plugin: parsed\n" +
    "tags: [excalidraw, mapa-mental, codex]\n" +
    `codex-mapa: ${mapaId}\n` +
    `codex-versao: ${versao}\n` +
    `codex-sha: ${await shaCorpo(corpo)}\n` +
    "\n---\n";
  return fm + corpo;
}

/** O mesmo arquivo com `codex-divergente: {versao}` no front matter. O corpo é intocável. */
export function marcarDivergente(conteudo: string, versao: number): string {
  let [fm, corpo] = separar(conteudo);
  const linha = `codex-divergente: ${versao}\n`;
  if (!fm) return "---\n" + linha + "---\n" + corpo;
  // `[^\n]` e não `.`: o `.` do JS também para em `\r` e U+2028; o do Python, só em `\n`.
  // O `(^|\n)` faz o papel do `^` do Python em MULTILINE sem lookbehind (iOS < 16.4).
  if (/(^|\n)codex-divergente:[^\n]*(?![^\n])/.test(fm)) fm = fm.replace(/(^|\n)codex-divergente:[^\n]*\n/, (_m, frente: string) => frente + linha);
  else fm = fm.slice(0, -"---\n".length) + linha + "---\n";
  return fm + corpo;
}

export type EstadoDoMapa = "ausente" | "desce" | "atual" | "divergente" | "alheio";

/**
 * O que fazer com o arquivo do mapa, dada a versão que o texto cita. A versão
 * vem ANTES do sha: um arquivo editado e já na versão citada não tem o que
 * descer, nem o que marcar.
 */
export async function decidir(existente: string | null, mapaId: string, versao: number): Promise<EstadoDoMapa> {
  if (existente === null) return "ausente";
  const fm = lerFrontMatter(existente);
  if (fm["codex-mapa"] !== mapaId) return "alheio";
  const local = inteiroPy(fm["codex-versao"] ?? "");
  if (local === null) return "alheio";
  if (local >= versao) return "atual";
  const [, corpo] = separar(existente);
  if ((await shaCorpo(corpo)) !== fm["codex-sha"]) return "divergente";
  return "desce";
}

/** `int(texto)` do Python, para o caso que importa: dígitos com sinal e espaços em volta. */
function inteiroPy(texto: string): number | null {
  const m = new RegExp(`^${S}*([-+]?[0-9]+(?:_[0-9]+)*)${S}*$`).exec(texto);
  return m ? Number(m[1].replace(/_/g, "")) : null;
}
