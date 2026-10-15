/**
 * As portas da casca, implementadas sobre a API do Obsidian. Só a API pública
 * (`obsidian.d.ts` da 1.11.4, o `minAppVersion`), e nada de Node: roda no iPad.
 *
 * A regra da escrita (spec 26 §4.6, G2): nota se grava por `app.vault.process`
 * (ler-modificar-gravar atômico dentro do Obsidian), arquivo novo por
 * `vault.create`/`createBinary`, nunca pelo `adapter` direto. A exceção são os
 * caminhos com pasta oculta (`.lixeira/`), que o índice do vault não enxerga e
 * só o `adapter` alcança — e as cópias, que moram na pasta do plugin.
 *
 * Nada aqui apaga arquivo do vault (I12): não há `vault.delete`, `vault.trash`
 * nem `adapter.remove`. O único `rmdir` é o da retenção das cópias, dentro de
 * `.obsidian/plugins/lareia-write-reflect/copias/`.
 */

import { Notice, Platform, TFile, TFolder, moment, normalizePath, parseFrontMatterAliases, requestUrl, type App } from "obsidian";
import type { Disco, Entrada, Tipo } from "../nucleo/disco.ts";
import { paiDe } from "../nucleo/py.ts";
import { semRepetidos } from "../nucleo/titulos.ts";
import type { Ambiente, ArmazemDeAjustes, Cofre, ConfigDaDaily, Copias, Local, Pedido, Rede, Resposta } from "../casca/portas.ts";
import { T } from "../nucleo/textos.ts";

const oculto = (c: string) => c.split("/").some((p) => p.startsWith("."));
const nome = (c: string) => c.slice(c.lastIndexOf("/") + 1);

export class DiscoDoObsidian implements Disco {
  private app: App;
  constructor(app: App) {
    this.app = app;
  }

  private get vault() {
    return this.app.vault;
  }

  async tipo(c: string): Promise<Tipo | null> {
    if (c === "") return "pasta";
    const f = this.vault.getAbstractFileByPath(c);
    if (f instanceof TFile) return "arquivo";
    if (f instanceof TFolder) return "pasta";
    const s = await this.vault.adapter.stat(c);
    return s ? (s.type === "file" ? "arquivo" : "pasta") : null;
  }

  async lerTexto(c: string): Promise<string | null> {
    const f = this.vault.getFileByPath(c);
    if (f) return this.vault.read(f);
    const s = await this.vault.adapter.stat(c);
    return s?.type === "file" ? this.vault.adapter.read(c) : null;
  }

  async tamanho(c: string): Promise<number | null> {
    const f = this.vault.getFileByPath(c);
    if (f) return f.stat.size;
    const s = await this.vault.adapter.stat(c);
    return s?.type === "file" ? s.size : null;
  }

  async listar(pasta: string): Promise<Entrada[]> {
    if ((await this.tipo(pasta)) !== "pasta") return [];
    const l = await this.vault.adapter.list(pasta === "" ? "/" : pasta);
    return [...l.files.map((c) => ({ nome: nome(c), pasta: false })), ...l.folders.map((c) => ({ nome: nome(c), pasta: true }))];
  }

  async criarTexto(c: string, texto: string): Promise<void> {
    await this.criarPasta(paiDe(c));
    if (oculto(c)) {
      if (await this.vault.adapter.exists(c)) throw new Error(T().jaExiste(c));
      await this.vault.adapter.write(c, texto);
    } else {
      await this.vault.create(c, texto);
    }
  }

  async processar(c: string, fn: (atual: string) => string): Promise<string> {
    const f = this.vault.getFileByPath(c);
    if (f) return this.vault.process(f, fn);
    if (!oculto(c)) throw new Error(T().naoExiste(c));
    return this.vault.adapter.process(c, fn);
  }

  async gravarBinario(c: string, bytes: Uint8Array): Promise<void> {
    const dados = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const f = this.vault.getFileByPath(c);
    if (f) return this.vault.modifyBinary(f, dados);
    await this.criarPasta(paiDe(c));
    if (oculto(c)) await this.vault.adapter.writeBinary(c, dados);
    else await this.vault.createBinary(c, dados);
  }

  async criarPasta(c: string): Promise<void> {
    if (!c) return;
    const partes = c.split("/");
    for (let i = 1; i <= partes.length; i++) {
      const p = partes.slice(0, i).join("/");
      if (await this.vault.adapter.exists(p)) continue;
      if (oculto(p)) await this.vault.adapter.mkdir(p);
      else await this.vault.createFolder(p);
    }
  }

  async mover(de: string, para: string): Promise<void> {
    if ((await this.tipo(para)) !== null) throw new Error(T().destinoExiste(para));
    await this.criarPasta(paiDe(para));
    const f = this.vault.getAbstractFileByPath(de);
    // `vault.rename` e não `fileManager.renameFile`: o agente não reescreve os
    // links dos outros arquivos ao renomear um fólio, e o plugin também não.
    if (f && !oculto(para)) await this.vault.rename(f, para);
    else await this.vault.adapter.rename(de, para);
  }
}

export class RedeDoObsidian implements Rede {
  async pedir(p: Pedido): Promise<Resposta> {
    // `requestUrl`: sem CORS, e o mesmo no desktop e no mobile.
    const r = await requestUrl({ url: p.url, method: p.metodo, headers: p.cabecalhos, body: p.corpo, throw: false });
    let texto = "";
    try {
      texto = r.text;
    } catch {
      texto = "";
    }
    return { status: r.status, texto, bytes: new Uint8Array(r.arrayBuffer ?? new ArrayBuffer(0)) };
  }
}

/**
 * O SecretStorage (≥ 1.11.4): `app.secretStorage.setSecret / getSecret`. Ele
 * não sincroniza com o vault — é por isso que a chave mora aqui e o `data.json`
 * guarda só o nome. Não há `deleteSecret` na API: esquecer é gravar vazio, e
 * vazio conta como ausente.
 */
export class CofreDoObsidian implements Cofre {
  private app: App;
  constructor(app: App) {
    this.app = app;
  }
  ler(n: string): string | null {
    return this.app.secretStorage.getSecret(n) || null;
  }
  gravar(n: string, v: string): void {
    this.app.secretStorage.setSecret(n, v);
  }
  esquecer(n: string): void {
    this.app.secretStorage.setSecret(n, "");
  }
}

/** O `localStorage` do vault: o que é deste aparelho (o ensaio pendente, o último hash dos títulos). */
export class LocalDoObsidian implements Local {
  private app: App;
  constructor(app: App) {
    this.app = app;
  }
  ler<T>(c: string): T | null {
    return (this.app.loadLocalStorage(`lareia-write-reflect:${c}`) as T) ?? null;
  }
  gravar(c: string, v: unknown): void {
    this.app.saveLocalStorage(`lareia-write-reflect:${c}`, v ?? null);
  }
}

/** G1: `.obsidian/plugins/lareia-write-reflect/copias/{carimbo}/{caminho}`, sete dias. */
export class CopiasDoObsidian implements Copias {
  private app: App;
  private pasta: string;
  constructor(app: App, idDoPlugin: string) {
    this.app = app;
    this.pasta = normalizePath(`${app.vault.configDir}/plugins/${idDoPlugin}/copias`);
  }

  private async garantir(c: string) {
    const partes = c.split("/");
    for (let i = 1; i <= partes.length; i++) {
      const p = partes.slice(0, i).join("/");
      if (!(await this.app.vault.adapter.exists(p))) await this.app.vault.adapter.mkdir(p);
    }
  }

  async guardar(carimbo: string, caminho: string, texto: string): Promise<void> {
    const destino = normalizePath(`${this.pasta}/${carimbo}/${caminho}`);
    await this.garantir(paiDe(destino));
    await this.app.vault.adapter.write(destino, texto);
  }

  async podar(corte: Date): Promise<void> {
    if (!(await this.app.vault.adapter.exists(this.pasta))) return;
    const { folders } = await this.app.vault.adapter.list(this.pasta);
    for (const f of folders) {
      const m = /(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})$/.exec(f);
      // Pasta com nome que não é carimbo não foi criada aqui: não se apaga o que não se reconhece.
      if (!m || !f.startsWith(this.pasta + "/")) continue;
      const quando = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
      if (quando < corte) await this.app.vault.adapter.rmdir(f, true);
    }
  }
}

export class AmbienteDoObsidian implements Ambiente {
  private app: App;
  constructor(app: App) {
    this.app = app;
  }
  nomeDoVault() {
    return this.app.vault.getName();
  }
  nomeDoAparelho() {
    if (Platform.isIosApp) return Platform.isTablet ? T().oIpad : T().oIphone;
    if (Platform.isAndroidApp) return Platform.isTablet ? T().oTabletAndroid : T().oAndroid;
    if (Platform.isMacOS) return T().oMac;
    if (Platform.isWin) return T().oWindows;
    if (Platform.isLinux) return T().oLinux;
    return T().esteAparelho;
  }
  async configDaDaily(): Promise<Partial<ConfigDaDaily> | null> {
    // O arquivo do plugin nativo, e não `app.internalPlugins` (API privada).
    try {
      const j = JSON.parse(await this.app.vault.adapter.read(normalizePath(`${this.app.vault.configDir}/daily-notes.json`))) as {
        folder?: string;
        format?: string;
        template?: string;
      } | null;
      return { pasta: j?.folder ?? "", formato: j?.format ?? "", modelo: j?.template ?? "" };
    } catch {
      return null;
    }
  }
  pastaDeConfiguracao(): string {
    return this.app.vault.configDir;
  }
  formatarData(dataIso: string, formato: string, agora?: Date): string {
    // O `moment` que o Obsidian já traz (e que o Daily Notes usa para o nome do arquivo).
    const m = moment as unknown as (v: unknown, f?: string) => { format(f: string): string };
    return agora ? m(agora).format(formato) : m(dataIso, "YYYY-MM-DD").format(formato);
  }
  async pastaDeAnexos(nomeDoArquivo: string, nota: string): Promise<string> {
    // O caminho «disponível» ganha um sufixo quando o arquivo já existe; a
    // pasta é a mesma, e é ela que interessa (o nome é o do embed).
    return paiDe(await this.app.fileManager.getAvailablePathForAttachment(nomeDoArquivo, nota));
  }
  /**
   * As notas e os apelidos que o Obsidian já parseou: `metadataCache` +
   * `parseFrontMatterAliases`, sem ler arquivo. Cache nulo (a nota ainda não
   * foi indexada) vai sem `apelidos`, e só essa a rodada lê.
   */
  async notas() {
    return this.app.vault.getMarkdownFiles().map((f) => {
      const cache = this.app.metadataCache.getFileCache(f);
      return cache === null
        ? { caminho: f.path, mtime: f.stat.mtime }
        : { caminho: f.path, mtime: f.stat.mtime, apelidos: semRepetidos(parseFrontMatterAliases(cache.frontmatter ?? null) ?? []) };
    });
  }
  agora() {
    return new Date();
  }
}

export class ArmazemDoPlugin implements ArmazemDeAjustes {
  private plugin: { loadData(): Promise<unknown>; saveData(d: unknown): Promise<void> };
  constructor(plugin: { loadData(): Promise<unknown>; saveData(d: unknown): Promise<void> }) {
    this.plugin = plugin;
  }
  carregar() {
    return this.plugin.loadData();
  }
  gravar(d: unknown) {
    return this.plugin.saveData(d);
  }
}

export function avisar(mensagem: string) {
  new Notice(mensagem, 8000);
}
