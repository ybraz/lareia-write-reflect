/**
 * A conversa com a API da Lareia — as rotas `/vault/*` do contrato do plano
 * (`docs/planos/2026-10-15-o-vault-de-cada-um.md`).
 *
 * A credencial é a chave do aparelho `cdx1.{id}.{segredo}`, de porta `vault`,
 * no cabeçalho `Authorization: Chave …`. Ela vem do cofre a cada chamada e não
 * passa por mais lugar nenhum: nem ajustes, nem registro, nem mensagem de erro.
 * O código de pareamento só atravessa `parear`, e morre no uso.
 */

import type { Rede, Resposta } from "./portas.ts";
import type { AckDoCaderno, Caderno } from "../nucleo/pouso.ts";
import type { Titulo } from "../nucleo/titulos.ts";

/** 401 `CHAVE_RECUSADA`: a chave foi revogada (ou é de outra porta). O aparelho foi desligado. */
export class ChaveRecusada extends Error {}
/** O pareamento recusou o código: forma torta (400) ou desconhecido, vencido, usado (401). */
export class CodigoRecusado extends Error {
  forma: boolean;
  constructor(mensagem: string, forma: boolean) {
    super(mensagem);
    this.forma = forma;
  }
}
/** Qualquer outra falha: a rodada desiste daquele passo e a seguinte tenta de novo. */
export class FalhaDeRede extends Error {}

export interface ItemPendente {
  data: string;
  texto: string;
  versao: number;
  hashAplicado: string | null;
  hashesAplicados?: string[];
  divergente?: boolean;
}

export interface Pareamento {
  chave: string;
  aparelho: { aparelhoId: string; nome: string; criadoEm?: string };
}

const SEM_CORPO = new Uint8Array();

/** Um objeto JSON da API, ainda sem forma garantida: cada campo se confere no uso. */
type Objeto = Record<string, unknown>;

function lerJsonDe(r: Resposta): Objeto {
  try {
    const v: unknown = r.texto ? JSON.parse(r.texto) : {};
    return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Objeto) : {};
  } catch {
    return {};
  }
}

/** O código de erro da resposta (`{"erro": "CHAVE_RECUSADA"}`), se vier como texto. */
const erroDe = (j: Objeto): string | undefined => (typeof j.erro === "string" ? j.erro : undefined);

/** Uma lista da resposta; o que não for lista vale como vazia, como o `?? []` de antes. */
const listaDe = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export class ClienteDaApi {
  private rede: Rede;
  private base: string;
  private chave: () => string | null;

  constructor(rede: Rede, base: string, chave: () => string | null) {
    this.rede = rede;
    this.base = base.replace(/\/+$/, "");
    this.chave = chave;
  }

  private async chamar(metodo: "GET" | "POST" | "PUT" | "DELETE", caminho: string, corpo?: unknown): Promise<Objeto> {
    const chave = this.chave();
    if (!chave) throw new ChaveRecusada("este aparelho não está ligado");
    let r: Resposta;
    try {
      r = await this.rede.pedir({
        url: this.base + caminho,
        metodo,
        cabecalhos: { Authorization: `Chave ${chave}`, ...(corpo === undefined ? {} : { "Content-Type": "application/json" }) },
        corpo: corpo === undefined ? undefined : JSON.stringify(corpo),
      });
    } catch (e) {
      throw new FalhaDeRede(`${metodo} ${caminho}: ${(e as Error).message}`);
    }
    if (r.status === 401) throw new ChaveRecusada(erroDe(lerJsonDe(r)) || "CHAVE_RECUSADA");
    if (r.status >= 400) throw new FalhaDeRede(`${metodo} ${caminho}: ${r.status} ${erroDe(lerJsonDe(r)) ?? ""}`.trim());
    return lerJsonDe(r);
  }

  /** `POST /vault/parear` — a única chamada sem chave, e a única resposta que traz uma. */
  async parear(codigo: string, nomeDoVault: string): Promise<Pareamento> {
    let r: Resposta;
    try {
      r = await this.rede.pedir({
        url: this.base + "/vault/parear",
        metodo: "POST",
        cabecalhos: { "Content-Type": "application/json" },
        corpo: JSON.stringify({ codigo, nomeDoVault }),
      });
    } catch (e) {
      throw new FalhaDeRede(`POST /vault/parear: ${(e as Error).message}`);
    }
    const j = lerJsonDe(r);
    if (r.status === 400) throw new CodigoRecusado(erroDe(j) || "CODIGO_INVALIDO", true);
    if (r.status === 401) throw new CodigoRecusado(erroDe(j) || "CODIGO_RECUSADO", false);
    if (r.status >= 400) throw new FalhaDeRede(`POST /vault/parear: ${r.status} ${erroDe(j) ?? ""}`.trim());
    const aparelho = j.aparelho as Objeto | null | undefined;
    if (typeof j.chave !== "string" || !aparelho || typeof aparelho !== "object" || typeof aparelho.aparelhoId !== "string") {
      throw new FalhaDeRede("POST /vault/parear: resposta sem a chave");
    }
    return j as unknown as Pareamento;
  }

  async pendentes(): Promise<ItemPendente[]> {
    return listaDe<ItemPendente>((await this.chamar("GET", "/vault/pendentes")).itens);
  }

  /** Escrevi este dia, nesta versão, e o bloco ficou com este hash. */
  async confirmar(data: string, versao: number, hash: string): Promise<void> {
    await this.chamar("POST", "/vault/ack", { data, versao, hash });
  }

  /** Parei neste dia: o bloco não é o que o app deixou. O texto do arquivo sobe junto, para a tela mostrar os dois. */
  async marcarDivergente(data: string, textoDoVault: string): Promise<void> {
    await this.chamar("POST", "/vault/ack", { data, divergente: true, textoDoVault });
  }

  async urlDeMidia(chave: string): Promise<string> {
    return (await this.chamar("GET", `/vault/midia/${chave}`)).url as string;
  }

  /** `chave` é `mapas/{data}/{mapaId}/v{n}`; a rota devolve a URL da cena. */
  async urlDoMapa(chave: string): Promise<string> {
    return (await this.chamar("GET", `/vault/${chave}`)).cena as string;
  }

  async cadernos(): Promise<Caderno[]> {
    return listaDe<Caderno>((await this.chamar("GET", "/vault/cadernos")).cadernos);
  }

  async confirmarCaderno(ack: AckDoCaderno): Promise<void> {
    await this.chamar("POST", "/vault/cadernos/ack", ack);
  }

  async enviarTitulos(hash: string, titulos: Titulo[]): Promise<void> {
    await this.chamar("PUT", "/vault/titulos", { hash, titulos });
  }

  async enviarPastas(pastas: string[]): Promise<void> {
    await this.chamar("PUT", "/vault/pastas", { pastas });
  }

  /** `DELETE /vault/ligacao`: o plugin se desliga, revogando a própria chave. */
  async desligar(): Promise<void> {
    await this.chamar("DELETE", "/vault/ligacao");
  }

  /** Os bytes de uma URL assinada (S3). Sem a chave: a URL já é a autorização. */
  async baixar(url: string): Promise<Uint8Array> {
    let r: Resposta;
    try {
      r = await this.rede.pedir({ url, metodo: "GET" });
    } catch (e) {
      throw new FalhaDeRede(`download: ${(e as Error).message}`);
    }
    if (r.status >= 400) throw new FalhaDeRede(`download: ${r.status}`);
    return r.bytes ?? SEM_CORPO;
  }
}

/**
 * O código como a pessoa o digitou → os 8 caracteres que o servidor espera, ou
 * `null` se a forma estiver torta. Base32 de Crockford sem `I L O U`, com ou sem
 * hífen, em qualquer caixa. Conferir aqui poupa uma chamada e diz o erro na hora.
 */
export function normalizarCodigo(bruto: unknown): string | null {
  if (typeof bruto !== "string") return null;
  const c = bruto.replace(/[\s-]/g, "").toUpperCase();
  return /^[0-9A-HJKMNP-TV-Z]{8}$/.test(c) ? c : null;
}
