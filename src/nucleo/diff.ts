/**
 * O diff do ensaio (G4): o que mudaria, para quem lê antes de aplicar.
 *
 * Não precisa ser byte a byte o do `difflib` — é para olho humano, não entra no
 * corpus. Unificado, duas linhas de contexto, como o ensaio do agente.
 */

function linhas(texto: string): string[] {
  if (!texto) return [];
  const l = texto.split("\n");
  if (l[l.length - 1] === "") l.pop();
  return l;
}

/** As operações de linha (` `, `-`, `+`) pela maior subsequência comum. */
function operacoes(a: string[], b: string[]): [string, string][] {
  // Prefixo e sufixo comuns saem antes: a daily inteira contra a daily com um
  // bloco a mais não precisa de uma tabela de milhões de células.
  let ini = 0;
  while (ini < a.length && ini < b.length && a[ini] === b[ini]) ini++;
  let fa = a.length, fb = b.length;
  while (fa > ini && fb > ini && a[fa - 1] === b[fb - 1]) {
    fa--;
    fb--;
  }
  const ma = a.slice(ini, fa), mb = b.slice(ini, fb);
  const ops: [string, string][] = a.slice(0, ini).map((x) => [" ", x]);
  if (ma.length * mb.length > 4_000_000) {
    ops.push(...ma.map((x) => ["-", x] as [string, string]), ...mb.map((x) => ["+", x] as [string, string]));
  } else {
    const t = Array.from({ length: ma.length + 1 }, () => new Uint32Array(mb.length + 1));
    for (let i = ma.length - 1; i >= 0; i--)
      for (let j = mb.length - 1; j >= 0; j--)
        t[i][j] = ma[i] === mb[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
    let i = 0, j = 0;
    while (i < ma.length || j < mb.length) {
      if (i < ma.length && j < mb.length && ma[i] === mb[j]) {
        ops.push([" ", ma[i++]]);
        j++;
      }
      else if (j < mb.length && (i >= ma.length || t[i][j + 1] >= t[i + 1][j])) ops.push(["+", mb[j++]]);
      else ops.push(["-", ma[i++]]);
    }
  }
  ops.push(...a.slice(fa).map((x) => [" ", x] as [string, string]));
  return ops;
}

/** O diff unificado de `antes` para `depois`; `""` quando são iguais. */
export function diffUnificado(antes: string, depois: string, rotulo: string, contexto = 2): string {
  if (antes === depois) return "";
  const ops = operacoes(linhas(antes), linhas(depois));
  const saida = [`--- ${rotulo} (antes)`, `+++ ${rotulo} (depois)`];
  const mudou = ops.map(([o]) => o !== " ");
  let k = 0;
  while (k < ops.length) {
    if (!mudou[k]) {
      k++;
      continue;
    }
    const de = Math.max(0, k - contexto);
    let ate = k;
    while (ate < ops.length) {
      let prox = ate;
      while (prox < ops.length && !mudou[prox]) prox++;
      if (prox >= ops.length || prox - ate > contexto * 2) break;
      ate = prox + 1;
      while (ate < ops.length && mudou[ate]) ate++;
    }
    const fim = Math.min(ops.length, ate + contexto);
    saida.push("@@");
    for (let x = de; x < fim; x++) saida.push(ops[x][0] + ops[x][1]);
    k = fim;
  }
  return saida.join("\n") + "\n";
}
