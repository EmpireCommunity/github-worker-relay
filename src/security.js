/**
 * Segurança da entrada: leitura do corpo com teto de tamanho e verificação da assinatura do webhook do GitHub.
 */

const encoder = new TextEncoder();

export const MAX_BODY_BYTES = 5 * 1024 * 1024;

/** Lê o fluxo inteiro, mas desiste (devolve null) se passar de `maxBytes`. */
export async function readStreamLimited(stream, maxBytes) {
  if (!stream) return new Uint8Array(0);
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** Corpo bruto da requisição (bytes), ou null se passar do limite. A assinatura vale sobre estes bytes. */
export async function readBodyLimited(request, maxBytes = MAX_BODY_BYTES) {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  return readStreamLimited(request.body, maxBytes);
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Confere o `X-Hub-Signature-256` (`sha256=<hex>`): HMAC SHA-256 do corpo bruto com o segredo.
 * `crypto.subtle.verify` compara em tempo constante. Sem segredo ou com cabeçalho fora do formato: false.
 */
export async function verifySignature(secret, bodyBytes, header) {
  if (!secret || typeof header !== 'string') return false;
  const match = /^sha256=([0-9a-f]{64})$/i.exec(header.trim());
  if (!match) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'verify'
  ]);
  return crypto.subtle.verify('HMAC', key, hexToBytes(match[1]), bodyBytes);
}
