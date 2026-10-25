import assert from 'node:assert/strict';
import { test } from 'node:test';

import { summarizeCommits } from '../src/commits.js';
import {
  MAX_DESCRIPTION,
  MAX_EMBED_TOTAL,
  buildDescription,
  buildDiscordPayload,
  simplifyItem,
  summaryLine
} from '../src/format.js';

const REPO = 'https://github.com/o/r';

function embedSize(embed) {
  return [embed.title, embed.description, embed.author?.name, embed.footer?.text].join('').length;
}

test('item com **Título** vira só o título', () => {
  assert.equal(simplifyItem('- **Registro de Decisão (ADR-0003)**: formalização da justificativa do fork.'), 'Registro de Decisão (ADR-0003)');
});

test('sem título em negrito: primeira frase, sem links nem markdown pesado', () => {
  assert.equal(
    simplifyItem('Corrige o **login** em [painel](https://exemplo.invalid/painel/login) rápido. Mais detalhes aqui.'),
    'Corrige o login em painel rápido'
  );
  assert.equal(simplifyItem('feat: novo painel by @ana in https://github.com/o/r/pull/1'), 'feat: novo painel');
});

test('itens longos são cortados em ~120 caracteres e não deixam código aberto', () => {
  const longo = simplifyItem(`${'palavra '.repeat(40)}fim`);
  assert.ok(longo.length <= 120 && longo.endsWith('…'), longo);
  const comCodigo = simplifyItem(`${'a'.repeat(100)} \`um trecho de código bem comprido que passa do limite\``);
  assert.ok(comCodigo.length <= 120 && (comCodigo.match(/`/g) || []).length % 2 === 0, comCodigo);
});

test('resumo com contagens no singular e no plural', () => {
  const groups = [
    {
      version: null,
      sections: [
        { kind: 'removed', title: null, items: ['x'] },
        { kind: 'added', title: null, items: ['a', 'b', 'c'] },
        { kind: 'fixed', title: null, items: ['d', 'e'] }
      ]
    }
  ];
  assert.equal(summaryLine(groups), '✨ 3 novidades · 🐛 2 correções · 🗑️ 1 remoção');
  assert.equal(summaryLine([{ version: null, sections: [{ kind: 'fixed', title: null, items: ['d'] }] }]), '🐛 1 correção');
});

test('no máximo 6 itens por seção e "… e mais N"', () => {
  const items = Array.from({ length: 10 }, (_, n) => `item ${n + 1}`);
  const text = buildDescription([{ version: null, sections: [{ kind: 'added', title: null, items }] }]);
  assert.equal((text.match(/^• /gm) || []).length, 6);
  assert.match(text, /… e mais 4/);
  assert.match(text, /✨ \*\*Adicionado\*\*/);
});

test('com várias versões cada bloco leva o rótulo da versão', () => {
  const text = buildDescription([
    { version: 'a', label: 'v2.0.0 (em preparação)', sections: [{ kind: 'added', title: null, items: ['x'] }] },
    { version: 'b', label: 'v1.0.0', sections: [{ kind: 'fixed', title: null, items: ['y'] }] }
  ]);
  assert.match(text, /\*\*v2\.0\.0 \(em preparação\)\*\*/);
  assert.match(text, /\*\*v1\.0\.0\*\*/);
});

test('a descrição respeita o limite mesmo com centenas de itens', () => {
  const items = Array.from({ length: 300 }, (_, n) => `${'texto '.repeat(18)}${n}`);
  const sections = ['added', 'changed', 'fixed', 'removed', 'security', 'deprecated'].map((kind) => ({
    kind,
    title: null,
    items
  }));
  const text = buildDescription([{ version: null, sections }]);
  assert.ok(text.length <= 3900, String(text.length));
});

test('o corpo do Discord: embed abaixo de 6000, sem menções e só com URLs https', () => {
  const body = buildDiscordPayload({
    title: 'T'.repeat(400),
    url: 'http://inseguro.invalid/x',
    description: 'D'.repeat(9000),
    color: 0x5865f2,
    repoName: 'EmpireMuse',
    repoUrl: REPO,
    authorName: 'ana',
    authorAvatar: 'https://avatars.githubusercontent.com/u/2',
    orgName: 'EmpireCommunity',
    orgAvatar: 'https://avatars.githubusercontent.com/u/1'
  });
  const [embed] = body.embeds;
  assert.ok(embed.title.length <= 256);
  assert.ok(embed.description.length <= MAX_DESCRIPTION);
  assert.ok(embedSize(embed) <= MAX_EMBED_TOTAL, String(embedSize(embed)));
  assert.deepEqual(body.allowed_mentions, { parse: [] });
  assert.equal(embed.url, undefined);
  assert.equal(embed.author.url, REPO);
  assert.equal(embed.footer.text, 'Por ana');
  assert.equal(body.username, 'EmpireCommunity');
  assert.equal(body.avatar_url, 'https://avatars.githubusercontent.com/u/1');
});

test('nome de organização com "discord" não vira username (o Discord recusa)', () => {
  const body = buildDiscordPayload({ title: 't', description: 'd', color: 1, orgName: 'DiscordEmpireHub' });
  assert.equal(body.username, undefined);
});

test('commits: um item por commit, PR linkado, bots agrupados e merge de branch ignorado', () => {
  const commits = [
    { message: 'feat(api): nova rota', author: { username: 'ana' } },
    { message: 'fix: corrige bug (#12)', author: { username: 'ana' } },
    { message: 'Merge pull request #13 from o/branch\n\nperf: acelera busca', author: { username: 'ana' } },
    { message: "Merge branch 'main' into x", author: { username: 'ana' } },
    { message: 'chore(deps): bump a', author: { username: 'dependabot[bot]' } },
    { message: 'chore(deps): bump b', author: { username: 'dependabot[bot]' } },
    { message: 'Atualiza o texto', author: { username: 'ana' } }
  ];
  const [group] = summarizeCommits(commits, REPO);
  const byKind = Object.fromEntries(group.sections.map((section) => [section.kind, section.items]));
  assert.deepEqual(byKind, {
    added: ['nova rota'],
    fixed: [`corrige bug ([#12](${REPO}/pull/12))`],
    perf: [`acelera busca ([#13](${REPO}/pull/13))`],
    other: ['Atualiza o texto'],
    bot: ['2 atualizações automáticas (dependabot)']
  });
  assert.deepEqual(summarizeCommits([{ message: "Merge branch 'x'" }], REPO), []);
});
