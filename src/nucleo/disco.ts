/**
 * O vault, visto pelo núcleo: a interface que a casca implementa.
 *
 * O núcleo não importa o `obsidian` — roda no Node dos testes, no Obsidian do
 * iPad e num adaptador de disco fora do Obsidian (`scripts/`), sempre o mesmo
 * código. Os caminhos são os do vault: relativos à raiz, com `/`, sem barra
 * inicial.
 *
 * Não há `apagar` aqui, de propósito (I12): tirar o bloco é editar, apagar
 * fólio é mover para `.lixeira/`. Quem precisasse apagar teria de pedir uma
 * porta nova, e é essa porta que a revisão veria.
 */

export type Tipo = "arquivo" | "pasta";

export interface Entrada {
  nome: string;
  pasta: boolean;
}

export interface Disco {
  tipo(caminho: string): Promise<Tipo | null>;
  /** O texto do arquivo, ou `null` se ele não existe. */
  lerTexto(caminho: string): Promise<string | null>;
  /** O tamanho em bytes, ou `null` se o arquivo não existe. */
  tamanho(caminho: string): Promise<number | null>;
  /** Os filhos imediatos da pasta (`[]` se ela não existe). */
  listar(pasta: string): Promise<Entrada[]>;
  /** Cria o arquivo de texto, e as pastas que faltarem. Falha se ele já existe. */
  criarTexto(caminho: string, texto: string): Promise<void>;
  /** Lê-modifica-grava atômico (no Obsidian, `app.vault.process`). Devolve o que ficou. */
  processar(caminho: string, fn: (atual: string) => string): Promise<string>;
  /** Grava bytes: cria, ou substitui o que está lá. */
  gravarBinario(caminho: string, bytes: Uint8Array): Promise<void>;
  /** Cria a pasta e as que faltarem. Sem efeito se ela já existe. */
  criarPasta(caminho: string): Promise<void>;
  /** Move arquivo ou pasta. Cria o pai do destino; falha se o destino existe. */
  mover(de: string, para: string): Promise<void>;
}

/** Grava texto: cria o arquivo, ou o substitui por `vault.process`. Sem efeito se for igual. */
export async function gravarTexto(disco: Disco, caminho: string, novo: string): Promise<boolean> {
  const atual = await disco.lerTexto(caminho);
  if (atual === null) {
    await disco.criarTexto(caminho, novo);
    return true;
  }
  if (atual === novo) return false;
  await disco.processar(caminho, () => novo);
  return true;
}
