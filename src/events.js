/**
 * Dos eventos do GitHub (push e release) ao conteúdo da mensagem. Sem I/O próprio: a leitura de arquivos entra por `fetchFile`.
 */

import { describeVersion, extractAddedChanges, findChangelogPath, parseReleaseNotes, releaseIntro } from './changelog.js';
import { summarizeCommits } from './commits.js';
import { buildDescription, COLORS, MAX_INTRO_LENGTH, MAX_RELEASE_ITEMS_PER_SECTION, stripMarkdown, truncate } from './format.js';

const ZERO_SHA = /^0+$/;

function orgInfo(payload) {
  return {
    orgName: payload.organization?.login || payload.repository?.owner?.login,
    orgAvatar: payload.organization?.avatar_url || payload.repository?.owner?.avatar_url
  };
}

/** `ANNOUNCE_PUSH` ligado ("true", sem diferenciar maiúsculas). Sem isso o push não vira mensagem: só a release anuncia. */
export function pushAnnouncementsOn(env) {
  return String(env?.ANNOUNCE_PUSH ?? '').trim().toLowerCase() === 'true';
}

/**
 * Por que o push NÃO vira mensagem (texto), ou null se deve virar: com `ANNOUNCE_PUSH` ligado, só a branch padrão, com
 * commits, sem tag nem remoção.
 */
export function pushIgnoreReason(payload, env) {
  if (!pushAnnouncementsOn(env)) return 'push-announcements-off';
  const branch = payload.repository?.default_branch;
  if (!branch || payload.ref !== `refs/heads/${branch}`) return 'not-default-branch';
  if (payload.deleted) return 'deleted';
  if (ZERO_SHA.test(payload.before || '')) return 'new-branch';
  if (!Array.isArray(payload.commits) || payload.commits.length === 0) return 'no-commits';
  return null;
}

/**
 * A mensagem de um push na branch padrão: as linhas ACRESCENTADAS ao CHANGELOG (versão e seção de cada uma) ou, sem isso,
 * os commits. `fetchFile(sha, path)` devolve o texto do arquivo naquele commit, ou null se não existir.
 * Devolve null se não houver nada útil a contar.
 */
export async function buildPushMessage(payload, fetchFile) {
  const repo = payload.repository;
  const branch = repo.default_branch;
  let groups = [];
  let source = 'commits';

  const path = findChangelogPath(payload.commits);
  if (path) {
    try {
      const [before, after] = await Promise.all([fetchFile(payload.before, path), fetchFile(payload.after, path)]);
      if (after !== null) groups = extractAddedChanges(before, after);
    } catch (error) {
      console.error(`relay: não foi possível ler o CHANGELOG (${String(error.message).slice(0, 120)})`);
    }
    if (groups.length) source = 'changelog';
  }
  if (!groups.length) groups = summarizeCommits(payload.commits, repo.html_url);
  if (!groups.length) return null;

  let title = `🛠️ ${repo.name} · atualização na ${branch}`;
  if (source === 'changelog') {
    for (const group of groups) group.label = describeVersion(group.version).label;
    title = `🛠️ ${repo.name} · ${groups[0].label}`;
  }

  return {
    title,
    url: payload.compare || repo.html_url,
    description: buildDescription(groups, { source }),
    color: COLORS.push,
    repoName: repo.name,
    repoUrl: repo.html_url,
    authorName: payload.pusher?.name || payload.sender?.login,
    authorAvatar: payload.sender?.avatar_url,
    ...orgInfo(payload)
  };
}

/** A tag na linha de destaque: só letras, dígitos e . _ + - / (o `_` escapado); sem sintaxe de menção nem de markdown. */
const safeTag = (tag) => tag.replace(/[^\p{L}\p{N}._+\-/ ]/gu, '').replace(/_/g, '\\_');

/**
 * A mensagem de uma release publicada: título com a tag, linha de destaque acima do embed (só na estável, com a menção
 * opcional ao cargo `mentionRoleId`), abertura das notas, seções com até 10 itens e o avatar da organização como miniatura.
 * Pré-lançamento ganha o selo e fica sem destaque nem menção. Null se não for "published".
 */
export function buildReleaseMessage(payload, { mentionRoleId } = {}) {
  const release = payload.release;
  if (payload.action !== 'published' || !release) return null;
  const repo = payload.repository;
  const tag = String(release.tag_name || release.name || 'nova release');
  const tagLabel = /^v/i.test(tag) || !/^\d/.test(tag) ? tag : `v${tag}`;
  const groups = parseReleaseNotes(release.body);

  let prefix = '';
  const name = String(release.name || '').trim();
  if (name && name !== tag && name !== tagLabel) prefix = `**${truncate(stripMarkdown(name), 150)}**\n\n`;
  const intro = groups.length ? releaseIntro(release.body) : '';
  if (intro) prefix += `${intro}\n\n`;

  const description = groups.length
    ? prefix + buildDescription(groups, { source: 'changelog', limit: 3900 - prefix.length, maxItems: MAX_RELEASE_ITEMS_PER_SECTION })
    : prefix + (truncate(stripMarkdown(String(release.body || '')), MAX_INTRO_LENGTH) || 'Sem notas de versão.');
  const prerelease = Boolean(release.prerelease);
  const org = orgInfo(payload);

  return {
    title: `🚀 ${repo.name} ${tagLabel}${prerelease ? ' · 🧪 Pré-lançamento' : ''}`,
    ...(prerelease ? {} : { content: `🎉 **Nova versão do ${repo.name}: ${safeTag(tagLabel)}**`, mentionRoleId }),
    url: release.html_url || repo.html_url,
    description,
    color: prerelease ? COLORS.prerelease : COLORS.release,
    repoName: repo.name,
    repoUrl: repo.html_url,
    authorName: release.author?.login || payload.sender?.login,
    authorAvatar: release.author?.avatar_url || payload.sender?.avatar_url,
    thumbnail: org.orgAvatar,
    ...org
  };
}
