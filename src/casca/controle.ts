/**
 * O controle do plugin: o pareamento, quem escreve, a rodada, o ensaio e o
 * desligar — sem nada do Obsidian. O `main.ts` só liga isto às telas e aos
 * comandos; o adaptador de disco de `scripts/` liga isto a uma pasta e ao `fetch`.
 *
 * Os três estados deste aparelho, lidos de dois lugares que não se confundem:
 *
 *   - **ligado** — há o segredo no cofre deste aparelho. É ele quem escreve.
 *   - **outro escreve** — sem segredo aqui, mas o `data.json` (que sincroniza)
 *     diz que outro aparelho escreve. O plugin não roda: dois escritores na
 *     mesma fila dividiriam os acks (spec 26 §2). Mostra «quem escreve neste
 *     vault é {nome}», com «passar a escrever aqui» (o pareamento).
 *   - **sem ligação** — nem segredo, nem escritor.
 *
 * O segredo nunca sai do cofre para outro lugar: nem `data.json`, nem nota de
 * registro, nem mensagem (I9). O código de pareamento só passa por `parear`.
 */

import type { Ajustes } from "./ajustes.ts";
import { normalizar } from "./ajustes.ts";
import { ChaveRecusada, ClienteDaApi, CodigoRecusado, FalhaDeRede, normalizarCodigo } from "./api.ts";
import { DiscoCercado, DiscoComCopias, DiscoDeEnsaio } from "./discos.ts";
import type { Ambiente, ArmazemDeAjustes, Cofre, Copias, Disco, Local, Rede, Relatorio, Tela } from "./portas.ts";
import { carimboDe, chaveLocal, ondeMoraODia, rodar } from "./rodada.ts";
import { T } from "../nucleo/textos.ts";

export type Estado = { tipo: "ligado" } | { tipo: "outro-escreve"; nome: string } | { tipo: "sem-ligacao" };

export interface Portas {
  disco: Disco;
  rede: Rede;
  cofre: Cofre;
  local: Local;
  copias: Copias;
  ambiente: Ambiente;
  tela: Tela;
  armazem: ArmazemDeAjustes;
}

const RETENCAO_DAS_COPIAS_DIAS = 7;

export class Controle {
  ajustes!: Ajustes;
  private p: Portas;
  private rodando: Promise<Relatorio | null> | null = null;

  constructor(portas: Portas) {
    this.p = portas;
  }

  async carregar(): Promise<Ajustes> {
    const { ajustes, mudou } = normalizar(await this.p.armazem.carregar());
    this.ajustes = ajustes;
    if (mudou) await this.salvar();
    return ajustes;
  }

  async salvar(): Promise<void> {
    // O que vai ao `data.json` é a forma normalizada, e só ela: campo nenhum
    // entra por fora (I9).
    await this.p.armazem.gravar(normalizar(this.ajustes).ajustes);
  }

  private chave(): string | null {
    const c = this.p.cofre.ler(this.ajustes.nomeDoSegredo);
    return c ? c : null;
  }

  private api(): ClienteDaApi {
    return new ClienteDaApi(this.p.rede, this.ajustes.api, () => this.chave());
  }

  estado(): Estado {
    if (this.chave()) return { tipo: "ligado" };
    if (this.ajustes.escritor) return { tipo: "outro-escreve", nome: this.ajustes.escritor.nome };
    return { tipo: "sem-ligacao" };
  }

  private get ensaioPendente(): boolean {
    return this.p.local.ler<boolean>(chaveLocal(this.ajustes, "ensaioPendente")) === true;
  }

  private set ensaioPendente(v: boolean) {
    this.p.local.gravar(chaveLocal(this.ajustes, "ensaioPendente"), v);
  }

  /**
   * Troca o código pela chave, guarda a chave no cofre e este aparelho no
   * `data.json` como o escritor. A primeira rodada depois é SEMPRE ensaio, e
   * pede «Aplicar» (§4.6, G4). O mesmo caminho do modal e do link `obsidian://`.
   */
  async parear(codigoBruto: unknown): Promise<boolean> {
    const codigo = normalizarCodigo(codigoBruto);
    if (!codigo) {
      this.p.tela.avisar(T().codigoTorto);
      return false;
    }
    let par;
    try {
      par = await this.api().parear(codigo, this.p.ambiente.nomeDoVault());
    } catch (e) {
      if (e instanceof CodigoRecusado) {
        this.p.tela.avisar(e.forma ? T().codigoSemForma : T().codigoRecusado);
      } else {
        this.p.tela.avisar(T().semFalarComALareia((e as Error).message));
      }
      return false;
    }
    this.p.cofre.gravar(this.ajustes.nomeDoSegredo, par.chave);
    this.p.local.gravar(chaveLocal(this.ajustes, "meuAparelhoId"), par.aparelho.aparelhoId);
    this.ajustes.escritor = { aparelhoId: par.aparelho.aparelhoId, nome: this.p.ambiente.nomeDoAparelho() };
    await this.salvar();
    this.ensaioPendente = true;
    this.p.tela.avisar(T().passouAEscrever(this.p.ambiente.nomeDoAparelho()));
    await this.sincronizar({ manual: true });
    return true;
  }

  /** `obsidian://lareia-write-reflect?codigo=ABCD-EFGH` — o mesmo pareamento do modal. */
  async aoAbrirLink(params: Record<string, string | undefined>): Promise<boolean> {
    if (!params.codigo) {
      this.p.tela.avisar(T().linkSemCodigo);
      return false;
    }
    return this.parear(params.codigo);
  }

  /** A rodada: ao abrir o vault, a cada `intervaloMin` e pelo comando. Uma por vez. */
  async sincronizar(o: { manual?: boolean } = {}): Promise<Relatorio | null> {
    if (this.rodando) return this.rodando;
    this.rodando = this.sincronizarJa(o).finally(() => (this.rodando = null));
    return this.rodando;
  }

  private async sincronizarJa({ manual = false }: { manual?: boolean }): Promise<Relatorio | null> {
    const estado = this.estado();
    if (estado.tipo === "outro-escreve") {
      if (manual) this.p.tela.avisar(T().outroEscreve(estado.nome));
      return null;
    }
    if (estado.tipo === "sem-ligacao") {
      if (manual) this.p.tela.avisar(T().naoLigado);
      return null;
    }
    if (this.ensaioPendente) {
      const r = await this.ensaiar({ podeAplicar: true });
      return r;
    }
    return this.aplicar();
  }

  /**
   * O vault e o ambiente que a rodada recebe: a cerca das pastas dos ajustes
   * (I12) por fora, e por dentro a camada do ensaio ou as cópias (G1).
   */
  private async montar(miolo: Disco): Promise<{ disco: Disco; ambiente: Ambiente }> {
    const a = this.ajustes;
    const lugar = await ondeMoraODia(a, this.p.ambiente);
    const pastas = [lugar.pasta, ...a.pastasDosCadernos];
    if (a.pastaDaMidia) pastas.push(a.pastaDaMidia);
    if (a.pastasDosCadernos.length) pastas.push(".lixeira/codex");
    if (a.notaDeRegistro) pastas.push(a.notaDeRegistro);
    const cerca = new DiscoCercado(miolo, pastas);
    const base = this.p.ambiente;
    const ambiente: Ambiente = {
      nomeDoVault: () => base.nomeDoVault(),
      nomeDoAparelho: () => base.nomeDoAparelho(),
      configDaDaily: () => base.configDaDaily(),
      formatarData: (d, f, ag) => base.formatarData(d, f, ag),
      notas: () => base.notas(),
      agora: () => base.agora(),
      pastaDeConfiguracao: () => base.pastaDeConfiguracao(),
      // A pasta de anexos o Obsidian resolve nota a nota; a que ele der entra na cerca.
      pastaDeAnexos: async (nome, nota) => {
        const pasta = await base.pastaDeAnexos(nome, nota);
        cerca.permitir(pasta);
        return pasta;
      },
    };
    return { disco: cerca, ambiente };
  }

  /** G4: a rodada inteira sobre a camada de ensaio. Nada se grava, nada se confirma. */
  async ensaiar({ podeAplicar = false }: { podeAplicar?: boolean } = {}): Promise<Relatorio | null> {
    if (this.estado().tipo !== "ligado") return this.sincronizarJa({ manual: true });
    const camada = new DiscoDeEnsaio(this.p.disco);
    let r;
    try {
      const { disco, ambiente } = await this.montar(camada);
      r = await rodar({ disco, api: this.api(), ajustes: this.ajustes, ambiente, local: this.p.local, ensaio: true, carimbo: carimboDe(this.p.ambiente.agora()) });
    } catch (e) {
      return this.tratarFalha(e);
    }
    const relatorio: Relatorio = { ...r, mudancas: [...camada.mudancas(), ...r.virtuais] };
    const aplicar = await this.p.tela.mostrarEnsaio(relatorio, podeAplicar);
    if (podeAplicar && aplicar) {
      this.ensaioPendente = false;
      // A escrita decide de novo, sobre o vault como ele está AGORA: o ensaio
      // vale para o estado em que rodou, e entre os dois a pessoa pode ter escrito.
      return this.aplicar();
    }
    return relatorio;
  }

  private async aplicar(): Promise<Relatorio | null> {
    const agora = this.p.ambiente.agora();
    const carimbo = carimboDe(agora);
    try {
      const { disco, ambiente } = await this.montar(new DiscoComCopias(this.p.disco, this.p.copias, carimbo));
      const r = await rodar({
        disco,
        api: this.api(),
        ajustes: this.ajustes,
        ambiente,
        local: this.p.local,
        ensaio: false,
        carimbo,
      });
      // Os alertas são os avisos que pedem a pessoa (surpresa, divergência,
      // recusa, mídia que faltou, uma etapa que caiu); o resto fica no ensaio.
      for (const a of r.alertas) this.p.tela.avisar(T().alerta(a));
      try {
        await this.p.copias.podar(new Date(agora.getTime() - RETENCAO_DAS_COPIAS_DIAS * 86_400_000));
      } catch {
        // Podar é faxina: falhar não desfaz a rodada.
      }
      return r;
    } catch (e) {
      return this.tratarFalha(e);
    }
  }

  private async tratarFalha(e: unknown): Promise<null> {
    if (e instanceof ChaveRecusada) {
      await this.esquecerEsteAparelho();
      this.p.tela.avisar(T().avisoDesligado);
      return null;
    }
    if (e instanceof FalhaDeRede) {
      this.p.tela.avisar(T().semConexao(e.message));
      return null;
    }
    throw e;
  }

  /** O segredo sai do cofre; o escritor sai do `data.json` só se era ESTE aparelho (outro pode ter pareado depois). */
  private async esquecerEsteAparelho(): Promise<void> {
    this.p.cofre.esquecer(this.ajustes.nomeDoSegredo);
    const meu = this.p.local.ler<string>(chaveLocal(this.ajustes, "meuAparelhoId"));
    if (this.ajustes.escritor && this.ajustes.escritor.aparelhoId === meu) {
      this.ajustes.escritor = null;
      await this.salvar();
    }
    this.p.local.gravar(chaveLocal(this.ajustes, "meuAparelhoId"), null);
    this.ensaioPendente = false;
  }

  /** «Desligar este aparelho»: `DELETE /vault/ligacao`, e o segredo sai. */
  async desligar(): Promise<boolean> {
    if (this.estado().tipo !== "ligado") {
      this.p.tela.avisar(T().aparelhoNaoLigado);
      return false;
    }
    try {
      await this.api().desligar();
    } catch (e) {
      if (!(e instanceof ChaveRecusada)) {
        // Sem a resposta, a chave pode seguir viva no servidor: apagá-la daqui
        // deixaria uma ligação que ninguém mais consegue desligar deste lado.
        this.p.tela.avisar(T().naoDesligou((e as Error).message));
        return false;
      }
    }
    await this.esquecerEsteAparelho();
    this.p.tela.avisar(T().desligou);
    return true;
  }
}
