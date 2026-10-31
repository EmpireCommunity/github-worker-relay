/**
 * GitHub Worker Relay: recebe os webhooks da organização (push e release) e publica no Discord uma mensagem por atualização.
 *
 * Só a release é anunciada; o push fica desligado por padrão (`ANNOUNCE_PUSH=true` liga). O handler só orquestra; as regras (diff do CHANGELOG, commits, formatação) ficam nos módulos puros de `src/`.
 */

import { buildPushMessage, buildReleaseMessage, pushIgnoreReason } from './events.js';
import { dispatchNotifications, getWebhookUrls } from './discord.js';
import { buildDiscordPayload } from './format.js';
import { fetchFileAtSha } from './github.js';
import { MAX_BODY_BYTES, readBodyLimited, verifySignature } from './security.js';

export { getWebhookUrls };

const text = (body, status) => new Response(body, { status });

/** O erro para o log sem URLs (a do webhook do Discord é segredo). */
function safeMessage(error) {
  return String(error?.message || error)
    .replace(/https?:\/\/\S+/g, '[url]')
    .slice(0, 200);
}

/**
 * Trata uma requisição do GitHub. `deps.fetchFn` troca o `fetch` (testes).
 * Ordem: método → evento → segredo → corpo (com teto) → assinatura → JSON → evento. Sem assinatura válida nada é enviado.
 */
export async function handleRequest(request, env, deps = {}) {
  const fetchFn = deps.fetchFn || ((...args) => globalThis.fetch(...args));

  if (request.method !== 'POST') return text('Method Not Allowed', 405);
  const event = request.headers.get('x-github-event');
  if (!event) return text('Missing x-github-event header', 400);

  if (!env?.GITHUB_WEBHOOK_SECRET) {
    console.error('relay: GITHUB_WEBHOOK_SECRET não configurado; requisição recusada.');
    return text('Unauthorized', 401);
  }
  const body = await readBodyLimited(request, MAX_BODY_BYTES);
  if (body === null) return text('Payload Too Large', 413);
  if (!(await verifySignature(env.GITHUB_WEBHOOK_SECRET, body, request.headers.get('x-hub-signature-256')))) {
    return text('Unauthorized', 401);
  }

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return text('Invalid JSON', 400);
  }

  try {
    if (event === 'ping') {
      return new Response(JSON.stringify({ message: 'Pong! Webhook configurado com sucesso.' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let message = null;
    if (event === 'release') {
      message = buildReleaseMessage(payload, { mentionRoleId: env.RELEASE_MENTION_ROLE_ID });
      if (!message) return text(`Ignored release action: ${payload.action}`, 200);
    } else if (event === 'push') {
      const reason = pushIgnoreReason(payload, env);
      if (reason) return text(`Ignored push: ${reason}`, 200);
      const fullName = payload.repository.full_name;
      message = await buildPushMessage(payload, (sha, path) =>
        fetchFileAtSha({ fullName, sha, path, token: env.GITHUB_TOKEN, fetchFn })
      );
      if (!message) return text('Ignored push: nothing to report', 200);
    } else {
      return text(`Ignored event: ${event}`, 200);
    }

    await dispatchNotifications(env, buildDiscordPayload(message), fetchFn);
    return text('Notification sent', 200);
  } catch (error) {
    console.error(`relay: falha ao tratar o evento ${event}: ${safeMessage(error)}`);
    return text('Internal Error', 500);
  }
}

export default {
  fetch: (request, env) => handleRequest(request, env)
};
