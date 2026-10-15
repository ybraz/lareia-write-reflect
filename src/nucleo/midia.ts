/**
 * O download da mídia e o pouso do mapa — o porte de `midia.py`.
 *
 * `reescreverMidia` decide O QUE baixar; aqui mora o efeito, sobre a interface
 * do vault (`Disco`) e sobre funções de rede que a casca injeta. Idempotente:
 * mídia que já está lá com bytes não baixa de novo (a chave carrega um UUID, o
 * objeto nunca muda). O mapa é a exceção, e decide pela versão.
 *
 * Falha segura o dia inteiro: `FalhaDeMidia` faz o dia não ser escrito nem
 * confirmado nesta rodada. Um bloco com embed quebrado é estado inválido.
 */

import { juntar } from "./py.ts";
import { T } from "./textos.ts";
import type { Disco } from "./disco.ts";
import { gravarTexto } from "./disco.ts";
import * as mapas from "./mapas.ts";
import type { Midia } from "./reflexoes.ts";

export class FalhaDeMidia extends Error {}

export interface RedeDaMidia {
  /** A URL assinada da mídia (`GET /vault/midia/{chave}`). */
  obterUrl(chave: string): Promise<string>;
  /** A URL assinada da cena do mapa (`GET /vault/{chave}`, chave `mapas/…`). */
  obterMapa(chave: string): Promise<string>;
  /** Os bytes de uma URL assinada. */
  baixar(url: string): Promise<Uint8Array>;
}

/** Esta mídia desce nesta rodada? A mesma regra do download, para o ensaio. */
export async function precisaBaixar(chave: string, nome: string, pasta: string, disco: Disco): Promise<boolean> {
  const destino = juntar(pasta, nome);
  if (mapas.ehMapa(chave)) {
    const [, id, versao] = mapas.partes(chave);
    const estado = await mapas.decidir(await disco.lerTexto(destino), id, versao);
    return estado === "ausente" || estado === "desce";
  }
  const t = await disco.tamanho(destino);
  return !(t !== null && t > 0);
}

async function pousarMapa(chave: string, nome: string, pasta: string, disco: Disco, rede: RedeDaMidia, avisos: string[]): Promise<number> {
  const [, id, versao] = mapas.partes(chave);
  const destino = juntar(pasta, nome);
  const existente = await disco.lerTexto(destino);
  const estado = await mapas.decidir(existente, id, versao);

  if (estado === "atual") return 0;
  if (estado === "alheio") {
    // Um arquivo com este nome que não é deste mapa: sobrescrever apagaria o
    // que alguém pôs ali; embutir apontaria o dia para o desenho errado.
    throw new FalhaDeMidia(T().arquivoNaoEDoMapa(nome, id));
  }
  if (estado === "divergente") {
    // 14 §5.4: editado no Obsidian. Não sobrescreve; marca a versão que ficou
    // na nuvem. O dia segue: o embed aponta um arquivo que existe.
    const marcado = mapas.marcarDivergente(existente!, versao);
    if (marcado !== existente) await gravarTexto(disco, destino, marcado);
    avisos.push(T().mapaDivergente(nome, versao));
    return 0;
  }
  let conteudo: string;
  try {
    const bruto = await rede.baixar(await rede.obterMapa(chave));
    conteudo = await mapas.montar(mapas.conferirCena(bruto), id, versao);
  } catch (e) {
    throw new FalhaDeMidia(`${nome}: ${(e as Error).message}`);
  }
  await gravarTexto(disco, destino, conteudo);
  return 1;
}

/** Traz cada mídia que ainda não está na pasta. Devolve quantas baixou. */
export async function baixarMidias(midias: Midia[], pasta: string, disco: Disco, rede: RedeDaMidia, avisos: string[] = []): Promise<number> {
  let baixadas = 0;
  for (const [chave, nome] of midias) {
    if (mapas.ehMapa(chave)) {
      baixadas += await pousarMapa(chave, nome, pasta, disco, rede, avisos);
      continue;
    }
    const destino = juntar(pasta, nome);
    const t = await disco.tamanho(destino);
    if (t !== null && t > 0) continue;

    let bytes: Uint8Array;
    try {
      bytes = await rede.baixar(await rede.obterUrl(chave));
    } catch (e) {
      throw new FalhaDeMidia(`${nome}: ${(e as Error).message}`);
    }
    if (!bytes.byteLength) throw new FalhaDeMidia(T().midiaVazia(nome));
    await disco.gravarBinario(destino, bytes);
    baixadas++;
  }
  return baixadas;
}
