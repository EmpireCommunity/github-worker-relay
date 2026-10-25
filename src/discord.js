/**
 * Envio ao Discord. As URLs dos webhooks vêm só de secrets (nunca do repositório) e nunca vão para o log.
 */

const DISCORD_WEBHOOK = /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+\/?$/;

/** URLs de `DISCORD_WEBHOOK_URL_1`, `_2`, … ; sem nenhuma, cai em `DISCORD_WEBHOOK_URL`. */
export function getWebhookUrls(env) {
  const urls = [];
  for (let index = 1; env && typeof env[`DISCORD_WEBHOOK_URL_${index}`] === 'string'; index++) {
    const url = env[`DISCORD_WEBHOOK_URL_${index}`].trim();
    if (url) urls.push(url);
  }
  if (urls.length === 0 && typeof env?.DISCORD_WEBHOOK_URL === 'string') {
    const url = env.DISCORD_WEBHOOK_URL.trim();
    if (url) urls.push(url);
  }
  return urls;
}

/** Só aceita URL de webhook do Discord (HTTPS): um secret errado não faz o worker chamar outro destino. */
export function isDiscordWebhookUrl(url) {
  return DISCORD_WEBHOOK.test(url);
}

/** Envia o corpo ao webhook; o erro leva só o status HTTP (nunca a URL nem o texto da resposta). */
export async function sendToDiscord(url, payload, fetchFn = (...args) => globalThis.fetch(...args)) {
  const response = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`Discord respondeu HTTP ${response.status}`);
}

/**
 * Envia a todos os webhooks configurados, em paralelo. Falha se não houver nenhum válido ou se TODOS falharem.
 */
export async function dispatchNotifications(env, payload, fetchFn) {
  const urls = getWebhookUrls(env);
  if (urls.length === 0) {
    throw new Error('Nenhum webhook do Discord configurado (secret DISCORD_WEBHOOK_URL_1).');
  }
  const valid = urls.filter(isDiscordWebhookUrl);
  if (valid.length === 0) {
    throw new Error('Nenhuma URL de webhook do Discord válida entre os secrets configurados.');
  }
  const results = await Promise.allSettled(valid.map((url) => sendToDiscord(url, payload, fetchFn)));
  const failed = results.filter((result) => result.status === 'rejected');
  if (failed.length === results.length) throw failed[0].reason;
  return results.length - failed.length;
}
