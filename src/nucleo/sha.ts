/**
 * O SHA-256 do guarda-corpo, igual ao `hashlib.sha256(texto.encode("utf-8")).hexdigest()`.
 *
 * Pelo `crypto.subtle` e não pelo `crypto` do Node: o plugin roda no iPad, onde
 * não há Node. Hex minúsculo, sobre os bytes UTF-8 — os mesmos que o agente mede,
 * e os que a API guarda em `hashAplicado`.
 */

const CODIFICADOR = new TextEncoder();

export async function sha256Hex(dados: string | Uint8Array | ArrayBuffer): Promise<string> {
  const bytes = typeof dados === "string" ? CODIFICADOR.encode(dados) : dados;
  const resumo = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  let hex = "";
  for (const b of new Uint8Array(resumo)) hex += b.toString(16).padStart(2, "0");
  return hex;
}
