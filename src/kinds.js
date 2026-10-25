/**
 * Tipos de mudança: o emoji, o nome da seção e o texto do resumo, tanto para as seções do CHANGELOG (Keep a Changelog) quanto
 * para os tipos de Conventional Commits.
 */

export const KINDS = {
  added: { emoji: '✨', label: 'Adicionado', commitLabel: 'Novidades', one: 'novidade', many: 'novidades' },
  changed: { emoji: '🔄', label: 'Alterado', commitLabel: 'Alterações', one: 'alteração', many: 'alterações' },
  fixed: { emoji: '🐛', label: 'Corrigido', commitLabel: 'Correções', one: 'correção', many: 'correções' },
  removed: { emoji: '🗑️', label: 'Removido', commitLabel: 'Remoções', one: 'remoção', many: 'remoções' },
  security: {
    emoji: '🔒',
    label: 'Segurança',
    commitLabel: 'Segurança',
    one: 'item de segurança',
    many: 'itens de segurança'
  },
  deprecated: {
    emoji: '⚠️',
    label: 'Descontinuado',
    commitLabel: 'Descontinuações',
    one: 'descontinuação',
    many: 'descontinuações'
  },
  perf: {
    emoji: '⚡',
    label: 'Desempenho',
    commitLabel: 'Desempenho',
    one: 'melhoria de desempenho',
    many: 'melhorias de desempenho'
  },
  refactor: { emoji: '♻️', label: 'Refatoração', commitLabel: 'Refatoração', one: 'refatoração', many: 'refatorações' },
  docs: {
    emoji: '📝',
    label: 'Documentação',
    commitLabel: 'Documentação',
    one: 'atualização de documentação',
    many: 'atualizações de documentação'
  },
  test: { emoji: '✅', label: 'Testes', commitLabel: 'Testes', one: 'teste', many: 'testes' },
  infra: { emoji: '👷', label: 'Infra', commitLabel: 'Infra', one: 'ajuste de infra', many: 'ajustes de infra' },
  chore: {
    emoji: '🔧',
    label: 'Manutenção',
    commitLabel: 'Manutenção',
    one: 'tarefa de manutenção',
    many: 'tarefas de manutenção'
  },
  revert: { emoji: '⏪', label: 'Reversões', commitLabel: 'Reversões', one: 'reversão', many: 'reversões' },
  bot: {
    emoji: '🤖',
    label: 'Automação',
    commitLabel: 'Automação',
    one: 'atualização automática',
    many: 'atualizações automáticas'
  },
  other: { emoji: '📌', label: 'Outras mudanças', commitLabel: 'Outras mudanças', one: 'outra mudança', many: 'outras mudanças' }
};

/** Ordem de exibição das seções. */
export const KIND_ORDER = [
  'added',
  'changed',
  'fixed',
  'removed',
  'security',
  'deprecated',
  'perf',
  'refactor',
  'docs',
  'test',
  'infra',
  'chore',
  'revert',
  'bot',
  'other'
];

const SECTION_PATTERNS = [
  ['added', /^(adicionad|added|novo|nova|novidade|new\b|features?\b)/i],
  ['changed', /^(alterad|changed|modificad|mudan[çc]a|atualizad|updated)/i],
  ['fixed', /^(corrigid|fixed|corre[çc][ãa]o|corre[çc][õo]es|bug ?fix)/i],
  ['removed', /^(removid|removed)/i],
  ['security', /^(seguran[çc]a|security)/i],
  ['deprecated', /^(descontinuad|deprecated|obsolet)/i]
];

/** O tipo de uma seção `###` do CHANGELOG ("Adicionado", "Fixed", …); `other` (com o título original) se não reconhecer. */
export function classifySection(heading) {
  const text = String(heading || '').trim();
  for (const [kind, pattern] of SECTION_PATTERNS) {
    if (pattern.test(text)) return { kind, title: null };
  }
  return { kind: 'other', title: text || null };
}

const COMMIT_TYPES = {
  feat: 'added',
  feature: 'added',
  fix: 'fixed',
  perf: 'perf',
  refactor: 'refactor',
  docs: 'docs',
  doc: 'docs',
  test: 'test',
  tests: 'test',
  ci: 'infra',
  build: 'infra',
  chore: 'chore',
  style: 'chore',
  revert: 'revert',
  security: 'security',
  sec: 'security'
};

const CONVENTIONAL = /^(\w+)(?:\(([^)]*)\))?(!)?:\s+(.+)$/s;

/** `{ kind, text }` de uma linha no padrão Conventional Commits; null se não seguir o padrão ou o tipo for desconhecido. */
export function classifyConventional(line) {
  const match = CONVENTIONAL.exec(String(line || '').trim());
  if (!match) return null;
  const kind = COMMIT_TYPES[match[1].toLowerCase()];
  if (!kind) return null;
  return { kind, text: match[4].trim(), scope: match[2] || null, breaking: Boolean(match[3]) };
}
