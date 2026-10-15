/**
 * Dois embrulhos do vault: o do ensaio (G4) e o das cópias (G1).
 *
 * **O ensaio roda a rodada de verdade sobre um vault de mentira.** Em vez de um
 * caminho de código «se for ensaio, só imprima» em cada passo — que é onde o
 * ensaio do agente diverge da escrita (a renomeação do caderno não acontece, e
 * o fólio seguinte é lido no nome velho) —, a mesma rodada roda contra uma
 * camada por cima do vault: lê do vault, escreve na camada. O diff do ensaio
 * é a camada contra o vault, e é exatamente o que a escrita faria. Nada de
 * rede com efeito: a casca não dá ack nem sobe nada no ensaio.
 *
 * **As cópias** guardam o arquivo como estava antes de o plugin tocar nele, em
 * `.obsidian/plugins/lareia-write-reflect/copias/{carimbo}/`, com retenção de 7
 * dias. É a G1 da 05, fora das notas.
 */

import type { Disco, Entrada, Tipo } from "../nucleo/disco.ts";
import { diffUnificado } from "../nucleo/diff.ts";
import { paiDe } from "../nucleo/py.ts";
import { T } from "../nucleo/textos.ts";
import type { Copias, Mudanca } from "./portas.ts";

const dentro = (c: string, pasta: string) => c === pasta || c.startsWith(pasta + "/");
const DECODIFICADOR = new TextDecoder();

export class DiscoDeEnsaio implements Disco {
  private base: Disco;
  private escritos = new Map<string, string | Uint8Array>();
  private pastasNovas = new Set<string>();
  /** Movimentos, em ordem: ler `para/x` é ler `de/x` no vault; `de` some. */
  private movidos: [string, string][] = [];
  private registro: Mudanca[] = [];
  private originais = new Map<string, string | null>();

  constructor(base: Disco) {
    this.base = base;
  }

  /** O que a escrita faria, em ordem. Vazio = nada a mudar. */
  mudancas(): Mudanca[] {
    return this.registro.map((m) => {
      if (m.tipo !== "criar" && m.tipo !== "editar") return m;
      const atual = this.escritos.get(m.caminho);
      const depois = typeof atual === "string" ? atual : "";
      return { ...m, diff: diffUnificado(this.originais.get(m.caminho) ?? "", depois, m.caminho) };
    }).filter((m) => m.tipo !== "editar" || m.diff);
  }

  /** O caminho no vault de onde vem o que está em `c` na camada; `null` se sumiu. */
  private origem(c: string): string | null {
    for (let i = this.movidos.length - 1; i >= 0; i--) {
      const [de, para] = this.movidos[i];
      if (dentro(c, para)) c = de + c.slice(para.length);
      else if (dentro(c, de)) return null;
    }
    return c;
  }

  async tipo(c: string): Promise<Tipo | null> {
    if (this.escritos.has(c)) return "arquivo";
    if (this.pastasNovas.has(c) || [...this.escritos.keys()].some((k) => k.startsWith(c + "/"))) return "pasta";
    const o = this.origem(c);
    return o === null ? null : this.base.tipo(o);
  }

  async lerTexto(c: string): Promise<string | null> {
    const v = this.escritos.get(c);
    if (v !== undefined) return typeof v === "string" ? v : DECODIFICADOR.decode(v);
    const o = this.origem(c);
    return o === null ? null : this.base.lerTexto(o);
  }

  async tamanho(c: string): Promise<number | null> {
    const v = this.escritos.get(c);
    if (v !== undefined) return typeof v === "string" ? new TextEncoder().encode(v).length : v.byteLength;
    const o = this.origem(c);
    return o === null ? null : this.base.tamanho(o);
  }

  async listar(pasta: string): Promise<Entrada[]> {
    const nomes = new Map<string, boolean>();
    const o = this.origem(pasta);
    if (o !== null) {
      for (const e of await this.base.listar(o)) {
        const c = pasta ? `${pasta}/${e.nome}` : e.nome;
        if ((await this.tipo(c)) !== null) nomes.set(e.nome, e.pasta);
      }
    }
    const prefixo = pasta ? pasta + "/" : "";
    for (const k of [...this.escritos.keys(), ...this.pastasNovas]) {
      if (!k.startsWith(prefixo) || k === pasta) continue;
      const resto = k.slice(prefixo.length);
      const nome = resto.split("/")[0];
      nomes.set(nome, resto.includes("/") || this.pastasNovas.has(prefixo + nome));
    }
    return [...nomes].map(([nome, p]) => ({ nome, pasta: p }));
  }

  private async lembrarOriginal(c: string) {
    if (!this.originais.has(c)) this.originais.set(c, await this.lerTexto(c));
  }

  async criarTexto(c: string, texto: string): Promise<void> {
    if ((await this.tipo(c)) !== null) throw new Error(T().jaExiste(c));
    await this.lembrarOriginal(c);
    this.escritos.set(c, texto);
    this.registro.push({ tipo: "criar", caminho: c });
  }

  async processar(c: string, fn: (atual: string) => string): Promise<string> {
    const atual = await this.lerTexto(c);
    if (atual === null) throw new Error(T().naoExiste(c));
    await this.lembrarOriginal(c);
    const novo = fn(atual);
    this.escritos.set(c, novo);
    if (!this.registro.some((m) => m.caminho === c && (m.tipo === "editar" || m.tipo === "criar"))) this.registro.push({ tipo: "editar", caminho: c });
    return novo;
  }

  async gravarBinario(c: string, bytes: Uint8Array): Promise<void> {
    this.escritos.set(c, bytes);
    this.registro.push({ tipo: "binario", caminho: c });
  }

  async criarPasta(c: string): Promise<void> {
    if ((await this.tipo(c)) === "pasta") return;
    for (let p = c; p; p = paiDe(p)) this.pastasNovas.add(p);
    this.registro.push({ tipo: "pasta", caminho: c });
  }

  async mover(de: string, para: string): Promise<void> {
    if ((await this.tipo(para)) !== null) throw new Error(T().destinoExiste(para));
    if ((await this.tipo(de)) === null) throw new Error(T().naoExiste(de));
    // O que já foi escrito na camada sob `de` muda de lugar junto.
    for (const k of [...this.escritos.keys()]) {
      if (dentro(k, de)) {
        this.escritos.set(para + k.slice(de.length), this.escritos.get(k)!);
        this.escritos.delete(k);
      }
    }
    this.movidos.push([de, para]);
    this.registro.push({ tipo: "mover", caminho: de, para });
  }
}

/** G1: a cópia do arquivo antes de o plugin tocar nele, uma pasta por rodada. */
export class DiscoComCopias implements Disco {
  private base: Disco;
  private copias: Copias;
  private carimbo: string;
  private copiados = new Set<string>();

  constructor(base: Disco, copias: Copias, carimbo: string) {
    this.base = base;
    this.copias = copias;
    this.carimbo = carimbo;
  }

  tipo(c: string) { return this.base.tipo(c); }
  lerTexto(c: string) { return this.base.lerTexto(c); }
  tamanho(c: string) { return this.base.tamanho(c); }
  listar(p: string) { return this.base.listar(p); }
  criarTexto(c: string, t: string) { return this.base.criarTexto(c, t); }
  gravarBinario(c: string, b: Uint8Array) { return this.base.gravarBinario(c, b); }
  criarPasta(c: string) { return this.base.criarPasta(c); }
  mover(de: string, para: string) { return this.base.mover(de, para); }

  async processar(c: string, fn: (atual: string) => string): Promise<string> {
    if (!this.copiados.has(c)) {
      const atual = await this.base.lerTexto(c);
      // A cópia vai ANTES da escrita, e uma cópia que falha segura a escrita.
      if (atual !== null) await this.copias.guardar(this.carimbo, c, atual);
      this.copiados.add(c);
    }
    return this.base.processar(c, fn);
  }
}


/**
 * I12 por construção: o vault que a rodada enxerga só aceita escrita nas
 * pastas dos ajustes. Um caminho fora — um destino de caderno que escapasse do
 * freio 1, um formato de data torto, um anexo resolvido para longe — levanta
 * antes de tocar em qualquer coisa. As cópias (G1) não passam por aqui: moram
 * na pasta do plugin, pela porta própria.
 */
export class DiscoCercado implements Disco {
  private base: Disco;
  private pastas: Set<string>;

  constructor(base: Disco, pastas: string[]) {
    this.base = base;
    this.pastas = new Set(pastas.map((p) => p.replace(/^\/+|\/+$/g, "")));
  }

  /** Uma pasta a mais (a de anexos, que o Obsidian resolve nota a nota). */
  permitir(pasta: string) {
    this.pastas.add(pasta.replace(/^\/+|\/+$/g, ""));
  }

  private conferir(caminho: string) {
    const ok = [...this.pastas].some((p) => p === "" || caminho === p || caminho.startsWith(p + "/"));
    if (!ok || caminho.split("/").includes("..")) {
      throw new Error(T().foraDasPastas(caminho, [...this.pastas].map((p) => p || T().raiz).join(", ")));
    }
  }

  tipo(c: string) { return this.base.tipo(c); }
  lerTexto(c: string) { return this.base.lerTexto(c); }
  tamanho(c: string) { return this.base.tamanho(c); }
  listar(p: string) { return this.base.listar(p); }
  async criarTexto(c: string, t: string) { this.conferir(c); return this.base.criarTexto(c, t); }
  async processar(c: string, fn: (atual: string) => string) { this.conferir(c); return this.base.processar(c, fn); }
  async gravarBinario(c: string, b: Uint8Array) { this.conferir(c); return this.base.gravarBinario(c, b); }
  async criarPasta(c: string) { this.conferir(c); return this.base.criarPasta(c); }
  async mover(de: string, para: string) { this.conferir(de); this.conferir(para); return this.base.mover(de, para); }
}
