import { webcrypto } from 'node:crypto';

export const SECRET = 'segredo-de-teste';
export const DISCORD_URL = 'https://discord.com/api/webhooks/123456789/abcDEF_ghi-123';

const encoder = new TextEncoder();

export async function sign(secret, body) {
  const key = await webcrypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign'
  ]);
  const bytes = new Uint8Array(await webcrypto.subtle.sign('HMAC', key, typeof body === 'string' ? encoder.encode(body) : body));
  return `sha256=${[...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

/** Uma requisição do GitHub assinada com `secret` (ou sem assinatura se `signature` for null). */
export async function githubRequest({ event, payload, secret = SECRET, signature, rawBody, method = 'POST' }) {
  const body = rawBody ?? JSON.stringify(payload);
  const headers = { 'x-github-event': event };
  const value = signature === undefined ? await sign(secret, body) : signature;
  if (value !== null) headers['x-hub-signature-256'] = value;
  return new Request('https://relay.test/', { method, headers, body: method === 'GET' ? undefined : body });
}

/** Um `fetch` falso: `routes` = [(url, init) => Response | undefined]; guarda as chamadas em `calls`. */
export function fakeFetch(...routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    for (const route of routes) {
      const response = route(String(url), init);
      if (response) return response;
    }
    return new Response('not found', { status: 404 });
  };
  fn.calls = calls;
  return fn;
}

export const discordOk = (url) => (url.startsWith('https://discord.com/api/webhooks/') ? new Response(null, { status: 204 }) : undefined);

export function discordBodies(fetchFn) {
  return fetchFn.calls.filter((call) => call.url.startsWith('https://discord.com/')).map((call) => JSON.parse(call.init.body));
}

export const BEFORE = '1'.repeat(40);
export const AFTER = '2'.repeat(40);
const REPO_URL = 'https://github.com/EmpireCommunity/EmpireMuse';

export function pushPayload(extra = {}) {
  return {
    ref: 'refs/heads/main',
    before: BEFORE,
    after: AFTER,
    deleted: false,
    compare: `${REPO_URL}/compare/${BEFORE.slice(0, 12)}...${AFTER.slice(0, 12)}`,
    repository: {
      name: 'EmpireMuse',
      full_name: 'EmpireCommunity/EmpireMuse',
      html_url: REPO_URL,
      default_branch: 'main',
      owner: { login: 'EmpireCommunity', avatar_url: 'https://avatars.githubusercontent.com/u/1' }
    },
    organization: { login: 'EmpireCommunity', avatar_url: 'https://avatars.githubusercontent.com/u/1' },
    pusher: { name: 'ana' },
    sender: { login: 'ana', avatar_url: 'https://avatars.githubusercontent.com/u/2' },
    commits: [
      { id: 'c1', message: 'fix: corrige bug', author: { name: 'Ana', username: 'ana' }, added: [], modified: ['src/a.js'] }
    ],
    ...extra
  };
}

export function releasePayload(release = {}, extra = {}) {
  return {
    action: 'published',
    release: {
      tag_name: 'v2.0.0',
      name: 'v2.0.0',
      html_url: `${REPO_URL}/releases/tag/v2.0.0`,
      prerelease: false,
      body: '### Adicionado\n- **Painel web**: novo painel.\n\n### Corrigido\n- Corrige o login.',
      author: { login: 'ana', avatar_url: 'https://avatars.githubusercontent.com/u/2' },
      ...release
    },
    repository: pushPayload().repository,
    organization: pushPayload().organization,
    sender: pushPayload().sender,
    ...extra
  };
}
