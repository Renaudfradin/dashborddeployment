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
    'Relancer un déploiement déclenche un nouveau build Git.',
    'Les secrets Netlify ne renvoient pas toujours leur valeur.',
  ],
};

function credentialsFields() {
  return [
    {
      name: 'token',
      label: 'Personal access token',
      secret: true,
      required: true,
      help: 'Netlify → User settings → Applications → Personal access tokens.',
    },
  ];
}

function auth(credentials) {
  if (!credentials?.token) {
    const err = new Error('Token Netlify manquant');
    err.status = 400;
    err.expose = true;
    throw err;
  }
  return credentials.token;
}

async function testConnection(credentials) {
  const token = auth(credentials);
  const user = await providerRequest('https://api.netlify.com/api/v1/user', { token });
  return { accountName: user.full_name || user.email || user.slug || 'Netlify' };
}

function mapSite(site) {
  const deploy = site.published_deploy || {};
  return {
    id: site.id,
    name: site.name || site.custom_domain || site.id,
    url: asUrl(site.ssl_url || site.url),
    status: deploy.state || site.state || null,
    region: null,
    updatedAt: iso(site.updated_at || deploy.published_at),
    providerMeta: { accountId: site.account_id || site.account_slug || null },
  };
}

async function listProjects(credentials) {
  const token = auth(credentials);
  const sites = [];
  for (let page = 1; page <= 3; page += 1) {
    const batch = await providerRequest(
      `https://api.netlify.com/api/v1/sites?per_page=100&page=${page}`,
      { token },
    );
    const list = Array.isArray(batch) ? batch : [];
    sites.push(...list);
    if (list.length < 100) break;
  }
  return sites.map(mapSite);
}

async function getSite(credentials, projectId) {
  const token = auth(credentials);
  const site = await providerRequest(`https://api.netlify.com/api/v1/sites/${encodeURIComponent(projectId)}`, {
    token,
  });
  return mapSite(site);
}

function mapDeploy(deploy) {
  return {
    id: deploy.id,
    status: deploy.state || null,
    url: asUrl(deploy.ssl_url || deploy.deploy_ssl_url || deploy.url),
    createdAt: iso(deploy.created_at),
    commitSha: deploy.commit_ref || null,
    commitMessage: deploy.title || deploy.commit_message || null,
    branch: deploy.branch || null,
  };
}

async function listDeployments(credentials, projectId) {
  const token = auth(credentials);
  const deploys = await providerRequest(
    `https://api.netlify.com/api/v1/sites/${encodeURIComponent(projectId)}/deploys?per_page=20`,
    { token },
  );
  return (Array.isArray(deploys) ? deploys : []).map(mapDeploy);
}

async function redeploy(credentials, projectId, deploymentId) {
  const token = auth(credentials);
  if (deploymentId) {
    const restored = await providerRequest(
      `https://api.netlify.com/api/v1/sites/${encodeURIComponent(projectId)}/deploys/${encodeURIComponent(deploymentId)}/restore`,
      { method: 'POST', token, body: {} },
    );
    return mapDeploy(restored || { id: deploymentId, state: 'building' });
  }
  const build = await providerRequest(
    `https://api.netlify.com/api/v1/sites/${encodeURIComponent(projectId)}/builds`,
    { method: 'POST', token, body: {} },
  );
  const deploy = build?.deploy || build;
  return mapDeploy(deploy || { id: 'build', state: 'enqueued' });
}

async function getLogs(credentials, projectId, deploymentId) {
  const token = auth(credentials);
  const deploy = await providerRequest(
    `https://api.netlify.com/api/v1/sites/${encodeURIComponent(projectId)}/deploys/${encodeURIComponent(deploymentId)}`,
    { token },
  );
  const lines = [];
  if (deploy.state) {
    lines.push({ timestamp: iso(deploy.updated_at || deploy.created_at), level: 'info', message: `Statut : ${deploy.state}` });
  }
  if (deploy.title) {
    lines.push({ timestamp: iso(deploy.created_at), level: 'info', message: deploy.title });
  }
  if (deploy.branch || deploy.commit_ref) {
    lines.push({
      timestamp: iso(deploy.created_at),
      level: 'info',
      message: `Branche ${deploy.branch || '—'} · ${deploy.commit_ref || 'sans commit'}`,
    });
  }
  const messages = deploy.summary?.messages || deploy.messages || [];
  for (const message of messages) {
    const text = typeof message === 'string' ? message : message.description || message.title || JSON.stringify(message);
    lines.push({ timestamp: null, level: message.type || 'info', message: text });
  }
  if (deploy.error_message) {
    lines.push({ timestamp: iso(deploy.updated_at), level: 'error', message: deploy.error_message });
  }
  if (!lines.length) {
    lines.push({
      timestamp: null,
      level: 'info',
      message: 'Netlify ne renvoie pas le journal complet du build sur cet endpoint. Le statut du déploiement est affiché.',
    });
  }
  return lines;
}

function envValue(item) {
  const values = item.values || [];
  const readable = values.find((entry) => entry.value != null && entry.value !== '');
  const isSecret = Boolean(item.is_secret);
  return {
    key: item.key,
    value: !isSecret && readable ? String(readable.value) : null,
    secret: isSecret,
    readable: !isSecret && Boolean(readable),
    targets: values.map((entry) => entry.context).filter(Boolean),
  };
}

async function accountIdFor(credentials, projectId) {
  const site = await getSite(credentials, projectId);
  if (!site.providerMeta.accountId) {
    const err = new Error('Compte Netlify introuvable pour ce site');
    err.status = 502;
    err.expose = true;
    throw err;
  }
  return site.providerMeta.accountId;
}

async function listEnv(credentials, projectId) {
  const token = auth(credentials);
  const data = await providerRequest(
    `https://api.netlify.com/api/v1/sites/${encodeURIComponent(projectId)}/env`,
    { token },
  );
  return (Array.isArray(data) ? data : []).map(envValue);
}

async function upsertEnv(credentials, projectId, input) {
  const token = auth(credentials);
  const accountId = await accountIdFor(credentials, projectId);
  const existing = await listEnv(credentials, projectId);
  const payload = {
    key: input.key,
    values: [{ context: 'all', value: input.value }],
    is_secret: Boolean(input.secret),
  };
  const encodedKey = encodeURIComponent(input.key);
  const siteQuery = `site_id=${encodeURIComponent(projectId)}`;
  if (existing.some((item) => item.key === input.key)) {
    await providerRequest(
      `https://api.netlify.com/api/v1/accounts/${encodeURIComponent(accountId)}/env/${encodedKey}?${siteQuery}`,
      { method: 'PUT', token, body: payload },
    );
  } else {
    await providerRequest(
      `https://api.netlify.com/api/v1/accounts/${encodeURIComponent(accountId)}/env?${siteQuery}`,
      { method: 'POST', token, body: [payload] },
    );
  }
  return { key: input.key };
}

async function deleteEnv(credentials, projectId, key) {
  const token = auth(credentials);
  const accountId = await accountIdFor(credentials, projectId);
  await providerRequest(
    `https://api.netlify.com/api/v1/accounts/${encodeURIComponent(accountId)}/env/${encodeURIComponent(key)}?site_id=${encodeURIComponent(projectId)}`,
    { method: 'DELETE', token },
  );
}

module.exports = {
  key: 'netlify',
  name: 'Netlify',
  description: 'Sites, builds, restauration d’un déploiement et variables Netlify.',
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
