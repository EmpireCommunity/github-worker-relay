import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { handleRequest } from '../src/index.js';
import {
  AFTER,
  BEFORE,
  DISCORD_URL,
  SECRET,
  discordBodies,
  discordOk,
  fakeFetch,
  githubRequest,
  pushPayload,
  releasePayload
} from './helpers.js';

const ENV = { GITHUB_WEBHOOK_SECRET: SECRET, DISCORD_WEBHOOK_URL_1: DISCORD_URL };
const PUSH_ENV = { ...ENV, ANNOUNCE_PUSH: 'true' };

const OLD_CHANGELOG = '# Changelog\n\n## [2.0.0] - em preparação\n\n### Adicionado\n- **Existente**: já estava.\n';
const NEW_CHANGELOG =
  '# Changelog\n\n## [2.0.0] - em preparação\n\n### Adicionado\n- **Existente**: já estava.\n- **Recurso novo**: faz algo.\n\n### Corrigido\n- Corrige o login.\n';

const changelogPush = () =>
  pushPayload({
    commits: [{ id: 'c1', message: 'docs: changelog', author: { username: 'ana' }, added: [], modified: ['CHANGELOG.md'] }]
  });

const rawChangelog = (url) => {
  if (url.includes(`/${BEFORE}/CHANGELOG.md`)) return new Response(OLD_CHANGELOG);
  if (url.includes(`/${AFTER}/CHANGELOG.md`)) return new Response(NEW_CHANGELOG);
  return undefined;
};

let originalError;
beforeEach(() => {
  originalError = console.error;
  console.error = () => {};
});
afterEach(() => {
  console.error = originalError;
});

async function call(request, env = ENV, fetchFn = fakeFetch(discordOk)) {
  const response = await handleRequest(await request, env, { fetchFn });
  return { response, fetchFn, text: await response.text() };
}

test('sem segredo configurado, 401 e nada é enviado', async () => {
  const { response, fetchFn } = await call(githubRequest({ event: 'push', payload: pushPayload() }), { DISCORD_WEBHOOK_URL_1: DISCORD_URL });
  assert.equal(response.status, 401);
  assert.equal(fetchFn.calls.length, 0);
});

test('assinatura ausente, inválida ou de corpo alterado: 401 e nada é enviado', async () => {
  const payload = pushPayload();
  const casos = [
    githubRequest({ event: 'push', payload, signature: null }),
    githubRequest({ event: 'push', payload, secret: 'outro' }),
    githubRequest({ event: 'push', payload, signature: 'sha256=' + 'a'.repeat(64) }),
    (async () => {
      const request = await githubRequest({ event: 'push', payload });
      return new Request(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify({ ...payload, ref: 'refs/heads/x' }) });
    })()
  ];
  for (const request of casos) {
    const { response, fetchFn } = await call(request);
    assert.equal(response.status, 401);
    assert.equal(fetchFn.calls.length, 0);
  }
});

test('corpo acima de 5 MB: 413', async () => {
  const request = new Request('https://relay.test/', {
    method: 'POST',
    headers: { 'x-github-event': 'push' },
    body: new Uint8Array(5 * 1024 * 1024 + 1)
  });
  const { response } = await call(request);
  assert.equal(response.status, 413);
});

test('método diferente de POST, sem evento e JSON inválido assinado', async () => {
  assert.equal((await call(githubRequest({ event: 'push', payload: {}, method: 'GET' }))).response.status, 405);
  assert.equal((await call(new Request('https://relay.test/', { method: 'POST', body: '{}' }))).response.status, 400);
  assert.equal((await call(githubRequest({ event: 'push', rawBody: '{não é json' }))).response.status, 400);
});

test('ping assinado responde 200 sem enviar nada', async () => {
  const { response, fetchFn } = await call(githubRequest({ event: 'ping', payload: { zen: 'ok' } }));
  assert.equal(response.status, 200);
  assert.equal(fetchFn.calls.length, 0);
});

test('push desligado por padrão; ANNOUNCE_PUSH=true (sem diferenciar maiúsculas) liga', async () => {
  for (const env of [ENV, { ...ENV, ANNOUNCE_PUSH: 'false' }, { ...ENV, ANNOUNCE_PUSH: '1' }]) {
    const { response, text, fetchFn } = await call(githubRequest({ event: 'push', payload: pushPayload() }), env);
    assert.equal(response.status, 200);
    assert.equal(text, 'Ignored push: push-announcements-off');
    assert.equal(fetchFn.calls.length, 0);
  }
  const on = fakeFetch(discordOk);
  const { text } = await call(githubRequest({ event: 'push', payload: pushPayload() }), { ...ENV, ANNOUNCE_PUSH: 'True' }, on);
  assert.equal(text, 'Notification sent');
  assert.equal(discordBodies(on).length, 1);
});

test('push que não vira mensagem: outra branch, tag, remoção, branch nova e sem commits', async () => {
  const casos = [
    pushPayload({ ref: 'refs/heads/feature' }),
    pushPayload({ ref: 'refs/tags/v1' }),
    pushPayload({ deleted: true }),
    pushPayload({ before: '0'.repeat(40) }),
    pushPayload({ commits: [] })
  ];
  for (const payload of casos) {
    const { response, text, fetchFn } = await call(githubRequest({ event: 'push', payload }), PUSH_ENV);
    assert.equal(response.status, 200);
    assert.match(text, /Ignored push/);
    assert.equal(fetchFn.calls.length, 0);
  }
});

test('push com CHANGELOG: baixa o arquivo antes e depois por SHA e envia só as linhas novas', async () => {
  const fetchFn = fakeFetch(rawChangelog, discordOk);
  const { response } = await call(githubRequest({ event: 'push', payload: changelogPush() }), PUSH_ENV, fetchFn);
  assert.equal(response.status, 200);
  const raw = fetchFn.calls.filter((call) => call.url.startsWith('https://raw.githubusercontent.com/'));
  assert.deepEqual(
    raw.map((call) => call.url).sort(),
    [
      `https://raw.githubusercontent.com/EmpireCommunity/EmpireMuse/${AFTER}/CHANGELOG.md`,
      `https://raw.githubusercontent.com/EmpireCommunity/EmpireMuse/${BEFORE}/CHANGELOG.md`
    ].sort()
  );
  const [body] = discordBodies(fetchFn);
  const [embed] = body.embeds;
  assert.equal(embed.title, '🛠️ EmpireMuse · v2.0.0 (em preparação)');
  assert.match(embed.description, /Recurso novo/);
  assert.match(embed.description, /Corrige o login/);
  assert.doesNotMatch(embed.description, /Existente/);
  assert.match(embed.description, /^✨ 1 novidade · 🐛 1 correção/);
  assert.equal(embed.url, pushPayload().compare);
  assert.equal(embed.footer.text, 'Por ana');
  assert.equal(body.username, 'EmpireCommunity');
});

test('com GITHUB_TOKEN o arquivo vem pela API (repositório privado) e o token só vai ao GitHub', async () => {
  const api = (url, init) =>
    url.startsWith('https://api.github.com/repos/EmpireCommunity/EmpireMuse/contents/CHANGELOG.md') && init.headers.Authorization === 'Bearer ghp_teste'
      ? new Response(url.includes(BEFORE) ? OLD_CHANGELOG : NEW_CHANGELOG)
      : undefined;
  const fetchFn = fakeFetch(api, discordOk);
  await call(githubRequest({ event: 'push', payload: changelogPush() }), { ...PUSH_ENV, GITHUB_TOKEN: 'ghp_teste' }, fetchFn);
  assert.equal(fetchFn.calls.some((call) => call.url.startsWith('https://raw.githubusercontent.com/')), false);
  assert.equal(discordBodies(fetchFn).length, 1);
  const discordCall = fetchFn.calls.find((call) => call.url.startsWith('https://discord.com/'));
  assert.equal(discordCall.init.headers.Authorization, undefined);
});

test('push sem CHANGELOG usa os commits; falha ao ler o CHANGELOG também', async () => {
  const semArquivo = fakeFetch(discordOk);
  await call(githubRequest({ event: 'push', payload: pushPayload() }), PUSH_ENV, semArquivo);
  const [embed] = discordBodies(semArquivo)[0].embeds;
  assert.equal(embed.title, '🛠️ EmpireMuse · atualização na main');
  assert.match(embed.description, /🐛 \*\*Correções\*\*/);
  assert.match(embed.description, /corrige bug/);

  const githubFora = fakeFetch((url) => (url.startsWith('https://raw.githubusercontent.com/') ? new Response('erro', { status: 500 }) : undefined), discordOk);
  const { response } = await call(githubRequest({ event: 'push', payload: changelogPush() }), PUSH_ENV, githubFora);
  assert.equal(response.status, 200);
  assert.match(discordBodies(githubFora)[0].embeds[0].description, /changelog/i);
});

test('release publicada: título com a tag, seções e cor; pré-lançamento com selo', async () => {
  const stable = fakeFetch(discordOk);
  await call(githubRequest({ event: 'release', payload: releasePayload() }), ENV, stable);
  const [embed] = discordBodies(stable)[0].embeds;
  assert.equal(embed.title, '🚀 EmpireMuse v2.0.0');
  assert.equal(embed.color, 0x57f287);
  assert.match(embed.description, /Painel web/);
  assert.match(embed.description, /🐛 \*\*Corrigido\*\*/);

  const pre = fakeFetch(discordOk);
  await call(githubRequest({ event: 'release', payload: releasePayload({ tag_name: 'v2.0.0-rc.2', name: 'v2.0.0-rc.2', prerelease: true }) }), ENV, pre);
  const [preEmbed] = discordBodies(pre)[0].embeds;
  assert.match(preEmbed.title, /v2\.0\.0-rc\.2 · 🧪 Pré-lançamento/);
  assert.equal(preEmbed.color, 0xfee75c);

  const created = await call(githubRequest({ event: 'release', payload: releasePayload({}, { action: 'created' }) }));
  assert.match(created.text, /Ignored release action/);
});

test('falha do Discord: 500 genérico, sem a URL do webhook na resposta nem no log', async () => {
  const logs = [];
  console.error = (...args) => logs.push(args.join(' '));
  const falha = fakeFetch((url) => (url.startsWith('https://discord.com/') ? new Response('rate limited', { status: 429 }) : undefined));
  const { response, text } = await call(githubRequest({ event: 'release', payload: releasePayload() }), ENV, falha);
  assert.equal(response.status, 500);
  assert.equal(text, 'Internal Error');
  assert.ok(logs.length > 0 && logs.every((line) => !line.includes('123456789') && !line.includes('abcDEF')));
});

test('só URLs de webhook do Discord são chamadas; várias saem em paralelo', async () => {
  const fetchFn = fakeFetch(discordOk);
  const env = { ...ENV, DISCORD_WEBHOOK_URL_2: 'https://exemplo.invalid/hook', DISCORD_WEBHOOK_URL_3: 'https://discord.com/api/webhooks/987654321/outro-token' };
  // _2 não é URL de webhook do Discord e é descartada; _1 e _3 recebem a mensagem
  const { response } = await call(githubRequest({ event: 'release', payload: releasePayload() }), env, fetchFn);
  assert.equal(response.status, 200);
  assert.deepEqual(
    fetchFn.calls.map((call) => call.url),
    [DISCORD_URL, 'https://discord.com/api/webhooks/987654321/outro-token']
  );

  const semUrl = fakeFetch(discordOk);
  const { response: erro } = await call(githubRequest({ event: 'release', payload: releasePayload() }), { GITHUB_WEBHOOK_SECRET: SECRET }, semUrl);
  assert.equal(erro.status, 500);
  assert.equal(semUrl.calls.length, 0);
});

test('release estável: destaque acima do embed, menção só ao cargo válido, intro, "Ao atualizar" primeiro e miniatura; pré-lançamento sem destaque', async () => {
  const body = 'Resumo da versão com **negrito** e [link](https://x.test).\n\n**Ao atualizar:**\n- Troque o token antes.\n\n### Adicionado\n- **Painel web**: novo.';
  const send = async (release, env) => {
    const fetchFn = fakeFetch(discordOk);
    await call(githubRequest({ event: 'release', payload: releasePayload(release) }), { ...ENV, ...env }, fetchFn);
    return discordBodies(fetchFn)[0];
  };

  const stable = await send({ body }, { RELEASE_MENTION_ROLE_ID: '123456789012345678' });
  assert.equal(stable.content, '<@&123456789012345678> 🎉 **Nova versão do EmpireMuse: v2.0.0**');
  assert.deepEqual(stable.allowed_mentions, { parse: [], roles: ['123456789012345678'] });
  assert.equal(stable.embeds[0].thumbnail.url, 'https://avatars.githubusercontent.com/u/1');
  const { description } = stable.embeds[0];
  assert.ok(description.startsWith('Resumo da versão com negrito e link.\n\n'));
  assert.ok(description.indexOf('⚠️ **Ao atualizar**') < description.indexOf('✨ **Adicionado**'));
  assert.doesNotMatch(description, /Outras mudanças/);

  const comEspaco = await send({ body }, { RELEASE_MENTION_ROLE_ID: ' 123456789012345678\n' });
  assert.match(comEspaco.content, /^<@&123456789012345678> /);

  const tagEstranha = await send({ body, tag_name: 'v1_x||<@&9>' }, {});
  assert.equal(tagEstranha.content, '🎉 **Nova versão do EmpireMuse: v1\\_x9**');

  for (const ruim of ['<@&1>', '12ab', '1 2', '']) {
    const sem = await send({ body }, { RELEASE_MENTION_ROLE_ID: ruim });
    assert.equal(sem.content, '🎉 **Nova versão do EmpireMuse: v2.0.0**');
    assert.deepEqual(sem.allowed_mentions, { parse: [] });
  }

  const pre = await send({ body, tag_name: 'v2.0.0-rc.1', name: 'v2.0.0-rc.1', prerelease: true }, { RELEASE_MENTION_ROLE_ID: '123456789012345678' });
  assert.equal(pre.content, undefined);
  assert.deepEqual(pre.allowed_mentions, { parse: [] });
});
