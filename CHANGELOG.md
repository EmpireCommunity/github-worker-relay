# Changelog

Todas as alterações notáveis neste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [1.0.0] - 2026-10-21

### Adicionado
- Worker Cloudflare para recepção de webhooks do GitHub na organização DiscordEmpireHub.
- Suporte a notificações de atualizações baseadas em arquivos `CHANGELOG.md` via eventos `push`.
- Suporte a eventos de `release` nativos do GitHub.
- Parser inteligente do padrão Keep a Changelog com extração da última versão e truncamento seguro para embeds do Discord.
- Tratamento de evento `ping` do GitHub Webhooks para facilitar testes de conexão.
- Configurações padronizadas de build no Cloudflare Workers via Bun/Node.js com `wrangler` em `dependencies`.
