export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const event = request.headers.get('x-github-event');
    if (event !== 'push') {
      return new Response('Ignored event', { status: 200 });
    }

    const payload = await request.json();
    const branch = payload.ref ? payload.ref.replace('refs/heads/', '') : '';

    // Monitora apenas merges/pushes na main ou master
    if (!['main', 'master'].includes(branch)) {
      return new Response('Branch ignored', { status: 200 });
    }

    // Procura arquivos de changelog alterados no push
    const commits = payload.commits || [];
    let changelogFile = null;

    for (const commit of commits) {
      const files = [...commit.added, ...commit.modified];
      changelogFile = files.find(f => /(changelog|changes)(\.md)?$/i.test(f));
      if (changelogFile) break;
    }

    if (!changelogFile) {
      return new Response('No changelog modified', { status: 200 });
    }

    const repoFullName = payload.repository.full_name;
    const rawUrl = `https://raw.githubusercontent.com/${repoFullName}/${branch}/${changelogFile}`;

    try {
      const response = await fetch(rawUrl);
      if (!response.ok) throw new Error('Falha ao baixar changelog');
      const markdown = await response.text();

      const { title, body } = parseChangelog(markdown);

      await sendToDiscord(env.DISCORD_WEBHOOK_URL, {
        repoName: payload.repository.name,
        repoUrl: payload.repository.html_url,
        commitUrl: payload.head_commit?.url || payload.repository.html_url,
        title,
        body
      });

      return new Response('Notification sent', { status: 200 });
    } catch (err) {
      return new Response(`Error: ${err.message}`, { status: 500 });
    }
  }
};

function parseChangelog(markdown) {
  const lines = markdown.split(/\r?\n/);
  let title = 'Nova Atualização';
  let bodyLines = [];
  let recording = false;

  for (let line of lines) {
    // Detecta títulos de versão tanto com ## quanto com # (ex: ## 1.0.0, ## [1.0.0], # Release 1.0)
    const isVersionHeader = /^(#{1,2})\s+(v?\d+\.\d+|\[v?\d+\.\d+|release|versão)/i.test(line);

    if (isVersionHeader) {
      if (recording) break; // Termina ao encontrar a versão anterior
      title = line.replace(/^#{1,2}\s+/, '').trim();
      recording = true;
      continue;
    }

    if (recording) {
      bodyLines.push(line);
    }
  }

  const cleanBody = bodyLines.join('\n').trim();

  return {
    title,
    body: cleanBody.length > 0 ? cleanBody.substring(0, 3900) : 'Confira o repositório para mais detalhes.'
  };
}

async function sendToDiscord(webhookUrl, data) {
  if (!webhookUrl) throw new Error('DISCORD_WEBHOOK_URL não configurada.');

  const payload = {
    username: "EmpireHub Releases",
    avatar_url: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
    embeds: [{
      author: {
        name: data.repoName,
        url: data.repoUrl
      },
      title: `🚀 ${data.title}`,
      description: data.body,
      url: data.commitUrl,
      color: 5793266, // Blurple (#5865F2)
      footer: {
        text: "DiscordEmpireHub Auto-Updates"
      },
      timestamp: new Date().toISOString()
    }]
  };

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}