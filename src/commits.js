/**
 * Resumo dos commits de um push (Conventional Commits), usado quando o push não mexeu no CHANGELOG.
 */

import { classifyConventional } from './kinds.js';
import { simplifyItem } from './format.js';

const MERGE_PR = /^Merge pull request #(\d+) from \S+/i;
const MERGE_OTHER = /^Merge (branch|remote-tracking branch|tag)\b/i;
const SQUASH_PR = /\s*\(#(\d+)\)\s*$/;
const BOT_NAME = /\[bot\]$|^(dependabot|renovate|github-actions|pre-commit-ci|snyk-bot|imgbot)/i;

/** O nome do bot (sem `[bot]`) se o commit é de um bot; null se for de uma pessoa. */
export function botName(commit) {
  const name = commit?.author?.username || commit?.author?.name || '';
  if (!BOT_NAME.test(name)) return null;
  return name.replace(/\[bot\]$/i, '') || 'bot';
}

function prLink(repoUrl, number) {
  return repoUrl && repoUrl.startsWith('https://')
    ? `[#${number}](${repoUrl}/pull/${number})`
    : `#${number}`;
}

/**
 * Os commits do push em `[{ version: null, sections }]`: um item por commit na seção do tipo (feat, fix, …), commits de bots
 * numa linha só por bot, merges de PR pelo título do PR (com link) e merges de branch ignorados.
 */
export function summarizeCommits(commits, repoUrl) {
  const sections = new Map();
  const bots = new Map();
  const put = (kind, item) => {
    if (!sections.has(kind)) sections.set(kind, { kind, title: null, items: [] });
    const items = sections.get(kind).items;
    if (!items.includes(item)) items.push(item);
  };

  for (const commit of commits || []) {
    const lines = String(commit.message || '')
      .split(/\r?\n/)
      .map((line) => line.trim());
    const first = lines[0] || '';
    const bot = botName(commit);
    if (bot) {
      bots.set(bot, (bots.get(bot) || 0) + 1);
      continue;
    }
    if (!first || MERGE_OTHER.test(first)) continue;

    let title = first;
    let pr = null;
    const merge = MERGE_PR.exec(first);
    if (merge) {
      pr = merge[1];
      title = lines.slice(1).find(Boolean) || `Pull request #${pr}`;
    } else {
      const squash = SQUASH_PR.exec(first);
      if (squash) {
        pr = squash[1];
        title = first.replace(SQUASH_PR, '');
      }
    }

    const conventional = classifyConventional(title);
    const item = simplifyItem(conventional ? conventional.text : title);
    if (!item) continue;
    put(conventional ? conventional.kind : 'other', pr ? `${item} (${prLink(repoUrl, pr)})` : item);
  }

  for (const [name, count] of bots) {
    put('bot', `${count} ${count === 1 ? 'atualização automática' : 'atualizações automáticas'} (${name})`);
  }
  return sections.size ? [{ version: null, sections: [...sections.values()] }] : [];
}
