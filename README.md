# 🚀 DiscordEmpireHub — GitHub Worker Relay

Cloudflare Worker serverless que captura webhooks da organização [DiscordEmpireHub](https://github.com/DiscordEmpireHub) e publica notificações ricas e detalhadas no Discord com o resumo de novidades de cada projeto sempre que uma nova versão ou atualização no `CHANGELOG.md` é aplicada.

---

## 🎯 Objetivo

Manter a comunidade e equipe atualizadas em tempo real sobre o desenvolvimento dos projetos da organização (como [`EmpireMuse`](https://github.com/DiscordEmpireHub/EmpireMuse), [`EmpireHub`](https://github.com/DiscordEmpireHub/EmpireHub), [`EmpireEngine`](https://github.com/DiscordEmpireHub/EmpireEngine), [`EmpireSite`](https://github.com/DiscordEmpireHub/EmpireSite), [`EmpireGames`](https://github.com/DiscordEmpireHub/EmpireGames), [`EmpireGamesDevelopment`](https://github.com/DiscordEmpireHub/EmpireGamesDevelopment), [`EmpireMuse-RPC-app`](https://github.com/DiscordEmpireHub/EmpireMuse-RPC-app), [`EmpireBot`](https://github.com/DiscordEmpireHub/EmpireBot), etc.), transformando commits e alterações em `CHANGELOG.md` ou publicações de releases em embeds informativos e legíveis no Discord.

---

## ✨ Funcionalidades

- **Monitoramento de `CHANGELOG.md` via `push`**:
  - Filtra pushes direcionados para as branches principais (`main` ou `master`).
  - Detecta quando arquivos de changelog (`CHANGELOG.md`, `changelog.md`, `changes.md`) são modificados ou adicionados.
  - Extrai a versão mais recente seguindo o padrão [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) (incluindo `## [Unreleased]` ou versões semânticas como `## [1.0.0]`).
- **Suporte a Releases Nativas (`release`)**:
  - Envia avisos com visual destacado para publicações oficiais ou pré-lançamentos criados no GitHub Releases.
- **Formatação Otimizada para o Discord**:
  - Renderiza embeds elegantes com avatar do autor/organização, links diretos para o commit ou release e cores temáticas por status.
  - Truncamento defensivo para respeitar os limites de caracteres do Discord (máximo de 4096 caracteres na descrição de embeds).
- **Tratamento de Ping**:
  - Responde com `HTTP 200` ao evento de teste (`ping`) enviado pelo GitHub ao cadastrar o webhook na organização.

---

## 🏗️ Estrutura do Projeto

```
github-worker-relay/
├── src/
│   └── index.js         # Lógica do Worker, roteamento de webhooks e formatação Discord
├── CHANGELOG.md         # Registro de versões do Worker
├── package.json         # Dependências (wrangler) e scripts
├── wrangler.toml        # Configuração do Cloudflare Worker
└── README.md            # Documentação técnica
```

---

## ⚙️ Configuração e Implantação

### 1. Variáveis de Ambiente no Cloudflare Workers

No painel do Cloudflare Workers (em **Settings > Variables and Secrets** ou **Variáveis de ambiente**), defina:

| Variável | Descrição | Exemplo |
| :--- | :--- | :--- |
| `DISCORD_WEBHOOK_URL` | URL do Webhook do canal de texto no Discord | `https://discord.com/api/webhooks/...` |

### 2. Configurações de Build no Cloudflare Workers

Para o deploy automático conectado ao repositório GitHub:

- **Build command**: `bun install` *(ou deixe vazio se o Cloudflare executar o install automaticamente)*
- **Deploy command**: `npx wrangler deploy` *(ou utilize o script `bun run deploy`)*
- **Root directory**: `/`

> 💡 **Nota sobre o erro `/bin/sh: 1: wrangler: not found`**:  
> O Cloudflare CI executa comandos em uma sandbox limpa. Para garantir que o binário do Wrangler seja localizado globalmente durante o deploy command, declare o comando como:
> ```bash
> npx wrangler deploy
> ```
> ou certifique-se de que `wrangler` esteja em `dependencies` no `package.json` e o comando de deploy chame `npx wrangler deploy`.

---

## 🔗 Configuração do Webhook no GitHub

Para escutar todos os projetos da organização:

1. Acesse as configurações da organização:  
   `https://github.com/organizations/DiscordEmpireHub/settings/hooks`
2. Clique em **Add webhook**:
   - **Payload URL**: `https://<seu-worker>.<seu-subdominio>.workers.dev`
   - **Content type**: `application/json`
   - **Which events would you like to trigger this webhook?**:
     - Selecione **Let me select individual events**:
       - ☑️ **Pushes** (para detectar atualizações de `CHANGELOG.md` na branch principal)
       - ☑️ **Releases** (para anúncios de versões publicadas)
   - Marque **Active**.
3. Ao salvar, o GitHub enviará um evento `ping` e receberá a confirmação `200 OK`.

---

## 📝 Padronização de Changelog Recomendada

Para que o Worker capture corretamente as alterações em todos os repositórios da organização, utilize o formato padrão do [Keep a Changelog](https://keepachangelog.com/pt-BR/):

```markdown
# Changelog

## [1.2.0] - 2026-10-21
### Adicionado
- Nova funcionalidade incrível.

### Corrigido
- Correção de bug no sistema de login.

## [1.1.0] - 2026-10-15
...
```

Caso esteja trabalhando continuamente na branch principal sem fechar uma versão semântica, você pode manter a seção `## [Unreleased]`, e o Worker a notificará como **[EM DESENVOLVIMENTO (MAIN)]**.
