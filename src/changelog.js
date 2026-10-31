/**
 * CHANGELOG (Keep a Changelog): o que mudou entre duas versões do arquivo, agrupado por versão (`##`) e seção (`###`).
 */

import { classifySection, classifyConventional } from './kinds.js';
import { MAX_INTRO_LENGTH, simplifyItem, stripMarkdown, truncate } from './format.js';

const BULLET = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const FENCE = /^\s*(```|~~~)/;
const REFERENCE_LINK = /^\[[^\]]+\]:\s*\S+/;
// uma linha só com `**Rótulo:**` (ou `**Rótulo**:`) vale como cabeçalho de seção nas notas de release
const BOLD_LABEL = /^\s*(?:\*\*([^*\n]+?):\*\*|\*\*([^*\n]+?)\*\*:)\s*$/;
const CHANGELOG_PATH = /(^|\/)(changelog|changes)(\.md|\.markdown|\.txt)?$/i;

/** Dos arquivos tocados pelos commits, o CHANGELOG mais perto da raiz; null se nenhum. */
export function findChangelogPath(commits) {
  const paths = new Set();
  for (const commit of commits || []) {
    for (const file of [...(commit.added || []), ...(commit.modified || [])]) {
      if (CHANGELOG_PATH.test(file)) paths.add(file);
    }
  }
  const sorted = [...paths].sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
  return sorted[0] || null;
}

/** Linhas do `novo` que não existem no `antigo`, por multiconjunto (uma linha repetida só some quantas vezes já existia). */
export function addedLineIndexes(oldText, newText) {
  const counts = new Map();
  for (const line of String(oldText || '').split(/\r?\n/)) {
    const key = line.trim();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const added = new Set();
  String(newText || '')
    .split(/\r?\n/)
    .forEach((line, index) => {
      const key = line.trim();
      const left = counts.get(key) || 0;
      if (left > 0) counts.set(key, left - 1);
      else added.add(index);
    });
  return added;
}

/** Os itens (listas) do arquivo, cada um com a versão, a seção e o item "pai" (a lista de nível acima) em que está. */
export function parseBullets(markdown) {
  const bullets = [];
  const stack = [];
  let version = null;
  let section = null;
  let inFence = false;
  String(markdown || '')
    .split(/\r?\n/)
    .forEach((line, index) => {
      if (FENCE.test(line)) {
        inFence = !inFence;
        return;
      }
      if (inFence || REFERENCE_LINK.test(line.trim())) return;
      const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
      if (heading) {
        if (heading[1].length === 2) {
          version = heading[2];
          section = null;
        } else if (heading[1].length >= 3) {
          section = heading[2];
        }
        stack.length = 0;
        return;
      }
      const match = BULLET.exec(line);
      if (!match) return;
      const indent = match[1].replace(/\t/g, '    ').length;
      while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
      const bullet = { index, indent, text: match[3], version, section, parent: stack.length ? stack[stack.length - 1] : null };
      stack.push(bullet);
      bullets.push(bullet);
    });
  return bullets;
}

function addTo(groups, version, kind, title, item) {
  let group = groups.find((g) => g.version === version);
  if (!group) {
    group = { version, sections: [] };
    groups.push(group);
  }
  let section = group.sections.find((s) => s.kind === kind && s.title === title);
  if (!section) {
    section = { kind, title, items: [] };
    group.sections.push(section);
  }
  if (item && !section.items.includes(item)) section.items.push(item);
}

/**
 * O que o push acrescentou ao CHANGELOG: só as linhas novas, na versão e seção onde estão.
 * Com o arquivo antigo ausente (`oldText` null), tudo é novo, mas fica só a primeira versão do arquivo (o topo).
 * Item novo dentro de outro item novo vale só pelo pai.
 */
export function extractAddedChanges(oldText, newText) {
  const bullets = parseBullets(newText);
  const everythingNew = oldText === null || oldText === undefined;
  const added = everythingNew ? null : addedLineIndexes(oldText, newText);
  const firstVersion = bullets.length ? bullets[0].version : null;
  const isNew = (bullet) => (everythingNew ? bullet.version === firstVersion : added.has(bullet.index));
  const groups = [];
  for (const bullet of bullets) {
    if (!isNew(bullet) || (bullet.parent && isNew(bullet.parent))) continue;
    const item = simplifyItem(bullet.text);
    if (!item) continue;
    const { kind, title } = classifySection(bullet.section);
    addTo(groups, bullet.version, kind, title, item);
  }
  return groups;
}

/**
 * As notas de uma release do GitHub, no mesmo formato de grupos. Aceita seções `##`/`###` e listas; itens soltos em
 * seção genérica ("What's Changed") são classificados pelo prefixo de Conventional Commits quando houver.
 * Devolve [] se não houver nenhuma lista.
 */
export function parseReleaseNotes(body) {
  const groups = [];
  let section = null;
  let inFence = false;
  for (const line of String(body || '').split(/\r?\n/)) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const heading = /^#{2,4}\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      section = heading[1];
      continue;
    }
    const label = BOLD_LABEL.exec(line);
    if (label) {
      section = label[1] || label[2];
      continue;
    }
    const match = BULLET.exec(line);
    if (!match || /^\*\*full changelog\*\*/i.test(match[3]) || match[1].length > 3) continue;
    const classified = classifySection(section);
    let { kind, title } = classified;
    let text = match[3].replace(/^\[[ xX]\]\s+/, '');
    if (kind === 'other') {
      const conventional = classifyConventional(text);
      if (conventional) {
        kind = conventional.kind;
        title = null;
        text = conventional.text;
      } else if (title && /what'?s changed|mudan[çc]as|changes/i.test(title)) {
        title = null;
      }
    }
    const item = simplifyItem(text);
    if (item) addTo(groups, null, kind, title, item);
  }
  return groups;
}

/**
 * O parágrafo de abertura das notas: o texto antes do primeiro título, item de lista ou rótulo em negrito, sem markdown pesado
 * e cortado em `max` caracteres. String vazia se não houver.
 */
export function releaseIntro(body, max = MAX_INTRO_LENGTH) {
  const lines = [];
  for (const line of String(body || '').split(/\r?\n/)) {
    if (FENCE.test(line) || /^\s*#{1,6}\s/.test(line) || BULLET.test(line) || BOLD_LABEL.test(line)) break;
    if (line.trim()) lines.push(line.trim());
    else if (lines.length) break;
  }
  return truncate(stripMarkdown(lines.join(' ')), max);
}

const UNRELEASED = /unreleased|n[ãa]o lan[çc]ad|em desenvolvimento|em prepara[çc][ãa]o|pr[óo]xima vers[ãa]o|\bnext\b/i;

/** A versão e o rótulo de um cabeçalho `##` ("[2.0.0] - em preparação" → `v2.0.0 (em preparação)`). */
export function describeVersion(header) {
  const text = String(header || '').trim();
  const unreleased = UNRELEASED.test(text);
  const match = /v?(\d+(?:\.\d+){1,3}(?:[-+][0-9A-Za-z.-]+)?)/.exec(text);
  const version = match ? match[1] : null;
  let label;
  if (version) label = `v${version}${unreleased ? ' (em preparação)' : ''}`;
  else if (unreleased) label = 'Próxima versão (em preparação)';
  else label = text.replace(/[[\]]/g, '') || 'Sem versão';
  return { version, unreleased, label };
}
