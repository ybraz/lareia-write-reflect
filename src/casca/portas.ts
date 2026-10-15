/**
 * As portas da casca: o que ela pede ao mundo, sem saber se o mundo é o
 * Obsidian (`src/obsidian/`), um disco com `fetch` (`scripts/`) ou os dublês
 * dos testes. A casca inteira — pareamento, rodada, ensaio, desligar — roda
 * sobre estas interfaces e nada mais.
 */

import type { Disco } from "../nucleo/disco.ts";

export type { Disco };

export interface Pedido {
  url: string;
  metodo: "GET" | "POST" | "PUT" | "DELETE";
  cabecalhos?: Record<string, string>;
  corpo?: string;
}

export interface Resposta {
  status: number;
  texto: string;
  bytes: Uint8Array;
}

/** A rede. No Obsidian, `requestUrl` (sem CORS, roda no mobile), com `throw: false`. */
export interface Rede {
  pedir(p: Pedido): Promise<Resposta>;
}

/** O SecretStorage do Obsidian: guarda a chave, e NÃO sincroniza com o vault. */
export interface Cofre {
  ler(nome: string): string | null;
  gravar(nome: string, valor: string): void;
  /** Esquecer o segredo. (O SecretStorage não tem `delete`: grava-se vazio.) */
  esquecer(nome: string): void;
}

/** O que é deste aparelho e não sincroniza (no Obsidian, o `localStorage` do vault). */
export interface Local {
  ler<T>(chave: string): T | null;
  gravar(chave: string, valor: unknown): void;
}

/** As cópias de antes de tocar (G1), na pasta do plugin, fora das notas. */
export interface Copias {
  guardar(carimbo: string, caminho: string, texto: string): Promise<void>;
  /** Tira as rodadas mais velhas que o corte. Só dentro da pasta das cópias. */
  podar(corte: Date): Promise<void>;
}

export interface ConfigDaDaily {
  pasta: string;
  formato: string;
  modelo: string;
}

/** O resto do Obsidian que a rodada consulta. */
export interface Ambiente {
  nomeDoVault(): string;
  /** «o Mac», «o iPad» — para «quem escreve neste vault é o Mac». */
  nomeDoAparelho(): string;
  /** Os ajustes do plugin nativo Daily Notes, se houver. */
  configDaDaily(): Promise<Partial<ConfigDaDaily> | null>;
  /** `moment(dataIso).format(formato)`. */
  formatarData(dataIso: string, formato: string, agora?: Date): string;
  /** A pasta de anexos do Obsidian para um arquivo que vai junto de `notaDeOrigem`. */
  pastaDeAnexos(nome: string, notaDeOrigem: string): Promise<string>;
  /**
   * As notas `.md` do vault, para o índice de títulos (só com o ajuste ligado).
   * `apelidos`, quando vem, é o que o Obsidian já sabe do front matter (o
   * `metadataCache`): com ele, o índice NÃO lê o arquivo. Sem ele (o cache
   * ainda não resolveu a nota, ou fora do Obsidian), lê-se a cabeça.
   */
  notas(): Promise<{ caminho: string; mtime: number; apelidos?: string[] }[]>;
  agora(): Date;
  /**
   * O nome da pasta de configuração do vault (`Vault#configDir`): `.obsidian`
   * por padrão, mas a pessoa pode escolher outra. O índice de títulos a pula
   * pelo nome que ELA tem.
   */
  pastaDeConfiguracao(): string;
}

export interface Mudanca {
  tipo: "criar" | "editar" | "mover" | "binario" | "pasta" | "baixaria";
  caminho: string;
  para?: string;
  diff?: string;
}

export interface Relatorio {
  ensaio: boolean;
  mudancas: Mudanca[];
  avisos: string[];
  /** Os avisos que viram `Notice` depois de uma rodada que escreve: os que pedem a pessoa. Também estão em `avisos`. */
  alertas: string[];
  dias: number;
  cadernos: number;
  titulos: "desligado" | "igual" | "subiria" | "subiu" | "falhou";
  /** Quantas notas o índice de títulos teve de LER (sem os apelidos do metadataCache). */
  titulosLidos?: number;
}

/** A cara do plugin: avisos e o diff do ensaio. No Obsidian, `Notice` e `Modal`. */
export interface Tela {
  avisar(mensagem: string): void;
  /** Mostra o ensaio. Com `podeAplicar`, devolve se a pessoa escolheu «Aplicar». */
  mostrarEnsaio(r: Relatorio, podeAplicar: boolean): Promise<boolean>;
}

export interface ArmazemDeAjustes {
  carregar(): Promise<unknown>;
  gravar(dados: unknown): Promise<void>;
}
