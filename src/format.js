/**
 * Formatação para o Discord: simplificação dos itens, resumo com contagens e montagem do embed dentro dos limites.
 */

import { KINDS, KIND_ORDER } from './kinds.js';

export const MAX_TITLE = 256;
export const MAX_DESCRIPTION = 4096;
export const MAX_EMBED_TOTAL = 6000;
export const MAX_ITEM_LENGTH = 120;
export const MAX_ITEMS_PER_SECTION = 6;
export const MAX_RELEASE_ITEMS_PER_SECTION = 10;

export const COLORS = { release: 0x57f287, prerelease: 0xfee75c, push: 0x5865f2 };

/** Corta no limite, de preferência numa palavra, com reticências; não deixa um trecho de código (`) aberto. */
export function truncate(text, max = MAX_ITEM_LENGTH) {
  if (text.length <= max) return text;
  let cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > max * 0.6) cut = cut.slice(0, lastSpace);
  if ((cut.match(/`/g) || []).length % 2 === 1) cut = cut.slice(0, cut.lastIndexOf('`'));
  return `${cut.trimEnd().replace(/[\s:;,.\-–—]+$/, '')}…`;
}

/** Tira o markdown pesado: imagens, links (fica o texto), HTML, negrito, URLs soltas. Mantém o código em crases. */
export function stripMarkdown(text) {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<https?:\/\/[^>]+>/g, '')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/(^|\s)\*([^*\s][^*]*?)\*(?=\s|$|[.,;:!?])/g, '$1$2')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function firstSentence(text) {
  const match = /[.!?](?=\s+[A-ZÀ-Ý*`[(])/.exec(text);
  return match ? text.slice(0, match.index) : text;
}

/**
 * Um item do CHANGELOG em uma linha curta: se começar com **Título**, só o título; senão a primeira frase, cortada em ~120
 * caracteres, sem markdown pesado.
 */
export function simplifyItem(raw, maxLength = MAX_ITEM_LENGTH) {
  let text = String(raw || '')
    .trim()
    .replace(/^(?:[-*+]|\d+[.)])\s+/, '')
    .replace(/^\[[ xX]\]\s+/, '')
    .replace(/\s+by @\S+ in https?:\/\/\S+$/i, '');
  const bold = /^\*\*(.+?)\*\*/.exec(text);
  text = bold ? bold[1] : firstSentence(text);
  text = stripMarkdown(text).replace(/[\s:;,.\-–—]+$/, '');
  return truncate(text, maxLength);
}

/** "3 novidades", "1 correção". */
export function countText(kind, count) {
  const info = KINDS[kind];
  return `${count} ${count === 1 ? info.one : info.many}`;
}

/**
 * O relatório que o embed mostra: `groups` = `[{ version, sections: [{ kind, title, items: [texto] }] }]`.
 * Resumo: "✨ 3 novidades · 🐛 2 correções · 🗑️ 1 remoção" (na ordem fixa dos tipos).
 */
export function summaryLine(groups) {
  const totals = new Map();
  for (const group of groups) {
    for (const section of group.sections) {
      totals.set(section.kind, (totals.get(section.kind) || 0) + section.items.length);
    }
  }
  return KIND_ORDER.filter((kind) => kind !== 'upgrade' && totals.get(kind))
    .map((kind) => `${KINDS[kind].emoji} ${countText(kind, totals.get(kind))}`)
    .join(' · ');
}

function renderSection(section, maxItems, source) {
  const info = KINDS[section.kind];
  const label = section.title || (source === 'commits' ? info.commitLabel : info.label);
  const lines = [`${info.emoji} **${label}**`];
  for (const item of section.items.slice(0, maxItems)) lines.push(`• ${item}`);
  const rest = section.items.length - maxItems;
  if (rest > 0) lines.push(`… e mais ${rest}`);
  return lines.join('\n');
}

function renderGroups(groups, maxItems, source) {
  const showVersion = groups.length > 1;
  const blocks = [];
  for (const group of groups) {
    const sections = [...group.sections].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
    const parts = sections.map((section) => renderSection(section, maxItems, source));
    if (showVersion) parts.unshift(`**${group.label || group.version || 'Sem versão'}**`);
    blocks.push(parts.join('\n\n'));
  }
  return blocks.join('\n\n');
}

/**
 * A descrição do embed: resumo + seções. Reduz os itens por seção até caber em `limit` e, no pior caso, corta o texto.
 */
export function buildDescription(groups, { source = 'changelog', limit = 3900, maxItems = MAX_ITEMS_PER_SECTION } = {}) {
  const summary = summaryLine(groups);
  let body = '';
  for (let max = maxItems; max >= 1; max--) {
    body = renderGroups(groups, max, source);
    if ((summary ? summary.length + 2 : 0) + body.length <= limit) break;
  }
  const text = summary ? `${summary}\n\n${body}` : body;
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}

const ROLE_ID = /^\d{1,25}$/;

function httpsUrl(url) {
  return typeof url === 'string' && url.startsWith('https://') ? url : undefined;
}

/**
 * O corpo do webhook do Discord. `data`: { title, url, description, color, repoName, repoUrl, authorName, authorAvatar,
 * orgName, orgAvatar, content?, mentionRoleId?, thumbnail? }.
 * `content` é a linha acima do embed; `mentionRoleId` (só dígitos, senão ignorado) a antecede com a menção ao cargo, o único
 * que a mensagem pode notificar. O total do embed (título, descrição, autor e rodapé) fica abaixo de 6000 caracteres.
 */
export function buildDiscordPayload(data) {
  const title = truncate(data.title, MAX_TITLE);
  const authorName = truncate(data.repoName || 'GitHub', 256);
  const footerText = data.authorName ? truncate(`Por ${data.authorName}`, 2048) : undefined;
  const reserved = title.length + authorName.length + (footerText ? footerText.length : 0);
  const room = Math.max(0, Math.min(MAX_DESCRIPTION, MAX_EMBED_TOTAL - 100 - reserved));
  const description = data.description.length > room ? `${data.description.slice(0, room - 1).trimEnd()}…` : data.description;

  const embed = {
    author: { name: authorName, url: httpsUrl(data.repoUrl) },
    title,
    url: httpsUrl(data.url),
    description,
    color: data.color,
    timestamp: new Date().toISOString()
  };
  if (footerText) {
    embed.footer = { text: footerText };
    const icon = httpsUrl(data.authorAvatar);
    if (icon) embed.footer.icon_url = icon;
  }

  const thumbnail = httpsUrl(data.thumbnail);
  if (thumbnail) embed.thumbnail = { url: thumbnail };

  const payload = { allowed_mentions: { parse: [] }, embeds: [embed] };
  const roleId = data.content && ROLE_ID.test(String(data.mentionRoleId || '').trim()) ? String(data.mentionRoleId).trim() : null;
  if (data.content) {
    payload.content = `${roleId ? `<@&${roleId}> ` : ''}${truncate(data.content, 500)}`;
    if (roleId) payload.allowed_mentions = { parse: [], roles: [roleId] };
  }
  // o Discord recusa nome de webhook com "discord" ou "clyde"; sem nome vale o do próprio webhook
  if (data.orgName && !/discord|clyde/i.test(data.orgName)) payload.username = truncate(data.orgName, 80);
  const avatar = httpsUrl(data.orgAvatar);
  if (avatar) payload.avatar_url = avatar;
  return payload;
}
