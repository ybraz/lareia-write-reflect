/**
 * O que o Python faz diferente do JavaScript, nas poucas operações de texto que
 * o agente usa.
 *
 * O plugin tem de escrever OS MESMOS BYTES que o agente anterior escreveria (spec
 * 26 §4.7, I13): é o que deixa quem o usava trocar de escritor sem que a primeira
 * rodada reescreva o passado. E as duas linguagens divergem em lugares que um
 * porte ingênuo não vê:
 *
 *   - o `\s` do `re` do Python é o do Unicode (`str.isspace`): pega o NEL
 *     (U+0085) e os separadores U+001C–U+001F, que o `\s` do JS não pega; o
 *     do JS pega o BOM (U+FEFF), que o do Python não pega;
 *   - o `^`/`$` em MULTILINE do Python só reconhece `\n`; o `m` do JS também
 *     `\r`, U+2028 e U+2029;
 *   - o `\d` e o `\w` do Python são Unicode; os do JS, ASCII;
 *   - `str.strip()` e `str.split()` usam o mesmo conjunto do `\s`;
 *   - `str.splitlines()` quebra em mais lugares que `\n`;
 *   - fatiar e contar é por ponto de código, não por unidade UTF-16;
 *   - `sorted()` de strings compara pontos de código, não unidades UTF-16.
 *
 * Cada função aqui é a do Python, com o nome dela. O corpus
 * (`docs/corpus-do-bloco/`) tem um caso para cada diferença que já mudaria um
 * byte no vault.
 */

/** Os caracteres de `str.isspace()` — o `\s` do `re` do Python. */
export const PY_ESPACOS =
  "\\t\\n\\x0b\\x0c\\r\\x1c\\x1d\\x1e\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";

/** O `\s` do Python, para pôr dentro de um padrão. */
export const S = `[${PY_ESPACOS}]`;
/** O `\d` do Python (Unicode). Exige a flag `u`. */
export const D = "\\p{Nd}";
/** O `\w` do Python (`str.isalnum()` + `_`). Exige a flag `u`. */
export const W = "[\\p{L}\\p{N}_]";
/** O `$` do Python em MULTILINE: fim do texto ou logo antes de `\n`. */
export const FIM_DE_LINHA = "(?![^\\n])";

/**
 * Onde `fonte` casa no começo de uma linha — o `^` do Python em MULTILINE:
 * começo do texto ou logo depois de `\n` (e só de `\n`; o `m` do JS também
 * aceitaria `\r`, U+2028 e U+2029). Devolve o índice de cada casamento, já sem
 * o `\n` da frente, como o `m.start()` do `re.finditer`.
 *
 * Sem lookbehind: o `(?<![^\n])` era a forma direta, mas o JavaScriptCore do
 * iOS anterior ao 16.4 não compila lookbehind, e o plugin não carregaria no
 * iPhone. O `(^|\n)` consome o `\n` da frente, e isso só mudaria o resultado se
 * um casamento terminasse no `\n` de que o seguinte precisa — o que pede uma
 * `fonte` que comece por `\n` ou case vazio; todas as daqui começam por texto.
 */
export function nosInicios(texto: string, fonte: string, flags = ""): number[] {
  const re = new RegExp(`(^|\\n)(?:${fonte})`, flags.replace("g", "") + "g");
  return [...texto.matchAll(re)].map((m) => m.index + m[1].length);
}

const RE_ESPACO = new RegExp(S);
const RE_ESPACOS_NA_PONTA = new RegExp(`^${S}+|${S}+$`, "g");

export function ehEspaco(ch: string): boolean {
  return RE_ESPACO.test(ch);
}

/** `str.strip()` sem argumento. */
export function strip(texto: string): string {
  return texto.replace(RE_ESPACOS_NA_PONTA, "");
}

function escaparClasse(chars: string): string {
  return chars.replace(/[\\\][^-]/g, (c) => `\\${c}`);
}

/** `str.strip(chars)`. */
export function stripChars(texto: string, chars: string): string {
  return lstripChars(rstripChars(texto, chars), chars);
}

/** `str.lstrip(chars)`. */
export function lstripChars(texto: string, chars: string): string {
  return texto.replace(new RegExp(`^[${escaparClasse(chars)}]+`, "u"), "");
}

/** `str.rstrip(chars)`. */
export function rstripChars(texto: string, chars: string): string {
  return texto.replace(new RegExp(`[${escaparClasse(chars)}]+$`, "u"), "");
}

/** `str.split()` sem argumento: quebra em qualquer espaço, sem vazios. */
export function splitEspacos(texto: string): string[] {
  return texto.split(new RegExp(`${S}+`)).filter((p) => p !== "");
}

/**
 * `str.splitlines()`: as fronteiras de linha do Python, que são mais que `\n`.
 * `\r\n` conta como uma; a última linha vazia (depois da quebra final) não entra.
 */
export function splitlines(texto: string): string[] {
  // eslint-disable-next-line no-control-regex -- os separadores de linha do Python incluem os de controle (VT, FF, FS, GS, RS): é o conjunto, não um engano
  const linhas = texto.split(/\r\n|[\n\r\x0b\x0c\x1c\x1d\x1e\x85\u2028\u2029]/);
  if (linhas.length > 0 && linhas[linhas.length - 1] === "") linhas.pop();
  return linhas;
}

/** `len(s)`: pontos de código. */
export function len(texto: string): number {
  // O iterador da string anda por ponto de código; o `length`, por unidade UTF-16.
  return Array.from(texto).length;
}

/** `s[:n]`: os primeiros `n` pontos de código. */
export function fatiar(texto: string, n: number): string {
  if (texto.length <= n) return texto; // atalho: n unidades UTF-16 ≥ n pontos
  let saida = "";
  let i = 0;
  for (const ch of texto) {
    if (i++ >= n) break;
    saida += ch;
  }
  return saida;
}

/** A comparação de `sorted()` entre strings: por ponto de código. */
export function compararPontos(a: string, b: string): number {
  const ia = a[Symbol.iterator]();
  const ib = b[Symbol.iterator]();
  for (;;) {
    const x = ia.next();
    const y = ib.next();
    if (x.done || y.done) return x.done && y.done ? 0 : x.done ? -1 : 1;
    const cx = x.value.codePointAt(0)!;
    const cy = y.value.codePointAt(0)!;
    if (cx !== cy) return cx < cy ? -1 : 1;
  }
}

/** `re.escape`, para o padrão do JS. */
export function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

/** `PurePath(nome).suffix`: do último ponto em diante, se não for o primeiro nem o último caractere. */
export function sufixo(nome: string): string {
  const i = nome.lastIndexOf(".");
  return i > 0 && i < nome.length - 1 ? nome.slice(i) : "";
}

/** `PurePath(nome).stem`. */
export function radical(nome: string): string {
  const s = sufixo(nome);
  return s ? nome.slice(0, -s.length) : nome;
}

/** `PurePath(caminho).name`. */
export function nomeDe(caminho: string): string {
  const partes = caminho.split("/").filter((p) => p !== "");
  return partes.length ? partes[partes.length - 1] : "";
}

/** O pai de um caminho do vault (`""` para a raiz). */
export function paiDe(caminho: string): string {
  const i = caminho.lastIndexOf("/");
  return i < 0 ? "" : caminho.slice(0, i);
}

/** Junta partes de caminho do vault, sem barras dobradas nem barra inicial. */
export function juntar(...partes: string[]): string {
  return partes
    .flatMap((p) => p.split("/"))
    .filter((p) => p !== "")
    .join("/");
}
