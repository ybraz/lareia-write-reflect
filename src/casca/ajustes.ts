/**
 * Os ajustes do plugin — o `data.json` em `.obsidian/plugins/lareia-write-reflect/`.
 *
 * O `data.json` SINCRONIZA com o vault (iCloud, Obsidian Sync, Git): é por ele
 * que os outros aparelhos sabem quem escreve. E por isso ele NUNCA guarda a
 * chave nem o código de pareamento (I9) — só o NOME do segredo, que mora no
 * SecretStorage do Obsidian, que não sincroniza. `normalizar` só deixa passar
 * os campos daqui: um campo estranho que alguém pusesse à mão no arquivo não
 * volta a ser gravado.
 */

import { CABECALHO_PADRAO } from "../nucleo/reflexoes.ts";
import { PASTAS_SEM_TITULOS_PADRAO } from "../nucleo/titulos.ts";

export const ID_DO_PLUGIN = "lareia-write-reflect";
export const API_PADRAO = "https://dwrz2rxcbd.execute-api.sa-east-1.amazonaws.com/v1";

export interface Escritor {
  aparelhoId: string;
  nome: string;
}

export interface Ajustes {
  api: string;
  /** Aleatório, nasce na instalação. Entra no nome do segredo: no mobile o SecretStorage é compartilhado entre vaults. */
  idDoVault: string;
  /** `lareia-{idDoVault}` — o NOME do segredo, nunca o segredo. */
  nomeDoSegredo: string;
  /** Quem escreve neste vault (o aparelho ligado). `null`: ninguém. */
  escritor: Escritor | null;
  modo: "daily" | "arquivo";
  /** Vazio: a pasta do plugin nativo Daily Notes. */
  pastaDaDaily: string;
  /** Vazio: o formato do plugin nativo Daily Notes (ou `YYYY-MM-DD`). */
  formatoDaData: string;
  cabecalho: string;
  criarNota: boolean;
  acrescentarCabecalho: boolean;
  pastaDoArquivo: string;
  /** Vazio: a pasta de anexos do Obsidian. */
  pastaDaMidia: string;
  pastasDosCadernos: string[];
  /** Desligado por padrão: ligar manda ao servidor os nomes de todas as notas (I15). */
  titulos: boolean;
  pastasSemTitulos: string[];
  /** Vazio: sem nota de registro. */
  notaDeRegistro: string;
  intervaloMin: number;
}

export function novoIdDoVault(): string {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function padrao(idDoVault = novoIdDoVault()): Ajustes {
  return {
    api: API_PADRAO,
    idDoVault,
    nomeDoSegredo: `lareia-${idDoVault}`,
    escritor: null,
    modo: "daily",
    pastaDaDaily: "",
    formatoDaData: "",
    cabecalho: CABECALHO_PADRAO,
    criarNota: true,
    acrescentarCabecalho: true,
    pastaDoArquivo: "Lareia",
    pastaDaMidia: "",
    pastasDosCadernos: [],
    titulos: false,
    pastasSemTitulos: [...PASTAS_SEM_TITULOS_PADRAO],
    notaDeRegistro: "",
    intervaloMin: 10,
  };
}

const texto = (v: unknown, p: string) => (typeof v === "string" ? v : p);
const booleano = (v: unknown, p: boolean) => (typeof v === "boolean" ? v : p);
const lista = (v: unknown, p: string[]) => (Array.isArray(v) && v.every((x) => typeof x === "string") ? [...v] : [...p]);
const ID_VALIDO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** O `data.json` como ele está no disco → os ajustes, só com os campos conhecidos. */
export function normalizar(bruto: unknown): { ajustes: Ajustes; mudou: boolean } {
  const b = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const id = typeof b.idDoVault === "string" && ID_VALIDO.test(b.idDoVault) ? b.idDoVault : novoIdDoVault();
  const p = padrao(id);
  const e = b.escritor as Record<string, unknown> | null | undefined;
  const intervalo = typeof b.intervaloMin === "number" && Number.isFinite(b.intervaloMin) ? Math.max(1, Math.round(b.intervaloMin)) : p.intervaloMin;
  const ajustes: Ajustes = {
    api: texto(b.api, p.api) || p.api,
    idDoVault: id,
    // O nome se deriva do id, sempre: um nome editado à mão apontaria para o segredo de outro vault.
    nomeDoSegredo: `lareia-${id}`,
    escritor: e && typeof e.aparelhoId === "string" && typeof e.nome === "string" ? { aparelhoId: e.aparelhoId, nome: e.nome } : null,
    modo: b.modo === "arquivo" ? "arquivo" : "daily",
    pastaDaDaily: texto(b.pastaDaDaily, p.pastaDaDaily),
    formatoDaData: texto(b.formatoDaData, p.formatoDaData),
    cabecalho: texto(b.cabecalho, p.cabecalho) || p.cabecalho,
    criarNota: booleano(b.criarNota, p.criarNota),
    acrescentarCabecalho: booleano(b.acrescentarCabecalho, p.acrescentarCabecalho),
    pastaDoArquivo: texto(b.pastaDoArquivo, p.pastaDoArquivo) || p.pastaDoArquivo,
    pastaDaMidia: texto(b.pastaDaMidia, p.pastaDaMidia),
    pastasDosCadernos: lista(b.pastasDosCadernos, p.pastasDosCadernos),
    titulos: booleano(b.titulos, p.titulos),
    pastasSemTitulos: lista(b.pastasSemTitulos, p.pastasSemTitulos),
    notaDeRegistro: texto(b.notaDeRegistro, p.notaDeRegistro),
    intervaloMin: intervalo,
  };
  const mudou = JSON.stringify(Object.keys(b).sort()) !== JSON.stringify(Object.keys(ajustes).sort()) || b.idDoVault !== id || b.nomeDoSegredo !== ajustes.nomeDoSegredo;
  return { ajustes, mudou };
}
