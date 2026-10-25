'use strict';

const { providerRequest, asUrl, iso } = require('./http');

const capabilities = {
  listProjects: true,
  listDeployments: true,
  redeploy: true,
  logs: true,
  envRead: true,
  envWrite: true,
  envValuesReadable: true,
  notes: [
    'Les logs affichés sont ceux du build.',
    'Une variable modifiée s’applique au prochain déploiement.',
  ],
};

function credentialsFields() {
  return [
    {
      name: 'token',
      label: 'Token',
      secret: true,
      required: true,
      help: 'Vercel → Account Settings → Tokens.',
    },
    {
      name: 'teamId',
      label: 'Team ID',
      secret: false,
      required: false,
      help: 'Laisser vide pour le compte personnel.',
    },
  ];
}

function withTeam(url, teamId) {
  if (!teamId) return url;
  const next = new URL(url);
  next.searchParams.set('teamId', teamId);
  return next.toString();
}

function auth(credentials) {
  if (!credentials?.token) {
    const err = new Error('Token Vercel manquant');
    err.status = 400;
    err.expose = true;
    throw err;
  }
  return { token: credentials.token, teamId: credentials.teamId || '' };
}

async function testConnection(credentials) {
  const { token, teamId } = auth(credentials);
  const data = await providerRequest(withTeam('https://api.vercel.com/v2/user', teamId), { token });
  const user = data.user || data;
  let accountName = user.username || user.email || user.name || 'Vercel';
  if (teamId) {
    try {
      const team = await providerRequest(withTeam(`https://api.vercel.com/v2/teams/${teamId}`, teamId), { token });
      const teamName = team.name || team.slug || teamId;
      accountName = `${accountName} · ${teamName}`;
    } catch {
      accountName = `${accountName} · ${teamId}`;
    }
  }
  return { accountName };
}

function projectUrl(project) {
  const production = project.targets?.production;
  return asUrl(production?.url || production?.alias?.[0] || (project.name ? `${project.name}.vercel.app` : null));
}

async function listProjects(credentials) {
  const { token, teamId } = auth(credentials);
  const data = await providerRequest(withTeam('https://api.vercel.com/v9/projects?limit=100', teamId), { token });
  return (data.projects || []).map((project) => ({
    id: project.id,
    name: project.name,
    url: projectUrl(project),
    status: project.targets?.production?.readyState || null,
    region: null,
    updatedAt: iso(project.updatedAt),
    providerMeta: { name: project.name },
  }));
}

async function getProject(credentials, projectId) {
  const { token, teamId } = auth(credentials);
  const project = await providerRequest(
    withTeam(`https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}`, teamId),
    { token },
  );
  return {
    id: project.id,
    name: project.name,
    url: projectUrl(project),
    status: project.targets?.production?.readyState || null,
    region: null,
    updatedAt: iso(project.updatedAt),
    providerMeta: { name: project.name },
  };
}

function mapDeployment(item) {
  const meta = item.meta || {};
  return {
    id: item.uid || item.id,
    status: item.readyState || item.state || null,
    url: asUrl(item.url),
    createdAt: iso(item.created || item.createdAt),
    commitSha: meta.githubCommitSha || meta.gitCommitSha || null,
    commitMessage: meta.githubCommitMessage || meta.gitCommitMessage || null,
    branch: meta.githubCommitRef || meta.gitCommitRef || meta.branch || null,
  };
}

async function listDeployments(credentials, projectId) {
  const { token, teamId } = auth(credentials);
  const url = withTeam(
    `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=20`,
    teamId,
  );
  const data = await providerRequest(url, { token });
  return (data.deployments || []).map(mapDeployment);
}

async function redeploy(credentials, projectId, deploymentId) {
  const { token, teamId } = auth(credentials);
  const project = await getProject(credentials, projectId);
  const deployments = deploymentId ? null : await listDeployments(credentials, projectId);
  const sourceId = deploymentId || deployments?.[0]?.id;
  if (!sourceId) {
    const err = new Error('Aucun déploiement à relancer');
    err.status = 400;
    err.expose = true;
    throw err;
  }
  const created = await providerRequest(withTeam('https://api.vercel.com/v13/deployments?forceNew=1', teamId), {
    method: 'POST',
    token,
    body: { name: project.name, deploymentId: sourceId },
  });
  return mapDeployment(created);
}

function mapEvent(event) {
  const text = event.payload?.text || event.text || event.message || '';
  if (!text) return null;
  return {
    timestamp: iso(event.created || event.date),
    level: event.type || 'info',
    message: String(text).replace(/\n$/, ''),
  };
}

async function getLogs(credentials, _projectId, deploymentId) {
  const { token, teamId } = auth(credentials);
  const data = await providerRequest(
    withTeam(`https://api.vercel.com/v3/deployments/${encodeURIComponent(deploymentId)}/events`, teamId),
    { token },
  );
  const events = Array.isArray(data) ? data : data?.events || [];
  const lines = events.map(mapEvent).filter(Boolean);
  if (!lines.length) {
    return [{ timestamp: null, level: 'info', message: 'Aucun journal de build pour ce déploiement.' }];
  }
  return lines;
}

function mapEnv(item) {
  const hasValue = item.value != null && item.value !== '';
  return {
    key: item.key,
    value: hasValue ? String(item.value) : null,
    secret: item.type === 'sensitive',
    readable: hasValue,
    targets: Array.isArray(item.target) ? item.target : item.target ? [item.target] : [],
    id: item.id,
  };
}

async function listEnv(credentials, projectId) {
  const { token, teamId } = auth(credentials);
  const data = await providerRequest(
    withTeam(`https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/env?decrypt=true`, teamId),
    { token },
  );
  return (data.envs || data.env || []).map(mapEnv);
}

async function upsertEnv(credentials, projectId, input) {
  const { token, teamId } = auth(credentials);
  const existing = await listEnv(credentials, projectId);
  const match = existing.find((item) => item.key === input.key);
  const targets = match?.targets?.length ? match.targets : ['production', 'preview', 'development'];
  if (match?.id) {
    await providerRequest(
      withTeam(
        `https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/env/${encodeURIComponent(match.id)}`,
        teamId,
      ),
      {
        method: 'PATCH',
        token,
        body: { value: input.value, target: targets },
      },
    );
  } else {
    await providerRequest(
      withTeam(`https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/env`, teamId),
      {
        method: 'POST',
        token,
        body: {
          key: input.key,
          value: input.value,
          type: input.secret ? 'sensitive' : 'encrypted',
          target: targets,
        },
      },
    );
  }
  return { key: input.key };
}

async function deleteEnv(credentials, projectId, key) {
  const { token, teamId } = auth(credentials);
  const existing = await listEnv(credentials, projectId);
  const matches = existing.filter((item) => item.key === key && item.id);
  if (!matches.length) {
    const err = new Error('Variable introuvable');
    err.status = 404;
    err.expose = true;
    throw err;
  }
  for (const item of matches) {
    await providerRequest(
      withTeam(
        `https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/env/${encodeURIComponent(item.id)}`,
        teamId,
      ),
      { method: 'DELETE', token },
    );
  }
}

module.exports = {
  key: 'vercel',
  name: 'Vercel',
  description: 'Projets, déploiements, logs de build et variables Vercel.',
  capabilities,
  credentialsFields,
  testConnection,
  listProjects,
  listDeployments,
  redeploy,
  getLogs,
  listEnv,
  upsertEnv,
  deleteEnv,
};
