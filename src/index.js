export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const event = request.headers.get('x-github-event');
    if (!event) {
      return new Response('Missing x-github-event header', { status: 400 });
    }

    // Responde ao ping de teste do GitHub ao configurar o webhook
    if (event === 'ping') {
      return new Response(JSON.stringify({ message: 'Pong! Webhook configurado com sucesso.' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const payload = await request.json();

    try {
      // 1. Suporte a evento de Release do GitHub (quando publicado)
      if (event === 'release') {
        if (payload.action !== 'published' && payload.action !== 'created') {
          return new Response(`Ignored release action: ${payload.action}`, { status: 200 });
        }

        const release = payload.release;
        if (!release) {
          return new Response('Missing release payload', { status: 400 });
        }

        await dispatchNotifications(env, {
          repoName: payload.repository?.name || 'Projeto',
          repoUrl: payload.repository?.html_url || '',
          url: release.html_url || payload.repository?.html_url,
          title: release.name || release.tag_name || 'Nova Release',
          badge: release.prerelease ? 'PRÉ-LANÇAMENTO' : 'RELEASE OFICIAL',
          color: release.prerelease ? 0xFEE75C : 0x57F287, // Amarelo ou Verde
          body: release.body || 'Nenhum detalhe adicional informado na release.',
          authorName: release.author?.login,
          authorAvatar: release.author?.avatar_url
        });

        return new Response('Release notification sent', { status: 200 });
      }

      // 2. Suporte a evento de Push
      if (event === 'push') {
        const branch = payload.ref ? payload.ref.replace('refs/heads/', '') : '';

        // Monitora apenas merges/pushes na branch principal (main ou master)
        if (!['main', 'master'].includes(branch)) {
          return new Response(`Branch ignored: ${branch}`, { status: 200 });
        }

        const commits = payload.commits || [];
        let changelogFile = null;

        // Procura arquivos de changelog adicionados ou modificados
        for (const commit of commits) {
          const files = [...(commit.added || []), ...(commit.modified || [])];
          changelogFile = files.find(f => /(changelog|changes)(\.md)?$/i.test(f));
          if (changelogFile) break;
        }

        if (!changelogFile) {
          return new Response('No changelog modified in push', { status: 200 });
        }

        const repoFullName = payload.repository.full_name;
        const rawUrl = `https://raw.githubusercontent.com/${repoFullName}/${branch}/${changelogFile}`;

        const response = await fetch(rawUrl, {
          headers: { 'User-Agent': 'Cloudflare-Worker-EmpireHub-Relay' }
        });

        if (!response.ok) {
          throw new Error(`Falha ao obter changelog via raw (${response.status})`);
        }

        const markdown = await response.text();
        const { versionTitle, body, isUnreleased } = parseChangelog(markdown);

        if (!body || body.trim().length === 0) {
          return new Response('Changelog parsed but body was empty', { status: 200 });
        }

        await dispatchNotifications(env, {
          repoName: payload.repository.name,
          repoUrl: payload.repository.html_url,
          url: payload.head_commit?.url || `${payload.repository.html_url}/blob/${branch}/${changelogFile}`,
          title: versionTitle,
          badge: isUnreleased ? 'EM DESENVOLVIMENTO (MAIN)' : 'ATUALIZAÇÃO REGISTRADA',
          color: isUnreleased ? 0x5865F2 : 0x2ECC71, // Blurple ou Verde Esmeralda
          body: body,
          authorName: payload.pusher?.name || payload.sender?.login,
          authorAvatar: payload.sender?.avatar_url
        });

        return new Response('Push notification sent', { status: 200 });
      }

      return new Response(`Ignored event: ${event}`, { status: 200 });
    } catch (err) {
      console.error(err);
      return new Response(`Error: ${err.message}`, { status: 500 });
    }
  }
};

/**
 * Obtém os webhooks configurados no ambiente (DISCORD_WEBHOOK_URL_1, _2, etc., com fallback para DISCORD_WEBHOOK_URL)
 */
export function getWebhookUrls(env) {
  const urls = [];

  // Suporte a DISCORD_WEBHOOK_URL_1, DISCORD_WEBHOOK_URL_2, ...
  let index = 1;
  while (env && env[`DISCORD_WEBHOOK_URL_${index}`]) {
    const url = env[`DISCORD_WEBHOOK_URL_${index}`].trim();
    if (url) urls.push(url);
    index++;
  }

  // Fallback de retrocompatibilidade caso ainda exista DISCORD_WEBHOOK_URL sem índice
  if (urls.length === 0 && env?.DISCORD_WEBHOOK_URL) {
    const url = env.DISCORD_WEBHOOK_URL.trim();
    if (url) urls.push(url);
  }

  return urls;
}

/**
 * Dispara as notificações para as URLs de Webhook ativas
 */
async function dispatchNotifications(env, data) {
  const webhookUrls = getWebhookUrls(env);

  if (webhookUrls.length === 0) {
    throw new Error('Nenhuma URL configurada (defina DISCORD_WEBHOOK_URL_1 nas variáveis de ambiente).');
  }

  // Dispara em paralelo para todos os webhooks configurados
  const results = await Promise.allSettled(
    webhookUrls.map(url => sendToDiscord(url, data))
  );

  const errors = results.filter(r => r.status === 'rejected');
  if (errors.length === results.length) {
    // Se todos falharem, propaga o primeiro erro
    throw errors[0].reason;
  }
}

/**
 * Analisa o CHANGELOG.md seguindo o padrão Keep a Changelog ou títulos comuns de versão.
 */
export function parseChangelog(markdown) {
  const lines = markdown.split(/\r?\n/);
  let versionTitle = 'Nova Atualização';
  let bodyLines = [];
  let recording = false;
  let isUnreleased = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detecta seções de versão (ex: ## [Unreleased], ## [1.2.0] - 2026-..., ## v1.0, ## Versão 2.0)
    // Evita casar o título principal '# Changelog'
    const isVersionHeader = /^##\s+(.+)$/i.test(line);

    if (isVersionHeader) {
      const match = line.match(/^##\s+(.+)$/i);
      const rawHeader = match ? match[1].trim() : '';

      if (recording) {
        // Encontrou a próxima seção de versão, finaliza a captura da atual
        break;
      }

      versionTitle = rawHeader;
      if (/unreleased|não lançado|em desenvolvimento/i.test(rawHeader)) {
        isUnreleased = true;
      }

      recording = true;
      continue;
    }

    if (recording) {
      // Ignora links de referências no final do changelog (ex: [Unreleased]: https://...)
      if (/^\[[^\]]+\]:\s*https?:\/\//i.test(line.trim())) {
        continue;
      }
      bodyLines.push(line);
    }
  }

  // Se não encontrou cabeçalho '##', tenta fallback de '# v1.0.0'
  if (!recording) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^#\s+(v?\d+\.\d+|release|versão)/i.test(line)) {
        if (recording) break;
        versionTitle = line.replace(/^#\s+/, '').trim();
        recording = true;
        continue;
      }
      if (recording) {
        if (/^\[[^\]]+\]:\s*https?:\/\//i.test(line.trim())) continue;
        bodyLines.push(line);
      }
    }
  }

  const rawBody = bodyLines.join('\n').trim();
  const cleanBody = formatBodyForDiscord(rawBody);

  return {
    versionTitle,
    body: cleanBody.length > 0 ? cleanBody : 'Consulte o arquivo de changelog no repositório para conferir os detalhes.',
    isUnreleased
  };
}

/**
 * Trata o conteúdo Markdown para caber confortavelmente em um embed do Discord (limite máx 4096 caracteres na description).
 */
export function formatBodyForDiscord(body, maxLength = 3800) {
  if (!body) return '';

  if (body.length <= maxLength) {
    return body;
  }

  // Corta de maneira elegante no último parágrafo ou linha antes do limite
  const truncated = body.substring(0, maxLength);
  const lastNewline = truncated.lastIndexOf('\n');
  const safeText = lastNewline > maxLength * 0.7 ? truncated.substring(0, lastNewline) : truncated;

  return `${safeText.trim()}\n\n*... (conteúdo truncado, veja o changelog completo no GitHub)*`;
}

/**
 * Envia o webhook formatado para o Discord
 */
async function sendToDiscord(webhookUrl, data) {
  const titlePrefix = data.badge ? `[${data.badge}] ` : '';

  const embed = {
    author: {
      name: data.repoName,
      url: data.repoUrl,
      icon_url: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png"
    },
    title: `${titlePrefix}${data.title}`.substring(0, 256),
    url: data.url,
    description: data.body.substring(0, 4096),
    color: data.color || 0x5865F2,
    footer: {
      text: data.authorName ? `Atualizado por ${data.authorName} • EmpireHub Hub Relay` : "DiscordEmpireHub Auto-Updates"
    },
    timestamp: new Date().toISOString()
  };

  if (data.authorAvatar) {
    embed.footer.icon_url = data.authorAvatar;
  }

  const payload = {
    username: "EmpireHub Changelog Relay",
    avatar_url: "https://avatars.githubusercontent.com/u/190886561?s=200&v=4",
    embeds: [embed]
  };

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Falha no envio para o Discord (HTTP ${res.status}): ${errorText}`);
  }
}
