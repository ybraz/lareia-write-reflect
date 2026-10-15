/**
 * A nota de registro — a forma do registro do agente anterior.
 *
 * Um arquivo por mês, `{pasta}/{YYYY-MM}.md`, uma linha por efeito. RODADA SEM
 * EFEITO NÃO ESCREVE NADA: um registro que anota silêncio a cada dez minutos
 * deixa de ser lido. A deduplicação é por linha inteira, e basta porque cada
 * linha carrega o id do que a originou (a data e a versão).
 */

import { juntar, rstripChars } from "./py.ts";
import { T } from "./textos.ts";

/** O cabeçalho de um mês novo, na língua do plugin (é relatório, não contrato: `textos.ts`). */
export const cabecalhoDoRegistro = () => T().cabecalhoDoRegistro;

const dois = (n: number) => String(n).padStart(2, "0");

export function caminhoDoMes(pasta: string, quando: Date): string {
  return juntar(pasta, `${quando.getFullYear()}-${dois(quando.getMonth() + 1)}.md`);
}

/** O arquivo do mês com as linhas que ainda não estão nele; `null` se não há o que acrescentar. */
export function acrescentar(atual: string | null, linhas: string[], cabecalho = cabecalhoDoRegistro()): string | null {
  if (!linhas.length) return null;
  const base = atual ?? cabecalho;
  const novas = linhas.filter((l) => !base.includes(l));
  if (!novas.length) return null;
  return rstripChars(base, "\n") + "\n" + novas.join("\n") + "\n";
}
