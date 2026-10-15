/**
 * O pouso de um caderno — o porte de `sync._pousar_caderno`.
 *
 * O encanamento que aplica os cinco freios de `cadernos.ts` na ordem certa:
 * lápide, destino, mudança de destino, pasta ocupada, renomeação em duas
 * fases, cada fólio com o guarda-corpo do corpo, as lápides dos fólios e, por
 * último, o `index.md`. Sobre a interface do vault, e com `escrever` como o
 * agente: em ensaio nada se grava, e o ack sai como sairia.
 */

import { juntar, nomeDe, radical, sufixo, splitEspacos } from "./py.ts";
import { T } from "./textos.ts";
import type { Disco } from "./disco.ts";
import { gravarTexto } from "./disco.ts";
import {
  DestinoRecusado,
  conferirDestino,
  corpoDe,
  hashCorpo,
  montarFolio,
  montarIndex,
  nomeDoArquivo,
  pastaLivre,
  planoDeRenomeacao,
} from "./cadernos.ts";
import { reescreverMidia, type Midia } from "./reflexoes.ts";
import { FalhaDeMidia } from "./midia.ts";

export interface Folio {
  id: string;
  titulo?: string | null;
  versao: number;
  versaoAplicada?: number | null;
  hashAplicado?: string | null;
  arquivo?: string | null;
  palavras?: number | null;
  criadoEm?: string | null;
  texto?: string;
  [outro: string]: unknown;
}

export interface Caderno {
  id: string;
  nome?: string | null;
  slug?: string | null;
  destino: string;
  pastaAplicada?: string | null;
  fichaAplicada?: number | null;
  versaoDaFicha: number;
  removido?: boolean;
  folios?: Folio[];
  removidos?: { id: string; arquivo: string }[];
  [outro: string]: unknown;
}

export interface AckDoCaderno {
  caderno: string;
  removidoOk?: boolean;
  fichaAplicada?: number;
  pastaAplicada?: string;
  folios?: { id: string; versao: number; hash: string; arquivo: string }[];
  divergentes?: { id: string; textoDoVault: string }[];
  removidos?: string[];
  recusa?: string;
}

export interface Pouso {
  disco: Disco;
  pastas: string[];
  escrever: boolean;
  /** O carimbo da rodada (`YYYY-MM-DD-HHMM`), para a lixeira não sobrescrever homônimo. */
  carimbo: string;
  agora: Date;
  /** Baixa a mídia de um fólio para `{pasta}/anexos`. Na casca, a rede; no ensaio, nada. */
  baixarMidias: (midias: Midia[], pasta: string, avisos: string[]) => Promise<number>;
  log: string[];
}

const doisDigitos = (n: number) => String(n).padStart(2, "0");
const dataIso = (d: Date) => `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;
const dataBr = (d: Date) => `${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)}/${d.getFullYear()}`;

/** Move para a lixeira. NUNCA apaga. Homônimo na lixeira ganha o carimbo da rodada. */
export async function paraLixeira(disco: Disco, alvo: string, lixeira: string, carimbo: string): Promise<string> {
  await disco.criarPasta(lixeira);
  const nome = nomeDe(alvo);
  let destino = juntar(lixeira, nome);
  if ((await disco.tipo(destino)) !== null) destino = juntar(lixeira, `${radical(nome)} (${carimbo})${sufixo(nome)}`);
  await disco.mover(alvo, destino);
  return destino;
}

/** Um caderno. `DestinoRecusado` sobe para quem chama (que a traduz em `recusa` no ack). */
export async function pousarCaderno(caderno: Caderno, p: Pouso): Promise<AckDoCaderno> {
  const { disco, escrever, carimbo, log } = p;
  const cid = caderno.id;
  const nome = caderno.nome || "Caderno";
  const slug = caderno.slug || "caderno";
  const pastaAntiga = caderno.pastaAplicada ? juntar(caderno.pastaAplicada) : null;

  // ── O caderno com lápide: a pasta inteira vai para a lixeira ──────────
  if (caderno.removido) {
    if (pastaAntiga && (await disco.tipo(pastaAntiga)) === "pasta") {
      if (escrever) await paraLixeira(disco, pastaAntiga, ".lixeira/codex", carimbo);
      log.push(T().logCadernoRemovido(nome));
    }
    return { caderno: cid, removidoOk: true };
  }

  // ── Freio 1: o destino ────────────────────────────────────────────────
  const pasta = conferirDestino(caderno.destino, p.pastas);
  const livre = async (c: string) =>
    pastaLivre(await disco.tipo(c), await disco.listar(c), (n) => disco.lerTexto(juntar(c, n)));

  // ── Mudar de destino MOVE a pasta; não cria uma segunda ───────────────
  if (pastaAntiga && pastaAntiga !== pasta) {
    if ((await disco.tipo(pasta)) !== null && !(await livre(pasta))) {
      throw new DestinoRecusado(T().pastaOcupada(caderno.destino), "PASTA_OCUPADA");
    }
    if (escrever) await disco.mover(pastaAntiga, pasta);
    log.push(T().logCadernoMovido(nome, caderno.destino));
  } else if (!(await livre(pasta))) {
    // ── Freio 2: pasta ocupada não se adota ─────────────────────────────
    throw new DestinoRecusado(T().pastaOcupadaMd(caderno.destino), "PASTA_OCUPADA");
  }

  if (escrever) await disco.criarPasta(pasta);

  const folios = caderno.folios ?? [];
  const total = folios.length;
  const desejado: [string, string][] = folios.map((f, i) => [f.id, nomeDoArquivo(i + 1, total, f.titulo || "")]);
  const nomeDesejado = new Map(desejado);
  const atual = new Map(folios.filter((f) => f.arquivo).map((f) => [f.id, f.arquivo!] as [string, string]));

  // ── A renomeação em duas fases ────────────────────────────────────────
  for (const [origem, destino] of planoDeRenomeacao(atual, desejado)) {
    if (!escrever) continue;
    const de = juntar(pasta, origem);
    // A origem sumiu (apagada à mão, ou rodada interrompida): o fólio volta
    // pendente e a gravação o recria com o nome certo.
    if ((await disco.tipo(de)) !== "arquivo") continue;
    await disco.mover(de, juntar(pasta, destino));
  }

  // ── Cada fólio ────────────────────────────────────────────────────────
  const confirmados: NonNullable<AckDoCaderno["folios"]> = [];
  const divergentes: NonNullable<AckDoCaderno["divergentes"]> = [];

  for (const f of folios) {
    if (!("texto" in f) || f.texto === undefined) continue;
    const nomeDoFolio = nomeDesejado.get(f.id)!;
    const arquivo = juntar(pasta, nomeDoFolio);
    const { texto: textoVault, midias } = reescreverMidia(f.texto);

    if (midias.length && escrever) {
      try {
        const avisos: string[] = [];
        await p.baixarMidias(midias, juntar(pasta, "anexos"), avisos);
        for (const a of avisos) log.push(T().logFolioMapaDivergente(nome, a));
      } catch (e) {
        if (!(e instanceof FalhaDeMidia)) throw e;
        log.push(T().logFolioMidiaFaltou(nome, `${f.titulo}`, e.message));
        continue;
      }
    }

    const existente = await disco.lerTexto(arquivo);
    // O guarda-corpo mede o CORPO: o INGEST escreve `description` na frente.
    if (existente !== null && f.hashAplicado) {
      if ((await hashCorpo(corpoDe(existente))) !== f.hashAplicado) {
        log.push(T().logFolioDivergente(nome, `${f.titulo}`));
        divergentes.push({ id: f.id, textoDoVault: corpoDe(existente) });
        continue;
      }
    }

    const criado = (f.criadoEm || "").slice(0, 10) || dataIso(p.agora);
    const novo = montarFolio(f.titulo || "", textoVault, {
      slug,
      silo: caderno.destino.split("/")[0],
      criado,
      modificado: dataIso(p.agora),
      existente,
    });
    if (escrever) {
      await gravarTexto(disco, arquivo, novo);
      log.push(T().logFolio(nome, `${f.titulo}`, splitEspacos(textoVault).length, f.versao));
    }
    confirmados.push({ id: f.id, versao: f.versao, hash: await hashCorpo(corpoDe(novo)), arquivo: nomeDoFolio });
  }

  // ── Freio 4: as lápides vão para a lixeira ────────────────────────────
  const removidos: string[] = [];
  for (const morto of caderno.removidos ?? []) {
    const alvo = juntar(pasta, morto.arquivo);
    if (!escrever) continue;
    if ((await disco.tipo(alvo)) === "arquivo") {
      await paraLixeira(disco, alvo, juntar(pasta, ".lixeira"), carimbo);
      log.push(T().logFolioNaLixeira(nome, morto.arquivo));
    }
    removidos.push(morto.id);
  }

  // ── Freio 3: o index.md, só entre marcadores ──────────────────────────
  const index = juntar(pasta, "index.md");
  const nomes = desejado.map(([, n]) => n);
  const palavras = folios.reduce((s, f) => s + (f.palavras || 0), 0);
  const n = nomes.length;
  const conteudoIndex = montarIndex(await disco.lerTexto(index), {
    nome,
    slug,
    linhas: nomes.map((x, i) => `${i + 1}. [[${radical(x)}]]`),
    resumo: `${n} fólio${n !== 1 ? "s" : ""} · ${palavras} palavras · atualizado em ${dataBr(p.agora)}`,
  });
  if (escrever) await gravarTexto(disco, index, conteudoIndex);

  return {
    caderno: cid,
    fichaAplicada: caderno.versaoDaFicha,
    pastaAplicada: caderno.destino,
    folios: confirmados,
    divergentes,
    removidos,
  };
}
