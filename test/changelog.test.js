import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  addedLineIndexes,
  describeVersion,
  extractAddedChanges,
  findChangelogPath,
  parseReleaseNotes
} from '../src/changelog.js';

const OLD = `# Changelog

## [Unreleased]

### Adicionado
- **Existente**: já estava.

## [1.0.0] - 2026-01-01

### Corrigido
- Bug antigo.
`;

const NEW = `# Changelog

## [Unreleased]

### Adicionado
- **Existente**: já estava.
- **Recurso novo**: faz algo útil e importante.
  - detalhe de um item novo

### Corrigido
- Corrige o login. Detalhe extra que não entra.

## [1.0.0] - 2026-01-01

### Corrigido
- Bug antigo.
- Outro bug antigo.
`;

const shape = (groups) =>
  groups.map((group) => ({
    version: group.version,
    sections: group.sections.map((section) => [section.kind, section.items])
  }));

test('o diff por multiconjunto marca só as linhas que não existiam', () => {
  assert.deepEqual([...addedLineIndexes('a\nb\nb', 'b\nb\nb\nc')], [2, 3]);
  assert.deepEqual([...addedLineIndexes('a', 'a')], []);
});

test('só as linhas novas entram, agrupadas pela versão e pela seção em que estão', () => {
  assert.deepEqual(shape(extractAddedChanges(OLD, NEW)), [
    {
      version: '[Unreleased]',
      sections: [
        ['added', ['Recurso novo']],
        ['fixed', ['Corrige o login']]
      ]
    },
    { version: '[1.0.0] - 2026-01-01', sections: [['fixed', ['Outro bug antigo']]] }
  ]);
});

test('sem mudança útil no arquivo o resultado é vazio', () => {
  assert.deepEqual(extractAddedChanges(NEW, NEW), []);
});

test('sem o arquivo antigo tudo é novo, mas só a primeira versão (o topo)', () => {
  const groups = shape(extractAddedChanges(null, NEW));
  assert.equal(groups.length, 1);
  assert.equal(groups[0].version, '[Unreleased]');
  assert.deepEqual(groups[0].sections[0], ['added', ['Existente', 'Recurso novo']]);
});

test('seções em inglês e títulos desconhecidos são reconhecidos', () => {
  const markdown = `## [1.1.0]\n\n### Added\n- one\n\n### Security\n- two\n\n### Interno\n- three\n`;
  const groups = extractAddedChanges('', markdown);
  assert.deepEqual(
    groups[0].sections.map((section) => [section.kind, section.title, section.items]),
    [
      ['added', null, ['one']],
      ['security', null, ['two']],
      ['other', 'Interno', ['three']]
    ]
  );
});

test('versão e rótulo do cabeçalho', () => {
  assert.deepEqual(describeVersion('[2.0.0] - em preparação'), {
    version: '2.0.0',
    unreleased: true,
    label: 'v2.0.0 (em preparação)'
  });
  assert.equal(describeVersion('[Unreleased]').label, 'Próxima versão (em preparação)');
  assert.equal(describeVersion('[1.2.0] - 2026-10-21').label, 'v1.2.0');
});

test('acha o CHANGELOG mais perto da raiz entre os arquivos dos commits', () => {
  const commits = [{ added: ['src/changelog_utils.js'], modified: ['docs/CHANGELOG.md', 'CHANGES', 'README.md'] }];
  assert.equal(findChangelogPath(commits), 'CHANGES');
  assert.equal(findChangelogPath([{ modified: ['src/a.js'] }]), null);
});

test('notas de release: seções, listas do GitHub e Conventional Commits', () => {
  const generated = `## What's Changed
* feat(web): novo painel by @ana in https://github.com/o/r/pull/1
* fix: corrige login by @bia in https://github.com/o/r/pull/2

**Full Changelog**: https://github.com/o/r/compare/v1...v2`;
  assert.deepEqual(shape(parseReleaseNotes(generated)), [
    {
      version: null,
      sections: [
        ['added', ['novo painel']],
        ['fixed', ['corrige login']]
      ]
    }
  ]);
  assert.deepEqual(shape(parseReleaseNotes('### Removido\n- **Antigo**: saiu.')), [
    { version: null, sections: [['removed', ['Antigo']]] }
  ]);
  assert.deepEqual(parseReleaseNotes('Só um texto, sem lista.'), []);
});
