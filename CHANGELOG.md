# Changelog

Todas as alterações notáveis neste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [2.1.0] - 2026-10-31

### Alterado
- **Push desligado por padrão**: só a release é anunciada no Discord. Para voltar a anunciar os pushes na branch padrão, defina a variável `ANNOUNCE_PUSH=true` (os pushes ignorados respondem `Ignored push: push-announcements-off`).
- **Título da release** passa a ser `🚀 <Repo> <tag>` (pré-lançamento mantém o selo 🧪).
- Releases mostram até 10 itens por seção (o push segue com 6).

### Adicionado
- **Destaque na release estável**: uma linha acima do embed (`🎉 **Nova versão do <Repo>: <tag>**`), que não aparece no pré-lançamento. Com `RELEASE_MENTION_ROLE_ID` (só dígitos) a linha começa com a menção ao cargo, o único que a mensagem pode notificar (`allowed_mentions.roles`); valor inválido é ignorado.
- **Abertura das notas**: o parágrafo antes do primeiro título (o resumo de uma linha) aparece no topo da descrição, sem markdown pesado e com até 400 caracteres.
- **Seção "Ao atualizar"**: nas notas da release, uma linha só com `**Rótulo:**` vale como título de seção; `**Ao atualizar:**` vira a seção ⚠️ Ao atualizar, a primeira da mensagem, e fora da contagem do resumo.
- **Miniatura** do embed da release com o avatar da organização (só `https`).

## [2.0.0] - 2026-10-24

### Adicionado
- **Uma mensagem por atualização**: o push na branch padrão que mexe no CHANGELOG agora mostra só as linhas acrescentadas, na versão e na seção em que estão, em vez de repetir a primeira seção do arquivo.
- **Resumo com emojis**: título com o projeto e a versão, linha de contagens (`✨ 3 novidades · 🐛 2 correções`) e as seções Adicionado, Alterado, Corrigido, Removido, Segurança e Descontinuado com itens simplificados (até 6 por seção).
- **Fallback por commits**: sem mudança útil no CHANGELOG, o push vira um resumo dos commits (Conventional Commits), com o título do PR linkado nos merges e os commits de bots agrupados.
- **Releases** com a tag no título, notas convertidas em seções e selo de pré-lançamento.
- **Todos os repositórios da organização** por um único webhook de organização; `GITHUB_TOKEN` opcional (somente leitura) para repositórios privados.
- Testes com `node --test` (`npm test`), sem dependências novas.

### Segurança
- **Assinatura do webhook**: o `X-Hub-Signature-256` (HMAC SHA-256 do corpo bruto) é conferido em tempo constante antes de qualquer processamento. Sem `GITHUB_WEBHOOK_SECRET` ou com assinatura inválida a resposta é `401` e nada é enviado.
- Corpo da requisição limitado a 5 MB e lido como texto antes do `JSON.parse`.
- **Removida a URL do webhook do Discord do `wrangler.jsonc`** (o repositório é público): as URLs vêm só de secrets (`DISCORD_WEBHOOK_URL_1`, `_2`…, e `DISCORD_WEBHOOK_URL`). A URL que esteve no histórico deve ser revogada no Discord.
- Só URLs `https://discord.com/api/webhooks/…` são chamadas; erros não incluem URLs nem segredos; as mensagens não notificam ninguém (`allowed_mentions` vazio).

### Alterado
- Código separado em módulos de funções puras (`security`, `events`, `changelog`, `commits`, `kinds`, `format`, `github`, `discord`) e um handler fino.
- README reescrito (organização EmpireCommunity, webhook de organização, secrets e exemplo de mensagem).

### Removido
- O bloco `vars` do `wrangler.jsonc`. **Ação necessária ao atualizar:** configurar os secrets `GITHUB_WEBHOOK_SECRET` e `DISCORD_WEBHOOK_URL_1` e usar o mesmo segredo no webhook do GitHub.

## [1.0.0] - 2026-10-21

### Adicionado
- Worker Cloudflare para recepção de webhooks do GitHub na organização DiscordEmpireHub.
- Suporte a notificações de atualizações baseadas em arquivos `CHANGELOG.md` via eventos `push`.
- Suporte a eventos de `release` nativos do GitHub.
- Parser inteligente do padrão Keep a Changelog com extração da última versão e truncamento seguro para embeds do Discord.
- Tratamento de evento `ping` do GitHub Webhooks para facilitar testes de conexão.
- Configurações padronizadas de build no Cloudflare Workers via Bun/Node.js com `wrangler` em `dependencies`.
