# 🚀 GitHub Worker Relay

Cloudflare Worker que recebe os webhooks da organização [EmpireCommunity](https://github.com/EmpireCommunity) e publica no Discord **uma mensagem por atualização**, com o título do projeto e da versão e um resumo simples do que foi adicionado, alterado, corrigido ou removido.

Funciona para **todos os repositórios** da organização com um único webhook de organização.

---

## ✨ O que ele faz

### Push na branch padrão (desligado por padrão)

**Por padrão o push não é anunciado**: só a release vira mensagem. Para anunciar também os pushes, defina a variável `ANNOUNCE_PUSH=true` (veja [Variáveis do worker](#-variáveis-do-worker)); sem ela o worker responde `200` com `Ignored push: push-announcements-off`. Com a variável ligada vale o que segue.

Só conta o push na branch padrão do repositório (`default_branch`). Tags, outras branches, remoções, branches novas e pushes sem commits são ignorados.

1. **Se algum commit mexeu no `CHANGELOG`** (`CHANGELOG.md`, `CHANGELOG`, `CHANGES.md`…): o worker baixa o arquivo antes (`before`) e depois (`after`) do push, compara as linhas e mostra **só o que foi acrescentado**, na versão (`##`) e na seção (`###`) em que cada linha nova está. Assim a mensagem muda a cada atualização, e não repete o texto de sempre.
2. **Sem mudança útil no CHANGELOG**: usa os commits do push (Conventional Commits).

| Tipo do commit | Seção |
| :--- | :--- |
| `feat` | ✨ Novidades |
| `fix` | 🐛 Correções |
| `perf` | ⚡ Desempenho |
| `refactor` | ♻️ Refatoração |
| `docs` | 📝 Documentação |
| `test` | ✅ Testes |
| `ci`, `build` | 👷 Infra |
| `chore` | 🔧 Manutenção |
| `revert` | ⏪ Reversões |
| `security`, `sec` | 🔒 Segurança |

`Merge pull request #N from …` usa o título do PR (a segunda linha da mensagem) e linka o PR; merges de branch são ignorados e os commits de bots (dependabot e afins) viram uma linha por bot.

### Release publicada

A release estável é anunciada com destaque:

- uma linha **acima do embed**: `🎉 **Nova versão do <Repo>: <tag>**`, com a menção ao cargo à frente se `RELEASE_MENTION_ROLE_ID` estiver definido (a mensagem só notifica esse cargo);
- o título leva a tag (`🚀 <Repo> v2.0.0`) e a miniatura é o avatar da organização;
- o **parágrafo de abertura** das notas (o texto antes do primeiro título, até 400 caracteres e sem markdown pesado) vem no topo;
- uma linha só com `**Rótulo:**` vale como título de seção; `**Ao atualizar:**` vira a seção ⚠️ **Ao atualizar**, sempre a primeira;
- as demais notas viram o mesmo formato de seções (`###` ou listas), com até **10 itens por seção**.

Pré-lançamento ganha o selo 🧪 e a cor amarela, sem a linha de destaque nem menção.

### Exemplo de mensagem

```
🛠️ EmpireMuse · v2.0.0 (em preparação)
✨ 2 novidades · 🐛 1 correção · 🗑️ 1 remoção

✨ Adicionado
• Painel web
• Relé RPC com keepalive

🐛 Corrigido
• Conexões do relé RPC caíam atrás da Cloudflare

🗑️ Removido
• Leitor do formato antigo (`pickle`)
```

Cada item é simplificado: se a linha do CHANGELOG começa com `**Título**:`, só o título aparece; senão, a primeira frase, cortada em ~120 caracteres e sem links nem markdown pesado. No máximo 6 itens por seção (`… e mais N`), dentro dos limites do Discord (4096 caracteres na descrição e 6000 no embed).

| Evento | Título | Cor |
| :--- | :--- | :--- |
| Release | `🚀 <Repo> v<versão>` | verde |
| Pré-lançamento | `🚀 <Repo> v<versão> · 🧪 Pré-lançamento` | amarela |
| Push (só com `ANNOUNCE_PUSH=true`) | `🛠️ <Repo> · v<versão> (em preparação)` ou `🛠️ <Repo> · atualização na main` | azul |

O rodapé mostra quem fez o push ou a release; o nome e o avatar do webhook são os da organização.

---

## 🔗 Configurar o webhook da organização no GitHub

1. Abra `https://github.com/organizations/EmpireCommunity/settings/hooks` e clique em **Add webhook**.
2. Preencha:
   - **Payload URL**: `https://github-relay.empirehub.com.br/`
   - **Content type**: `application/json`
   - **Secret**: um texto longo e aleatório (o mesmo valor do secret `GITHUB_WEBHOOK_SECRET` do worker, abaixo)
   - **Which events…**: *Let me select individual events* → marque **Releases** (e **Pushes**, só se for ligar `ANNOUNCE_PUSH`)
   - Marque **Active**.
3. Ao salvar, o GitHub envia um `ping` assinado; a entrega deve aparecer como `200`.

---

## 🔐 Secrets do worker

**Nada de URL ou segredo vai para o repositório** (ele é público). Configure tudo como *secret* do Cloudflare Workers, pelo painel (**Settings → Variables and Secrets → Secret**) ou pela linha de comando:

```bash
npx wrangler secret put GITHUB_WEBHOOK_SECRET   # obrigatório
npx wrangler secret put DISCORD_WEBHOOK_URL_1   # obrigatório (webhook do canal de atualizações)
npx wrangler secret put DISCORD_WEBHOOK_URL_2   # opcional: outros canais (_3, _4, …)
npx wrangler secret put GITHUB_TOKEN            # opcional: leitura de repositórios privados
```

| Secret | Para quê |
| :--- | :--- |
| `GITHUB_WEBHOOK_SECRET` | Confere a assinatura `X-Hub-Signature-256` de cada entrega. **Sem ele, ou com assinatura inválida, o worker responde `401` e não envia nada.** |
| `DISCORD_WEBHOOK_URL_1`, `_2`, … | URLs dos webhooks do Discord (`DISCORD_WEBHOOK_URL`, sem número, ainda vale como alternativa). Só URLs `https://discord.com/api/webhooks/…` são usadas. |
| `GITHUB_TOKEN` | *(Opcional)* token **somente leitura** (conteúdo dos repositórios) para ler o CHANGELOG de repositórios privados. Sem ele, o worker usa `raw.githubusercontent.com`, que só alcança repositórios públicos. O token só é enviado a `api.github.com`. |

### 🔧 Variáveis do worker

Não são segredos: defina como *variável* (**Settings → Variables and Secrets → Text**) e **não** as coloque no `wrangler.jsonc` do repositório.

| Variável | Para quê |
| :--- | :--- |
| `ANNOUNCE_PUSH` | *(Opcional)* `true` (sem diferenciar maiúsculas) volta a anunciar os pushes na branch padrão. Qualquer outro valor, ou sem ela, deixa só a release. |
| `RELEASE_MENTION_ROLE_ID` | *(Opcional)* ID do cargo (só dígitos) a mencionar na release estável. Valor inválido é ignorado; o pré-lançamento nunca menciona. |

> ⚠️ A URL de um webhook do Discord equivale a uma senha: quem a tem consegue postar no canal. Se alguma já esteve no repositório (como em versões antigas do `wrangler.jsonc`), **apague esse webhook no Discord e crie outro**, porque ela continua no histórico do Git.

### Segurança da entrada

- A assinatura é um HMAC SHA-256 do **corpo bruto** com o segredo, conferido em tempo constante (`crypto.subtle.verify`) antes de qualquer outra coisa (inclusive o `ping`).
- O corpo é lido com limite de 5 MB (`413` acima disso) e só depois interpretado como JSON.
- Os SHAs e o caminho dos arquivos são validados antes de montar a URL do GitHub; a resposta do GitHub também tem limite de tamanho (1 MB).
- Erros nunca devolvem nem registram URLs ou segredos; as mensagens não notificam ninguém (`allowed_mentions` vazio), exceto o cargo de `RELEASE_MENTION_ROLE_ID` na release estável.

---

## 🛠️ Desenvolvimento

Sem dependências de runtime (só o `wrangler` para publicar).

```bash
npm install
npm test            # node --test
npx wrangler dev    # executa localmente
npm run deploy      # publica (npx wrangler deploy)
```

```
github-worker-relay/
├── src/
│   ├── index.js       # handler: método, assinatura, JSON e roteamento por evento
│   ├── security.js    # leitura do corpo com limite e verificação da assinatura
│   ├── events.js      # push e release → conteúdo da mensagem
│   ├── changelog.js   # diff de linhas novas, versões e seções, notas de release
│   ├── commits.js     # resumo dos commits (Conventional Commits)
│   ├── kinds.js       # tipos de mudança, emojis e classificação
│   ├── format.js      # simplificação dos itens, resumo e limites do Discord
│   ├── github.js      # leitura de arquivos por SHA (raw ou API)
│   └── discord.js     # webhooks do Discord (só por secrets)
├── test/              # node --test
├── CHANGELOG.md
├── package.json
└── wrangler.jsonc
```

### Deploy pelo Cloudflare (Git)

- **Build command**: `npm install` (ou vazio, se o Cloudflare instalar sozinho)
- **Deploy command**: `npx wrangler deploy`
- **Root directory**: `/`

---

## 📝 Padrão de CHANGELOG recomendado

Use o formato [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). Quanto mais curto e direto o título em negrito, melhor a mensagem:

```markdown
## [1.2.0] - em preparação

### Adicionado
- **Painel web**: novo painel de administração com login pelo Discord.

### Corrigido
- **Login**: corrige o erro ao entrar pela primeira vez.
```

Seções reconhecidas: Adicionado/Added, Alterado/Changed, Corrigido/Fixed, Removido/Removed, Segurança/Security e Descontinuado/Deprecated. Outras seções aparecem com o próprio título (📌).
