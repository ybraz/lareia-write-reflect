/**
 * As telas do plugin: o pareamento, o ensaio, a confirmação de desligar e a
 * aba de ajustes. Só o que se vê; a decisão é toda do `Controle`.
 */

import { Modal, Notice, PluginSettingTab, Setting, type App } from "obsidian";
import type { Plugin } from "obsidian";
import type { Controle } from "../casca/controle.ts";
import type { Relatorio, Tela } from "../casca/portas.ts";
import { T } from "../nucleo/textos.ts";

/** O código de pareamento. Ele não se guarda em lugar nenhum: o campo some com o modal. */
export class ModalDePareamento extends Modal {
  private aoLigar: (codigo: string) => Promise<unknown>;
  constructor(app: App, aoLigar: (codigo: string) => Promise<unknown>) {
    super(app);
    this.aoLigar = aoLigar;
  }

  onOpen() {
    const { contentEl } = this;
    this.setTitle(T().pareamentoTitulo);
    contentEl.createEl("p", { text: T().pareamentoTexto });
    let codigo = "";
    new Setting(contentEl).setName(T().pareamentoCampo).addText((t) =>
      t.setPlaceholder(T().pareamentoExemplo).onChange((v) => {
        codigo = v;
      }),
    );
    new Setting(contentEl).addButton((b) =>
      b
        .setButtonText(T().pareamentoBotao)
        .setCta()
        .onClick(async () => {
          this.close();
          await this.aoLigar(codigo);
        }),
    );
  }

  onClose() {
    this.contentEl.empty();
  }
}

/** O ensaio: o diff do que a rodada faria. Com «Aplicar» só na primeira rodada depois do pareamento. */
export class ModalDeEnsaio extends Modal {
  private r: Relatorio;
  private podeAplicar: boolean;
  private resolver: (aplicar: boolean) => void;
  private escolha = false;

  constructor(app: App, r: Relatorio, podeAplicar: boolean, resolver: (aplicar: boolean) => void) {
    super(app);
    this.r = r;
    this.podeAplicar = podeAplicar;
    this.resolver = resolver;
  }

  onOpen() {
    const { contentEl, r } = this;
    this.setTitle(this.podeAplicar ? T().ensaioPrimeiroTitulo : T().ensaioTitulo);
    contentEl.addClass("lareia-ensaio");
    if (this.podeAplicar) {
      contentEl.createEl("p", { text: T().ensaioNadaGravado });
    }
    if (!r.mudancas.length) contentEl.createEl("p", { text: T().ensaioNadaAMudar });
    for (const m of r.mudancas) {
      contentEl.createEl("h4", { text: T().mudanca(m.tipo, m.caminho, m.para) });
      if (m.diff) {
        const pre = contentEl.createEl("pre", { cls: "lareia-diff" });
        for (const linha of m.diff.split("\n")) {
          const cls = linha.startsWith("+") ? "lareia-mais" : linha.startsWith("-") ? "lareia-menos" : "";
          pre.createSpan({ text: linha + "\n", cls });
        }
      }
    }
    if (r.titulos === "subiria") contentEl.createEl("p", { text: T().ensaioTitulosSubiriam });
    if (r.avisos.length) {
      contentEl.createEl("h4", { text: T().ensaioAvisos });
      const ul = contentEl.createEl("ul");
      for (const a of r.avisos) ul.createEl("li", { text: a });
    }
    const botoes = new Setting(contentEl);
    if (this.podeAplicar) {
      botoes.addButton((b) =>
        b
          .setButtonText(T().aplicar)
          .setCta()
          .onClick(() => {
            this.escolha = true;
            this.close();
          }),
      );
    }
    botoes.addButton((b) => b.setButtonText(this.podeAplicar ? T().agoraNao : T().fechar).onClick(() => this.close()));
  }

  onClose() {
    this.contentEl.empty();
    this.resolver(this.escolha);
  }
}

export class ModalDeConfirmacao extends Modal {
  private texto: string;
  private botao: string;
  private aoConfirmar: () => unknown;
  constructor(app: App, texto: string, botao: string, aoConfirmar: () => unknown) {
    super(app);
    this.texto = texto;
    this.botao = botao;
    this.aoConfirmar = aoConfirmar;
  }
  onOpen() {
    this.contentEl.createEl("p", { text: this.texto });
    new Setting(this.contentEl)
      .addButton((b) =>
        b
          .setButtonText(this.botao)
          .setWarning()
          .onClick(() => {
            this.close();
            this.aoConfirmar();
          }),
      )
      .addButton((b) => b.setButtonText(T().cancelar).onClick(() => this.close()));
  }
  onClose() {
    this.contentEl.empty();
  }
}

export class TelaDoObsidian implements Tela {
  private app: App;
  constructor(app: App) {
    this.app = app;
  }
  avisar(mensagem: string) {
    new Notice(mensagem, 8000);
  }
  mostrarEnsaio(r: Relatorio, podeAplicar: boolean): Promise<boolean> {
    return new Promise((resolver) => new ModalDeEnsaio(this.app, r, podeAplicar, resolver).open());
  }
}

const linhas = (v: string) => v.split("\n").map((x) => x.trim()).filter(Boolean);

export interface PluginComControle extends Plugin {
  controle: Controle;
  agendar(): void;
  abrirPareamento(): void;
  confirmarDesligar(): void;
}

/**
 * Todos os campos do `data.json`, menos o segredo — que aqui só aparece pelo nome.
 *
 * Sem `getSettingDefinitions()` (o lint da loja avisa, e a loja não deixa
 * calar o aviso com diretiva): a API declarativa, que põe os ajustes na busca
 * do Obsidian, só existe nos tipos a partir do 1.13, e o plugin pede 1.11.4
 * (o SecretStorage). Escrevê-la sem os tipos, sem um Obsidian 1.13 onde
 * provar, arriscaria a aba inteira de quem está no 1.13; subir a versão
 * mínima deixaria de fora o 1.11 e o 1.12. Fica para quando o mínimo subir.
 */
export class AbaDeAjustes extends PluginSettingTab {
  private plugin: PluginComControle;
  constructor(app: App, plugin: PluginComControle) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    const c = this.plugin.controle;
    const a = c.ajustes;
    const salvar = async () => {
      await c.salvar();
    };
    containerEl.empty();

    // ── Quem escreve ───────────────────────────────────────────────────
    new Setting(containerEl).setName(T().secLigacao).setHeading();
    const estado = c.estado();
    const ligacao = new Setting(containerEl);
    if (estado.tipo === "ligado") {
      ligacao
        .setName(T().ligadoNome(a.escritor ? a.escritor.nome : null))
        .setDesc(T().ligadoDesc(a.nomeDoSegredo))
        .addButton((b) => b.setButtonText(T().botaoSincronizar).setCta().onClick(() => c.sincronizar({ manual: true })))
        .addButton((b) => b.setButtonText(T().botaoEnsaiar).onClick(() => c.ensaiar()))
        .addButton((b) => b.setButtonText(T().botaoDesligarAparelho).setWarning().onClick(() => this.plugin.confirmarDesligar()));
    } else if (estado.tipo === "outro-escreve") {
      ligacao
        .setName(T().outroNome(estado.nome))
        .setDesc(T().outroDesc)
        .addButton((b) => b.setButtonText(T().botaoPassar).onClick(() => this.plugin.abrirPareamento()));
    } else {
      ligacao
        .setName(T().semLigacaoNome)
        .setDesc(T().semLigacaoDesc)
        .addButton((b) => b.setButtonText(T().botaoLigarComCodigo).setCta().onClick(() => this.plugin.abrirPareamento()));
    }

    // ── Os dias ────────────────────────────────────────────────────────
    new Setting(containerEl).setName(T().secDias).setHeading();
    new Setting(containerEl)
      .setName(T().ondeNome)
      .setDesc(T().ondeDesc)
      .addDropdown((d) =>
        d
          .addOption("daily", T().ondeDaily)
          .addOption("arquivo", T().ondeArquivo)
          .setValue(a.modo)
          .onChange(async (v) => {
            a.modo = v === "arquivo" ? "arquivo" : "daily";
            await salvar();
            this.display();
          }),
      );
    if (a.modo === "daily") {
      texto(containerEl, T().pastaDailyNome, T().pastaDailyDesc, a.pastaDaDaily, async (v) => ((a.pastaDaDaily = v), salvar()));
      texto(containerEl, T().formatoNome, T().formatoDesc, a.formatoDaData, async (v) => ((a.formatoDaData = v), salvar()));
      texto(containerEl, T().cabecalhoNome, T().cabecalhoDesc, a.cabecalho, async (v) => ((a.cabecalho = v.trim() || "## Lareia"), salvar()));
      alternar(containerEl, T().criarNotaNome, T().criarNotaDesc, a.criarNota, async (v) => ((a.criarNota = v), salvar()));
      alternar(containerEl, T().acrescentarNome, T().acrescentarDesc, a.acrescentarCabecalho, async (v) => ((a.acrescentarCabecalho = v), salvar()));
    } else {
      texto(containerEl, T().pastaDiasNome, T().pastaDiasDesc, a.pastaDoArquivo, async (v) => ((a.pastaDoArquivo = v.trim() || "Lareia"), salvar()));
    }
    texto(containerEl, T().pastaMidiaNome, T().pastaMidiaDesc, a.pastaDaMidia, async (v) => ((a.pastaDaMidia = v.trim()), salvar()));

    // ── Os cadernos ────────────────────────────────────────────────────
    new Setting(containerEl).setName(T().secCadernos).setHeading();
    area(containerEl, T().pastasCadernosNome, T().pastasCadernosDesc, a.pastasDosCadernos, async (v) => ((a.pastasDosCadernos = v), salvar()));

    // ── Os títulos ─────────────────────────────────────────────────────
    new Setting(containerEl).setName(T().secTitulos).setHeading();
    alternar(
      containerEl,
      T().titulosNome,
      T().titulosDesc,
      a.titulos,
      async (v) => ((a.titulos = v), salvar()),
    );
    area(containerEl, T().semTitulosNome, T().semTitulosDesc, a.pastasSemTitulos, async (v) => ((a.pastasSemTitulos = v), salvar()));

    // ── O resto ────────────────────────────────────────────────────────
    new Setting(containerEl).setName(T().secMais).setHeading();
    texto(containerEl, T().registroNome, T().registroDesc, a.notaDeRegistro, async (v) => ((a.notaDeRegistro = v.trim()), salvar()));
    texto(containerEl, T().intervaloNome, T().intervaloDesc, String(a.intervaloMin), async (v) => {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 1) {
        a.intervaloMin = Math.round(n);
        await salvar();
        this.plugin.agendar();
      }
    });
    texto(containerEl, T().apiNome, T().apiDesc, a.api, async (v) => ((a.api = v.trim()), salvar()));
  }
}

function texto(el: HTMLElement, nome: string, desc: string, valor: string, mudar: (v: string) => Promise<unknown>) {
  new Setting(el).setName(nome).setDesc(desc).addText((t) => t.setValue(valor).onChange((v) => void mudar(v)));
}

function alternar(el: HTMLElement, nome: string, desc: string, valor: boolean, mudar: (v: boolean) => Promise<unknown>) {
  new Setting(el).setName(nome).setDesc(desc).addToggle((t) => t.setValue(valor).onChange((v) => void mudar(v)));
}

function area(el: HTMLElement, nome: string, desc: string, valor: string[], mudar: (v: string[]) => Promise<unknown>) {
  new Setting(el).setName(nome).setDesc(desc).addTextArea((t) => t.setValue(valor.join("\n")).onChange((v) => void mudar(linhas(v))));
}
