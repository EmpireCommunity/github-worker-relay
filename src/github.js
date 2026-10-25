/**
 * Leitura de arquivos do GitHub por SHA (o CHANGELOG antes e depois do push).
 *
 * Sem token: `raw.githubusercontent.com` (repositórios públicos). Com `GITHUB_TOKEN` (somente leitura): a API de conteúdo,
 * que também alcança repositórios privados. O token só é enviado a `api.github.com`.
 */

import { readStreamLimited } from './security.js';

export const MAX_FILE_BYTES = 1024 * 1024;

const SHA = /^[0-9a-f]{40}$/i;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const USER_AGENT = 'EmpireCommunity-GitHub-Relay';

/** O caminho do arquivo em segmentos codificados, ou null se tiver `.`/`..`, barras repetidas ou for vazio. */
export function encodePath(path) {
  if (typeof path !== 'string' || path.length === 0 || path.length > 300) return null;
  const segments = path.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) return null;
  return segments.map(encodeURIComponent).join('/');
}

/** A URL e os cabeçalhos para ler `path` em `sha`, ou null se algum dado não tiver o formato esperado. */
export function buildFileRequest({ fullName, sha, path, token }) {
  const encoded = encodePath(path);
  if (!encoded || !SHA.test(sha || '') || !REPO.test(fullName || '')) return null;
  const headers = { 'User-Agent': USER_AGENT };
  if (token) {
    headers.Accept = 'application/vnd.github.raw+json';
    headers.Authorization = `Bearer ${token}`;
    headers['X-GitHub-Api-Version'] = '2022-11-28';
    return { url: `https://api.github.com/repos/${fullName}/contents/${encoded}?ref=${sha}`, headers };
  }
  return { url: `https://raw.githubusercontent.com/${fullName}/${sha}/${encoded}`, headers };
}

/**
 * O texto do arquivo em `sha`, ou null se não existir (404), se o pedido for inválido ou se passar do limite de tamanho.
 * Outras falhas do GitHub levantam erro.
 */
export async function fetchFileAtSha({ fullName, sha, path, token, fetchFn = (...args) => globalThis.fetch(...args) }) {
  const request = buildFileRequest({ fullName, sha, path, token });
  if (!request) return null;
  const response = await fetchFn(request.url, { headers: request.headers });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub respondeu HTTP ${response.status}`);
  const bytes = await readStreamLimited(response.body, MAX_FILE_BYTES);
  return bytes ? new TextDecoder().decode(bytes) : null;
}
