/**
 * Uma rodada do plugin — o porte de `sync.rodar`, `rodar_cadernos` e
 * `rodar_titulos`, sobre as portas da casca.
 *
 * Três partes, na ordem do agente, e uma falha numa não impede a outra (o
 * diário de hoje não espera por um caderno com problema):
 *
 *   1. os dias: pendentes → para cada dia, a mídia ANTES (o texto que pousa é
 *      o reescrito, e um embed quebrado é estado inválido), decidir, gravar por
 *      `vault.process`, ack. Divergência: ack de divergência com o texto do
 *      vault. Surpresa: não escreve, não confirma, avisa;
 *   2. os cadernos, só nas `pastasDosCadernos` (e a lista sobe à conta);
 *   3. o índice de títulos, SÓ com o ajuste ligado (I15).
 *
 * E a nota de registro, se ligada, com as linhas do que teve efeito.
 *
 * Em ENSAIO a mesma rodada roda sobre o `DiscoDeEnsaio`, sem ack, sem upload e
 * sem download: o relatório traz o que a escrita faria.
 *
 * `ChaveRecusada` não se captura aqui: ela atravessa a rodada inteira até o
 * controle, que desliga o aparelho. Uma chave revogada não é falha de um dia.
 */

import type { Disco } from "../nucleo/disco.ts";
import { gravarTexto } from "../nucleo/disco.ts";
import { decidir, localizar, reescreverMidia, Surpresa, type Midia, type OpcoesDoDia } from "../nucleo/reflexoes.ts";
import { baixarMidias, FalhaDeMidia, precisaBaixar, type RedeDaMidia } from "../nucleo/midia.ts";
import { DestinoRecusado, SurpresaDoIndex } from "../nucleo/cadernos.ts";
import { pousarCaderno } from "../nucleo/pouso.ts";
import { cabeca, hashDoIndice, montarIndice } from "../nucleo/titulos.ts";
import { acrescentar, caminhoDoMes } from "../nucleo/registro.ts";
import { juntar, paiDe, splitEspacos } from "../nucleo/py.ts";
import type { Ajustes } from "./ajustes.ts";
import { ChaveRecusada, ClienteDaApi, FalhaDeRede } from "./api.ts";
import type { Ambiente, Local, Mudanca, Relatorio } from "./portas.ts";
import { T } from "../nucleo/textos.ts";

export interface ContextoDaRodada {
  disco: Disco;
  api: ClienteDaApi;
  ajustes: Ajustes;
  ambiente: Ambiente;
  local: Local;
  ensaio: boolean;
  /** O carimbo da rodada (`YYYY-MM-DD-HHMM`). */
  carimbo: string;
}

const dois = (n: number) => String(n).padStart(2, "0");
export const carimboDe = (d: Date) => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}-${dois(d.getHours())}${dois(d.getMinutes())}`;

export const chaveLocal = (a: Ajustes, nome: string) => `${a.idDoVault}:${nome}`;

/** Onde mora o dia: a daily (pasta e formato dos ajustes, ou do plugin nativo) ou o arquivo próprio. */
export async function ondeMoraODia(a: Ajustes, amb: Ambiente) {
  const nativo = (await amb.configDaDaily()) ?? {};
  const pasta = a.pastaDaDaily || nativo.pasta || "";
  const formato = a.formatoDaData || nativo.formato || "YYYY-MM-DD";
  const modelo = nativo.modelo || "";
  return {
    pasta: a.modo === "arquivo" ? a.pastaDoArquivo : pasta,
    caminho: (data: string) =>
      a.modo === "arquivo" ? juntar(a.pastaDoArquivo, `${data}.md`) : juntar(pasta, `${amb.formatarData(data, formato)}.md`),
    formato,
    modelo,
  };
}

/** As variáveis que o Daily Notes nativo troca no modelo. */
export function renderizarModelo(modelo: string, data: string, titulo: string, formato: string, amb: Ambiente): string {
  const agora = amb.agora();
  return modelo
    .replace(/\{\{\s*date\s*:\s*([^}]+?)\s*\}\}/g, (_m, f: string) => amb.formatarData(data, f))
    .replace(/\{\{\s*time\s*:\s*([^}]+?)\s*\}\}/g, (_m, f: string) => amb.formatarData(data, f, agora))
    .replace(/\{\{\s*date\s*\}\}/g, () => amb.formatarData(data, formato))
    .replace(/\{\{\s*time\s*\}\}/g, () => `${dois(agora.getHours())}:${dois(agora.getMinutes())}`)
    .replace(/\{\{\s*title\s*\}\}/g, () => titulo);
}

function redeDaMidia(api: ClienteDaApi): RedeDaMidia {
  return {
    obterUrl: (c) => api.urlDeMidia(c),
    obterMapa: (c) => api.urlDoMapa(c),
    baixar: (u) => api.baixar(u),
  };
}

/** No ensaio, a mídia não desce: conta-se o que desceria, pela mesma regra. */
async function contarMidias(midias: Midia[], pasta: string, disco: Disco, mudancas: Mudanca[]): Promise<number> {
  let n = 0;
  for (const [chave, nome] of midias) {
    if (await precisaBaixar(chave, nome, pasta, disco)) {
      mudancas.push({ tipo: "baixaria", caminho: juntar(pasta, nome) });
      n++;
    }
  }
  return n;
}

/**
 * Os avisos da rodada, e entre eles os ALERTAS: os que viram `Notice` depois
 * de uma rodada que escreve (surpresa, divergência, recusa, mídia que faltou,
 * uma etapa que caiu). Antes, o controle os reconhecia por palavras do texto
 * (`SURPRESA|DIVERGENTE|…`); com o texto em duas línguas, quem sabe que é
 * alerta é quem o diz.
 */
interface Avisos {
  lista: string[];
  alertas: string[];
  push(aviso: string): void;
  alertar(aviso: string): void;
}

function novosAvisos(): Avisos {
  const lista: string[] = [];
  const alertas: string[] = [];
  return {
    lista,
    alertas,
    push: (aviso) => void lista.push(aviso),
    alertar: (aviso) => {
      lista.push(aviso);
      alertas.push(aviso);
    },
  };
}

const engole = (e: unknown) => {
  if (e instanceof ChaveRecusada) throw e;
};

export async function rodar(ctx: ContextoDaRodada): Promise<Relatorio & { virtuais: Mudanca[] }> {
  const { disco, ajustes: a, ambiente: amb, ensaio } = ctx;
  const avisos = novosAvisos();
  const log: string[] = [];
  const virtuais: Mudanca[] = [];
  const relatorio: Relatorio & { virtuais: Mudanca[] } = { ensaio, mudancas: [], avisos: avisos.lista, alertas: avisos.alertas, dias: 0, cadernos: 0, titulos: "desligado", virtuais };
  const agora = amb.agora();

  // ── 1. Os dias ─────────────────────────────────────────────────────────
  try {
    relatorio.dias = await rodarDias(ctx, avisos, log, virtuais);
  } catch (e) {
    engole(e);
    avisos.alertar(T().falhaDosDias((e as Error).message));
  }

  // ── 2. Os cadernos ─────────────────────────────────────────────────────
  try {
    relatorio.cadernos = await rodarCadernos(ctx, avisos, log, virtuais, agora);
  } catch (e) {
    engole(e);
    avisos.alertar(T().falhaDosCadernos((e as Error).message));
  }

  // ── 3. O índice de títulos — só com o ajuste ligado (I15) ──────────────
  if (a.titulos) {
    try {
      relatorio.titulos = await rodarTitulos(ctx, relatorio);
    } catch (e) {
      engole(e);
      relatorio.titulos = "falhou";
      avisos.alertar(T().falhaDosTitulos((e as Error).message));
    }
  }

  // ── A nota de registro: só o que teve efeito (e o ensaio não tem efeito) ─
  if (a.notaDeRegistro && log.length && !ensaio) {
    const caminho = caminhoDoMes(a.notaDeRegistro, agora);
    const novo = acrescentar(await disco.lerTexto(caminho), log);
    if (novo !== null) await gravarTexto(disco, caminho, novo);
  }
  return relatorio;
}

async function rodarDias(ctx: ContextoDaRodada, avisos: Avisos, log: string[], virtuais: Mudanca[]): Promise<number> {
  const { disco, api, ajustes: a, ambiente: amb, ensaio } = ctx;
  const itens = await api.pendentes();
  if (!itens.length) return 0;

  const lugar = await ondeMoraODia(a, amb);
  const opcoes: OpcoesDoDia = { modo: a.modo, cabecalho: a.cabecalho, criarNota: a.criarNota, acrescentarCabecalho: a.acrescentarCabecalho };
  let aplicados = 0;

  for (const item of itens) {
    const { data } = item;
    const caminho = lugar.caminho(data);
    const conteudo = await disco.lerTexto(caminho);

    // Quem não cria a nota não a fabrica: o texto espera no servidor (05 §5).
    if (conteudo === null && a.modo === "daily" && !a.criarNota) {
      avisos.push(T().notaNaoExiste(data, caminho));
      continue;
    }

    // ── A mídia vem ANTES da decisão (C-32) ──────────────────────────────
    const { texto: textoVault, midias } = reescreverMidia(item.texto);
    if (midias.length) {
      const pasta = a.pastaDaMidia || (await amb.pastaDeAnexos(midias[0][1], caminho));
      if (ensaio) {
        await contarMidias(midias, pasta, disco, virtuais);
      } else {
        try {
          const avisosDoMapa: string[] = [];
          await baixarMidias(midias, pasta, disco, redeDaMidia(api), avisosDoMapa);
          for (const x of avisosDoMapa) {
            avisos.alertar(`${data}: ${x}`);
            log.push(T().logMapaDivergente(data, x));
          }
        } catch (e) {
          engole(e);
          if (!(e instanceof FalhaDeMidia || e instanceof FalhaDeRede)) throw e;
          avisos.alertar(T().midiaFaltou(data, e.message));
          log.push(T().logMidiaFaltou(data, e.message));
          continue;
        }
      }
    }

    const modelo = conteudo === null && a.modo === "daily" && a.criarNota && lugar.modelo
      ? renderizarModelo((await disco.lerTexto(lugar.modelo.endsWith(".md") ? lugar.modelo : `${lugar.modelo}.md`)) ?? "", data, caminho.split("/").pop()!.replace(/\.md$/, ""), lugar.formato, amb)
      : "";
    const d = await decidir(
      { conteudo, data, texto: textoVault, hashAplicado: item.hashAplicado ?? null, hashesAplicados: item.hashesAplicados ?? [] },
      { ...opcoes, modelo },
    );

    if (d.acao === "segurar") {
      avisos.push(T().segurando(data, d.motivo!));
      continue;
    }
    if (d.acao === "surpresa") {
      // G5: a falha é POR ARQUIVO. Os outros dias seguem; este volta pendente.
      avisos.alertar(T().surpresa(data, d.motivo!));
      log.push(T().logSurpresa(data, d.motivo!));
      continue;
    }
    if (d.acao === "nada") {
      // Nada a gravar, mas a confirmar: o ack pode ter se perdido na rede.
      if (!ensaio) await confirmar(api, data, item.versao, d.hash!, avisos);
      continue;
    }
    if (d.acao === "divergente") {
      avisos.alertar(T().divergente(data));
      log.push(T().logDivergente(data));
      if (!ensaio) {
        let miolo = "";
        try {
          miolo = (conteudo !== null && localizar(conteudo, data)?.miolo) || "";
        } catch (e) {
          if (!(e instanceof Surpresa)) throw e;
        }
        try {
          await api.marcarDivergente(data, miolo);
        } catch (e) {
          engole(e);
          avisos.push(T().naoMarcouDivergencia(data, (e as Error).message));
        }
      }
      continue;
    }

    // ── Escrever ──────────────────────────────────────────────────────────
    if (conteudo === null) {
      await disco.criarTexto(caminho, d.conteudo!);
    } else {
      // G2: `vault.process` é ler-modificar-gravar atômico. Se o arquivo
      // mudou entre a leitura e a escrita, não se escreve por cima do que
      // não se leu: fica como está, e a rodada seguinte decide de novo.
      let mudou = false;
      await disco.processar(caminho, (atual) => {
        if (atual !== conteudo) {
          mudou = true;
          return atual;
        }
        return d.conteudo!;
      });
      if (mudou) {
        avisos.push(T().arquivoMudou(data));
        continue;
      }
    }
    if (!ensaio) await confirmar(api, data, item.versao, d.hash!, avisos);
    log.push(T().logDia(data, splitEspacos(item.texto).length, item.versao));
    aplicados++;
  }
  return aplicados;
}

async function confirmar(api: ClienteDaApi, data: string, versao: number, hash: string, avisos: Avisos) {
  try {
    await api.confirmar(data, versao, hash);
  } catch (e) {
    engole(e);
    // O arquivo já está certo e o ack falhou: a rodada seguinte acha o hash
    // batendo e reconfirma. Idempotente de propósito.
    avisos.push(T().ackFalhou(data, (e as Error).message));
  }
}

async function rodarCadernos(ctx: ContextoDaRodada, avisos: Avisos, log: string[], virtuais: Mudanca[], agora: Date): Promise<number> {
  const { disco, api, ajustes: a, local, ensaio } = ctx;
  const pastas = a.pastasDosCadernos;

  // A lista sobe à conta para a tela oferecer o destino (§4.8); só quando muda.
  const chave = chaveLocal(a, "pastasEnviadas");
  if (!ensaio && JSON.stringify(local.ler(chave)) !== JSON.stringify(pastas)) {
    try {
      await api.enviarPastas(pastas);
      local.gravar(chave, pastas);
    } catch (e) {
      engole(e);
      avisos.alertar(T().pastasNaoSubiram((e as Error).message));
    }
  }
  // Sem pasta, nenhum caderno tem onde pousar (e o servidor não os oferece).
  if (!pastas.length) return 0;

  const cadernos = await api.cadernos();
  let pousados = 0;
  for (const c of cadernos) {
    const nome = c.nome || c.id;
    let ack;
    try {
      ack = await pousarCaderno(c, {
        disco,
        pastas,
        escrever: true, // no ensaio, o disco é a camada: a escrita fica nela
        carimbo: ctx.carimbo,
        agora,
        log,
        baixarMidias: (m, pasta, av) => (ensaio ? contarMidias(m, pasta, disco, virtuais) : baixarMidias(m, pasta, disco, redeDaMidia(api), av)),
      });
    } catch (e) {
      engole(e);
      if (e instanceof DestinoRecusado) {
        // A recusa é RUIDOSA por desenho: um caderno que não pousa e não diz por
        // que é um caderno que a pessoa acha que está salvo.
        avisos.alertar(T().cadernoRecusado(nome, e.message));
        log.push(T().logRecusado(nome, e.message));
        if (!ensaio) {
          try {
            await api.confirmarCaderno({ caderno: c.id, recusa: `${e.codigo}: ${e.message}` });
          } catch (x) {
            engole(x);
          }
        }
      } else if (e instanceof SurpresaDoIndex) {
        avisos.alertar(T().cadernoSurpresa(nome, e.message));
        log.push(T().logSurpresaNoIndex(nome, e.message));
      } else {
        avisos.push(T().cadernoErro(nome, (e as Error).message));
        log.push(T().logErroNoVault(nome, (e as Error).message));
      }
      continue;
    }
    if (ensaio) continue;
    try {
      await api.confirmarCaderno(ack);
      pousados++;
    } catch (e) {
      engole(e);
      avisos.push(T().cadernoAckFalhou(nome, (e as Error).message));
    }
  }
  return pousados;
}

/** A cabeça de cada nota, relida só quando o arquivo muda (as notas grandes não pesam a cada rodada). */
const cacheDeCabecas = new Map<string, { mtime: number; texto: string }>();

async function rodarTitulos(ctx: ContextoDaRodada, relatorio: Relatorio): Promise<Relatorio["titulos"]> {
  const { disco, api, ajustes: a, ambiente: amb, local, ensaio } = ctx;
  const notas = await amb.notas();
  const arquivos: { caminho: string; texto?: string; apelidos?: string[] }[] = [];
  // A pasta de configuração sai sempre, pelo nome que este vault usa: a lista
  // dos ajustes é a da pessoa, e ela não tem de saber que `.obsidian` pode ser outro.
  const semTitulos = [...a.pastasSemTitulos, amb.pastaDeConfiguracao()];
  const puladas = new Set(semTitulos);
  let lidos = 0;
  for (const n of notas) {
    // A pasta pulada nem se lê.
    if (!n.caminho.endsWith(".md") || paiDe(n.caminho).split("/").some((p) => puladas.has(p))) continue;
    // O Obsidian já sabe os apelidos (metadataCache): nada a ler. Num vault
    // grande, ler cada nota inteira para cortar a cabeça chegou a 15 mil
    // arquivos e ~1 GB a cada Obsidian reaberto.
    if (n.apelidos) {
      arquivos.push({ caminho: n.caminho, apelidos: n.apelidos });
      continue;
    }
    lidos++;
    const chave = `${a.idDoVault}:${n.caminho}`;
    let item = cacheDeCabecas.get(chave);
    if (!item || item.mtime !== n.mtime) {
      // Guarda-se só a cabeça (64 KiB), que é o que o índice lê: os livros
      // convertidos de megabytes não ficam na memória.
      item = { mtime: n.mtime, texto: cabeca((await disco.lerTexto(n.caminho)) ?? "") };
      cacheDeCabecas.set(chave, item);
    }
    arquivos.push({ caminho: n.caminho, texto: item.texto });
  }
  relatorio.titulosLidos = lidos;
  const titulos = montarIndice(arquivos, semTitulos);
  const hash = await hashDoIndice(titulos);
  const guardado = chaveLocal(a, "hashDosTitulos");
  if (local.ler<string>(guardado) === hash) return "igual";
  if (ensaio) return "subiria";
  await api.enviarTitulos(hash, titulos);
  // O hash só se guarda DEPOIS do envio: guardar antes faria o índice novo nunca subir.
  local.gravar(guardado, hash);
  return "subiu";
}
