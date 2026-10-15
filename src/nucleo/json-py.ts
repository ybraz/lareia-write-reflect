/**
 * O `json` do Python, na medida do mapa: ler a cena e escrevê-la de volta com
 * `json.dumps(cena, ensure_ascii=False, indent=0)` — os mesmos bytes.
 *
 * Por que não o `JSON` do JS: o `.excalidraw.md` que o agente pousa carrega a
 * cena aberta, e o `codex-sha` do front matter é o hash desse texto. Se o plugin
 * escrevesse a cena com outra forma, o mapa ficaria com bytes diferentes do que
 * o agente anterior deixaria (I8), e um porte «quase igual» é o que a troca de
 * escritor não pode ter (I13). O `JSON` do JS erra em três lugares que uma cena real tem:
 *
 *   - número: o Python guarda `1.0` como float e o devolve `1.0`; o JS, `1`.
 *     Expoente: `1e-05` e `1e+16` no Python, `0.00001` e `10000000000000000`
 *     no JS. Inteiro maior que 2^53: exato no Python, arredondado no JS;
 *   - ordem das chaves: o objeto do JS põe as chaves numéricas primeiro (os
 *     `files` do Excalidraw podem ter id só de dígitos); o `dict` do Python
 *     guarda a ordem em que leu;
 *   - chave repetida: o Python fica com o último valor na posição da primeira.
 *
 * Por isso o valor lido aqui guarda a ordem e o literal do número.
 */

export type ValorPy =
  | { t: "obj"; entradas: [string, ValorPy][] }
  | { t: "lista"; itens: ValorPy[] }
  | { t: "str"; v: string }
  | { t: "int"; literal: string }
  | { t: "float"; v: number }
  | { t: "bool"; v: boolean }
  | { t: "nulo" };

export class JsonInvalido extends Error {}

const ESPACO_JSON = new Set([" ", "\t", "\n", "\r"]);

/** `json.loads`, com o scanner em C do CPython (dígitos ASCII, `NaN` e `Infinity` aceitos). */
export function lerJson(texto: string): ValorPy {
  let i = 0;

  const pular = () => {
    while (i < texto.length && ESPACO_JSON.has(texto[i])) i++;
  };
  const erro = (o: string): never => {
    throw new JsonInvalido(`${o} na posição ${i}`);
  };

  const ler = (): ValorPy => {
    pular();
    const c = texto[i];
    if (c === "{") return lerObjeto();
    if (c === "[") return lerLista();
    if (c === '"') return { t: "str", v: lerTexto() };
    if (texto.startsWith("null", i)) return (i += 4), { t: "nulo" };
    if (texto.startsWith("true", i)) return (i += 4), { t: "bool", v: true };
    if (texto.startsWith("false", i)) return (i += 5), { t: "bool", v: false };
    if (texto.startsWith("NaN", i)) return (i += 3), { t: "float", v: NaN };
    if (texto.startsWith("Infinity", i)) return (i += 8), { t: "float", v: Infinity };
    if (texto.startsWith("-Infinity", i)) return (i += 9), { t: "float", v: -Infinity };
    return lerNumero();
  };

  const lerNumero = (): ValorPy => {
    const m = /^(-?(?:0|[1-9][0-9]*))(\.[0-9]+)?([eE][-+]?[0-9]+)?/.exec(texto.slice(i));
    if (!m) return erro("valor esperado");
    i += m[0].length;
    if (m[2] || m[3]) return { t: "float", v: Number(m[0]) };
    return { t: "int", literal: m[1] };
  };

  const lerTexto = (): string => {
    i++; // a aspa
    let saida = "";
    for (;;) {
      if (i >= texto.length) return erro("texto sem fim");
      const c = texto[i];
      if (c === '"') {
        i++;
        return saida;
      }
      if (c < " ") return erro("caractere de controle dentro do texto");
      if (c !== "\\") {
        saida += c;
        i++;
        continue;
      }
      const e = texto[i + 1];
      i += 2;
      const simples: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
      if (e in simples) {
        saida += simples[e];
        continue;
      }
      if (e !== "u") return erro("escape inválido");
      const hex = texto.slice(i, i + 4);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) return erro("\\u inválido");
      i += 4;
      // O Python junta o par de surrogates escapado num caractere só; a string
      // do JS, feita de unidades UTF-16, já é isso ao concatenar as duas.
      saida += String.fromCharCode(parseInt(hex, 16));
    }
  };

  const lerLista = (): ValorPy => {
    i++;
    const itens: ValorPy[] = [];
    pular();
    if (texto[i] === "]") return i++, { t: "lista", itens };
    for (;;) {
      itens.push(ler());
      pular();
      if (texto[i] === ",") {
        i++;
        continue;
      }
      if (texto[i] === "]") return i++, { t: "lista", itens };
      return erro("',' ou ']' esperado");
    }
  };

  const lerObjeto = (): ValorPy => {
    i++;
    const entradas: [string, ValorPy][] = [];
    pular();
    if (texto[i] === "}") return i++, { t: "obj", entradas };
    for (;;) {
      pular();
      if (texto[i] !== '"') return erro("chave esperada");
      const chave = lerTexto();
      pular();
      if (texto[i] !== ":") return erro("':' esperado");
      i++;
      const valor = ler();
      const ja = entradas.findIndex(([k]) => k === chave);
      if (ja >= 0) entradas[ja][1] = valor;
      else entradas.push([chave, valor]);
      pular();
      if (texto[i] === ",") {
        i++;
        continue;
      }
      if (texto[i] === "}") return i++, { t: "obj", entradas };
      return erro("',' ou '}' esperado");
    }
  };

  const valor = ler();
  pular();
  if (i !== texto.length) erro("dados depois do fim");
  return valor;
}

/** `float.__repr__`: o menor número de dígitos que volta ao mesmo double, na forma do Python. */
export function reprFloat(x: number): string {
  if (Number.isNaN(x)) return "nan";
  if (x === Infinity) return "inf";
  if (x === -Infinity) return "-inf";
  if (x === 0) return Object.is(x, -0) ? "-0.0" : "0.0";
  const sinal = x < 0 ? "-" : "";
  // `toExponential()` sem argumento dá os dígitos mais curtos que voltam ao
  // mesmo double — os mesmos que o `repr` do Python escolhe.
  const [mantissa, exp] = Math.abs(x).toExponential().split("e");
  const digitos = mantissa.replace(".", "");
  const e = Number(exp);
  if (e < -4 || e >= 16) {
    const m = digitos.length > 1 ? `${digitos[0]}.${digitos.slice(1)}` : digitos;
    return `${sinal}${m}e${e < 0 ? "-" : "+"}${String(Math.abs(e)).padStart(2, "0")}`;
  }
  if (e < 0) return `${sinal}0.${"0".repeat(-e - 1)}${digitos}`;
  const inteiro = digitos.slice(0, e + 1).padEnd(e + 1, "0");
  const fracao = digitos.slice(e + 1);
  return `${sinal}${inteiro}.${fracao || "0"}`;
}

function inteiroPy(literal: string): string {
  return literal === "-0" ? "0" : literal;
}

function floatJson(x: number): string {
  if (Number.isNaN(x)) return "NaN";
  if (x === Infinity) return "Infinity";
  if (x === -Infinity) return "-Infinity";
  return reprFloat(x);
}

/** `json.dumps(valor, ensure_ascii=False, indent=0)`. */
export function escreverJsonIndent0(v: ValorPy): string {
  switch (v.t) {
    case "nulo":
      return "null";
    case "bool":
      return v.v ? "true" : "false";
    case "int":
      return inteiroPy(v.literal);
    case "float":
      return floatJson(v.v);
    case "str":
      // Para texto bem formado, o escape do JSON do JS é o do Python com
      // `ensure_ascii=False`: `\"`, `\\`, `\n`, `\r`, `\t`, `\b`, `\f` e
      // `\u00XX` minúsculo para o resto dos controles; U+2028 passa cru.
      return JSON.stringify(v.v);
    case "lista":
      if (!v.itens.length) return "[]";
      return "[\n" + v.itens.map(escreverJsonIndent0).join(",\n") + "\n]";
    case "obj":
      if (!v.entradas.length) return "{}";
      return "{\n" + v.entradas.map(([k, x]) => `${JSON.stringify(k)}: ${escreverJsonIndent0(x)}`).join(",\n") + "\n}";
  }
}

/** A verdade do Python (`bool(x)`). */
export function verdadeiro(v: ValorPy | undefined): boolean {
  if (v === undefined) return false;
  switch (v.t) {
    case "nulo":
      return false;
    case "bool":
      return v.v;
    case "int":
      return !/^-?0$/.test(v.literal);
    case "float":
      return v.v !== 0;
    case "str":
      return v.v !== "";
    case "lista":
      return v.itens.length > 0;
    case "obj":
      return v.entradas.length > 0;
  }
}

export class ValorSemFormaDeTexto extends Error {}

/** `str(x)` de um escalar — o que o f-string do agente escreve. */
export function strPy(v: ValorPy): string {
  switch (v.t) {
    case "str":
      return v.v;
    case "nulo":
      return "None";
    case "bool":
      return v.v ? "True" : "False";
    case "int":
      return inteiroPy(v.literal);
    case "float":
      return reprFloat(v.v);
    default:
      // `str()` de lista ou dict é o `repr` do Python, e um porte dele inteiro
      // (aspas, escapes, `isprintable`) não vale o caso: texto de elemento do
      // Excalidraw é sempre texto. Recusar é o lado seguro: o mapa não desce.
      throw new ValorSemFormaDeTexto("texto de elemento que não é escalar");
  }
}

export function obter(v: ValorPy, chave: string): ValorPy | undefined {
  if (v.t !== "obj") return undefined;
  return v.entradas.find(([k]) => k === chave)?.[1];
}
