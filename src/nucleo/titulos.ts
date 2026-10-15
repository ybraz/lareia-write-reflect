/**
 * O índice de títulos do vault — o porte do agente anterior (spec 12 §12.1).
 *
 * O `[[` do editor da Lareia precisa saber que notas existem, e só o vault sabe.
 * `[{n, c, a}]`: nome sem `.md`, caminho relativo sem `.md`, `aliases` do front
 * matter. Sobe ao servidor SÓ com o ajuste `titulos` ligado (I15): manda os
 * nomes de todas as notas, e isso é escolha de quem usa o vault.
 *
 * As pastas puladas são por NOME, em qualquer profundidade — no agente, uma
 * constante (`EXCLUIDOS`); aqui, o ajuste `pastasSemTitulos`. As pastas ocultas
 * (`.git`, `.obsidian`, `.trash`…) o Obsidian nem lista, então ficam de fora
 * de qualquer jeito. O front matter não passa por parser de YAML: lê-se uma
 * chave só, nas formas que o Obsidian também lê.
 */

import { S, compararPontos, splitEspacos, strip } from "./py.ts";
import { sha256Hex } from "./sha.ts";

/**
 * As pastas puladas por padrão: as técnicas. A de configuração do vault não
 * está aqui porque a rodada a acrescenta pelo nome que o vault usa.
 */
export const PASTAS_SEM_TITULOS_PADRAO = [".git", ".lixeira", ".trash", "node_modules"];

/** O agente lê só o começo do arquivo: front matter que não fecha aqui não tem apelido. */
export const CABECA_BYTES = 64 * 1024;

export interface Titulo {
  n: string;
  c: string;
  a: string[];
}

function tirarAspas(v: string): string {
  v = strip(v);
  if (v.length >= 2 && v[0] === v[v.length - 1] && (v[0] === '"' || v[0] === "'")) return v.slice(1, -1);
  return v;
}

/** `[a, "b, c", 'd']` → `["a", "b, c", "d"]`. Vírgula dentro de aspas não parte. */
function listaInline(valor: string): string[] {
  const fim = valor.lastIndexOf("]");
  const miolo = valor.slice(1, fim > 0 ? fim : valor.length);
  const itens: string[] = [];
  let atual = "";
  let aspas: string | null = null;
  for (const ch of miolo) {
    if (aspas) {
      if (ch === aspas) aspas = null;
      atual += ch;
    } else if ((ch === '"' || ch === "'") && !strip(atual)) {
      aspas = ch;
      atual += ch;
    } else if (ch === ",") {
      itens.push(atual);
      atual = "";
    } else {
      atual += ch;
    }
  }
  itens.push(atual);
  return itens.map(tirarAspas);
}

// O `\s` do Python (`S`), e não a classe escrita à mão: são os mesmos
// caracteres, mas a mão tinha os separadores Unicode crus no fonte (U+2000…).
const RE_ITEM_DE_BLOCO = new RegExp(`^${S}*-${S}+([^\\n]*)$`);
const RE_CHAVE = new RegExp(`^aliases${S}*:([^\\n]*)$`);

/** Os `aliases` do front matter, nas três formas que o Obsidian lê. Fora dele, nada conta. */
export function aliasesDe(texto: string): string[] {
  const linhas = texto.replaceAll("\r\n", "\n").split("\n");
  if (!linhas.length || strip(linhas[0]) !== "---") return [];
  let fim = -1;
  for (let i = 1; i < linhas.length; i++) {
    const l = strip(linhas[i]);
    if (l === "---" || l === "...") {
      fim = i;
      break;
    }
  }
  if (fim < 0) return [];
  const fm = linhas.slice(1, fim);

  let achados: string[] = [];
  for (let i = 0; i < fm.length; i++) {
    const m = RE_CHAVE.exec(fm[i]);
    if (!m) continue;
    const valor = strip(m[1]);
    if (valor.startsWith("[")) achados = listaInline(valor);
    else if (valor) achados = [tirarAspas(valor)];
    else {
      for (const seguinte of fm.slice(i + 1)) {
        const item = RE_ITEM_DE_BLOCO.exec(seguinte);
        if (item) achados.push(tirarAspas(item[1]));
        else if (strip(seguinte)) break; // a próxima chave: a lista acabou
      }
    }
    break;
  }
  const vistos = new Set<string>();
  return achados.filter((a) => a && !vistos.has(a) && (vistos.add(a), true));
}

/** O começo do arquivo, como o agente o lê: 64 KiB de bytes, o resto cortado. */
export function cabeca(texto: string): string {
  if (texto.length * 3 <= CABECA_BYTES) return texto; // cabe com certeza
  const bytes = new TextEncoder().encode(texto);
  if (bytes.length <= CABECA_BYTES) return texto;
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, CABECA_BYTES));
}

/** As notas do vault, em ordem de caminho (ponto de código, como o `sorted` do Python). */
/**
 * Os apelidos que o Obsidian mostra, a partir do front matter que ele já
 * parseou — o `parseFrontMatterAliases` da 1.14.4, lido no app: a primeira
 * chave que casa /^aliases$/i; texto vira [texto.trim()]; lista fica só com os
 * textos, aparados e não vazios. Mais a deduplicação do agente. É o porte, para
 * fora do Obsidian e para os testes; no Obsidian a casca chama a função dele.
 */
export function apelidosDoFrontMatter(fm: Record<string, unknown> | null | undefined): string[] {
  if (!fm) return [];
  const chave = Object.keys(fm).find((k) => /^aliases$/i.test(k));
  const v = chave === undefined ? null : fm[chave];
  const itens = typeof v === "string" ? [v.trim()] : Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim()) : [];
  return semRepetidos(itens);
}

/** Tira o vazio e o repetido, guardando a ordem — o que o agente faz com os apelidos. */
export function semRepetidos(itens: string[]): string[] {
  const vistos = new Set<string>();
  return itens.filter((a) => a && !vistos.has(a) && (vistos.add(a), true));
}

/**
 * As notas → o índice. Cada nota traz os `apelidos` já sabidos (o caminho do
 * Obsidian, sem ler o arquivo) ou o `texto`, de onde se tira a cabeça (o do agente).
 */
export function montarIndice(arquivos: { caminho: string; texto?: string; apelidos?: string[] }[], pastasSemTitulos: string[]): Titulo[] {
  const puladas = new Set(pastasSemTitulos);
  const itens: Titulo[] = [];
  for (const { caminho, texto, apelidos } of arquivos) {
    if (!caminho.endsWith(".md")) continue;
    const partes = caminho.split("/");
    if (partes.slice(0, -1).some((p) => puladas.has(p))) continue;
    const nome = partes[partes.length - 1];
    itens.push({ n: nome.slice(0, -3), c: caminho.slice(0, -3), a: apelidos ? semRepetidos(apelidos) : aliasesDe(cabeca(texto ?? "")) });
  }
  return itens.sort((x, y) => compararPontos(x.c, y.c));
}

/** O JSON compacto em UTF-8 — o que o hash mede e o que sobe. */
export function serializar(titulos: Titulo[]): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(titulos.map((t) => ({ n: t.n, c: t.c, a: t.a }))));
}

export const hashDoIndice = (titulos: Titulo[]) => sha256Hex(serializar(titulos));

// Só para quem pesa o índice no ensaio.
export const palavras = (texto: string) => splitEspacos(texto).length;
