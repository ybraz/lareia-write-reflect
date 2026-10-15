/**
 * Lareia Write and Reflect — o plugin do Obsidian que leva o diário da Lareia ao vault
 * (spec 26). Aqui só se liga o `Controle` ao Obsidian: as portas, as telas,
 * os comandos, o link `obsidian://` e o relógio. A decisão mora em `casca/` e
 * em `nucleo/`, que não importam o `obsidian` e rodam fora dele.
 *
 * Só puxa (05 §1): ao abrir o vault, a cada `intervaloMin` com ele aberto, e
 * pelo comando «Sincronizar agora». Sem Obsidian aberto, nada pousa — o texto
 * espera no servidor.
 */

import { Plugin, getLanguage } from "obsidian";
import type { ObsidianProtocolData } from "obsidian";
import { Controle } from "./casca/controle.ts";
import { ID_DO_PLUGIN } from "./casca/ajustes.ts";
import { T, definirLingua } from "./nucleo/textos.ts";
import {
  AmbienteDoObsidian,
  ArmazemDoPlugin,
  CofreDoObsidian,
  CopiasDoObsidian,
  DiscoDoObsidian,
  LocalDoObsidian,
  RedeDoObsidian,
} from "./obsidian/adaptadores.ts";
import { AbaDeAjustes, ModalDeConfirmacao, ModalDePareamento, TelaDoObsidian } from "./obsidian/telas.ts";

export default class LareiaWriteReflect extends Plugin {
  controle!: Controle;
  private relogio: number | null = null;

  async onload() {
    // A língua do Obsidian, antes de qualquer texto: os nomes dos comandos se
    // registram uma vez, e um aviso dito antes sairia na língua errada.
    definirLingua(getLanguage());
    this.controle = new Controle({
      disco: new DiscoDoObsidian(this.app),
      rede: new RedeDoObsidian(),
      cofre: new CofreDoObsidian(this.app),
      local: new LocalDoObsidian(this.app),
      copias: new CopiasDoObsidian(this.app, this.manifest.id || ID_DO_PLUGIN),
      ambiente: new AmbienteDoObsidian(this.app),
      tela: new TelaDoObsidian(this.app),
      armazem: new ArmazemDoPlugin(this),
    });
    await this.controle.carregar();

    this.addSettingTab(new AbaDeAjustes(this.app, this));

    this.addCommand({ id: "sincronizar-agora", name: T().cmdSincronizar, callback: () => void this.controle.sincronizar({ manual: true }) });
    this.addCommand({ id: "ensaiar", name: T().cmdEnsaiar, callback: () => void this.controle.ensaiar() });
    this.addCommand({ id: "ligar", name: T().cmdLigar, callback: () => this.abrirPareamento() });
    this.addCommand({ id: "desligar", name: T().cmdDesligar, callback: () => this.confirmarDesligar() });

    // `obsidian://lareia-write-reflect?codigo=ABCD-EFGH`: o mesmo pareamento do
    // modal. O código vale 10 minutos e uma vez, e pode viajar no link; não se
    // grava em lugar nenhum.
    this.registerObsidianProtocolHandler(ID_DO_PLUGIN, (params: ObsidianProtocolData) => this.controle.aoAbrirLink(params));

    this.app.workspace.onLayoutReady(() => {
      void this.controle.sincronizar();
      this.agendar();
    });
  }

  /** O relógio da rodada, refeito quando o intervalo muda nos ajustes. */
  agendar() {
    if (this.relogio !== null) window.clearInterval(this.relogio);
    this.relogio = this.registerInterval(window.setInterval(() => void this.controle.sincronizar(), this.controle.ajustes.intervaloMin * 60_000));
  }

  abrirPareamento() {
    new ModalDePareamento(this.app, (codigo) => this.controle.parear(codigo)).open();
  }

  confirmarDesligar() {
    new ModalDeConfirmacao(
      this.app,
      T().confirmarDesligar,
      T().botaoDesligar,
      () => void this.controle.desligar(),
    ).open();
  }
}
