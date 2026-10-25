'use strict';

const sodium = require('libsodium-wrappers');
const { providerRequest, asUrl, iso, mapPool } = require('./http');

const capabilities = {
  listProjects: true,
  listDeployments: true,
  redeploy: true,
  logs: true,
  envRead: true,
  envWrite: true,
  envValuesReadable: false,
  notes: [
    'Un service est un dépôt avec GitHub Pages.',
    'Les secrets Actions ne sont jamais relisibles : le nom s’affiche, la valeur peut être remplacée ou supprimée.',
    'Les variables Actions restent lisibles.',
    'Les logs sont ceux du workflow Actions associé.',
  ],
};

function credentialsFields() {
  return [
    {
      name: 'token',
      label: 'Personal access token',
      secret: true,
      required: true,
      help: 'Droits dépôt, Pages, Actions, variables et secrets.',
    },
  ];
}

function auth(credentials) {
  if (!credentials?.token) {
    const err = new Error('Token GitHub manquant');
    err.status = 400;
    err.expose = true;
    throw err;
  }
  return credentials.token;
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'deployment-dashboard',
  };
}

async function github(token, path, options = {}) {
  const url = path.startsWith('http') ? path : `https://api.github.com${path}`;
  return providerRequest(url, {
    ...options,
    token: undefined,
    headers: { ...headers(token), ...options.headers },
  });
}

function parseRepo(projectId) {
  const [owner, repo] = String(projectId).split('::');
  if (!owner || !repo) {
    const err = new Error('Identifiant de dépôt invalide');
    err.status = 400;
    err.expose = true;
    throw err;
  }
  return { owner, repo, slug: `${owner}/${repo}` };
}

async function testConnection(credentials) {
  const token = auth(credentials);
  const user = await github(token, '/user');
  return { accountName: user.login || user.name || 'GitHub' };
}

async function listRepos(token) {
  const repos = [];
  let url = 'https://api.github.com/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member';
  for (let page = 0; page < 3 && url; page += 1) {
    const { data, headers: responseHeaders } = await providerRequest(url, {
      withHeaders: true,
      headers: headers(token),
    });
    repos.push(...(Array.isArray(data) ? data : []));
    const link = responseHeaders.get('link') || '';
    const next = link.match(/<([^>]+)>;\s*rel="next"/);
    url = next ? next[1] : null;
  }
  return repos.filter((repo) => repo.has_pages);
}

async function listProjects(credentials) {
  const token = auth(credentials);
  const repos = await listRepos(token);
  const projects = await mapPool(repos, 6, async (repo) => {
    const [owner, name] = repo.full_name.split('/');
    let pages = null;
    try {
      pages = await github(token, `/repos/${owner}/${name}/pages`);
    } catch (err) {
      if (err.upstream === 404) return null;
      throw err;
    }
    return {
      id: `${owner}::${name}`,
      name: repo.full_name,
      url: asUrl(pages?.html_url),
      status: pages?.status || null,
      region: null,
      updatedAt: iso(repo.pushed_at || repo.updated_at),
      providerMeta: { branch: pages?.source?.branch || repo.default_branch || null },
    };
  });
  return projects.filter(Boolean);
}

function isPagesRun(run) {
  const blob = `${run.name || ''} ${run.path || ''} ${run.display_title || ''}`.toLowerCase();
  return blob.includes('page');
}

function mapRun(run) {
  const status = run.status === 'completed' ? run.conclusion || run.status : run.status;
  return {
    id: String(run.id),
    status,
    url: run.html_url || null,
    createdAt: iso(run.created_at),
    commitSha: run.head_sha || null,
    commitMessage: run.display_title || run.name || null,
    branch: run.head_branch || null,
  };
}

async function listRuns(token, owner, repo) {
  const data = await github(token, `/repos/${owner}/${repo}/actions/runs?per_page=20`);
  return data.workflow_runs || [];
}

async function listDeployments(credentials, projectId) {
  const token = auth(credentials);
  const { owner, repo } = parseRepo(projectId);
  const runs = await listRuns(token, owner, repo);
  const pagesRuns = runs.filter(isPagesRun);
  const chosen = pagesRuns.length ? pagesRuns : runs.slice(0, 10);
  if (chosen.length) return chosen.map(mapRun);
  const pages = await github(token, `/repos/${owner}/${repo}/pages/deployments?per_page=10`);
  const list = Array.isArray(pages) ? pages : pages.deployments || [];
  return list.map((item) => ({
    id: String(item.id),
    status: item.status || null,
    url: item.page_url || item.html_url || null,
    createdAt: iso(item.created_at || item.updated_at),
    commitSha: null,
    commitMessage: 'Déploiement GitHub Pages',
    branch: null,
  }));
}

async function redeploy(credentials, projectId, deploymentId) {
  const token = auth(credentials);
  const { owner, repo } = parseRepo(projectId);
  const runs = await listRuns(token, owner, repo);
  const pagesRuns = runs.filter(isPagesRun);
  const target = deploymentId
    ? runs.find((run) => String(run.id) === String(deploymentId)) || pagesRuns[0] || runs[0]
    : pagesRuns[0] || runs[0];
  if (target) {
    try {
      await github(token, `/repos/${owner}/${repo}/actions/runs/${target.id}/rerun`, { method: 'POST' });
      return mapRun({ ...target, status: 'queued', conclusion: null });
    } catch (err) {
      if (!(err instanceof ProviderError) || err.status !== 400) throw err;
    }
  }
  await github(token, `/repos/${owner}/${repo}/pages/builds`, { method: 'POST' });
  return {
    id: 'pages-build',
    status: 'queued',
    url: null,
    createdAt: new Date().toISOString(),
    commitSha: null,
    commitMessage: 'Build GitHub Pages demandé',
    branch: null,
  };
}

async function getLogs(credentials, projectId, deploymentId) {
  const token = auth(credentials);
  const { owner, repo } = parseRepo(projectId);
  const runs = await listRuns(token, owner, repo);
  const run = runs.find((item) => String(item.id) === String(deploymentId)) || runs.find(isPagesRun) || runs[0];
  if (!run) {
    return [{ timestamp: null, level: 'info', message: 'Aucun workflow Actions trouvé pour ce dépôt.' }];
  }
  const jobsData = await github(token, `/repos/${owner}/${repo}/actions/runs/${run.id}/jobs`);
  const jobs = jobsData.jobs || [];
  if (!jobs.length) {
    return [{ timestamp: iso(run.created_at), level: 'info', message: `Workflow ${run.name || run.id} : ${run.status}` }];
  }
  const chunks = [];
  for (const job of jobs.slice(0, 5)) {
    chunks.push({ timestamp: iso(job.started_at), level: 'info', message: `Job ${job.name} · ${job.conclusion || job.status}` });
    try {
      const text = await github(token, `/repos/${owner}/${repo}/actions/jobs/${job.id}/logs`, { raw: true });
      const body = String(text || '');
      if (body.startsWith('PK')) {
        chunks.push({ timestamp: null, level: 'info', message: 'Le journal est une archive, non affichée ici.' });
      } else {
        const lines = body.split('\n').filter((line) => line.trim()).slice(-80);
        for (const line of lines) chunks.push({ timestamp: null, level: 'info', message: line });
      }
    } catch (err) {
      chunks.push({ timestamp: null, level: 'error', message: err.message });
    }
  }
  return chunks;
}

async function listEnv(credentials, projectId) {
  const token = auth(credentials);
  const { owner, repo } = parseRepo(projectId);
  async function optionalGithub(token, path, fallback) {
    try {
      return await github(token, path);
    } catch (err) {
      if (err.upstream === 404) return fallback;
      throw err;
    }
  }
  const [variables, secrets] = await Promise.all([
    optionalGithub(token, `/repos/${owner}/${repo}/actions/variables?per_page=100`, { variables: [] }),
    optionalGithub(token, `/repos/${owner}/${repo}/actions/secrets?per_page=100`, { secrets: [] }),
  ]);
  const readable = (variables.variables || []).map((item) => ({
    key: item.name,
    value: item.value,
    secret: false,
    readable: true,
    targets: [],
  }));
  const hidden = (secrets.secrets || []).map((item) => ({
    key: item.name,
    value: null,
    secret: true,
    readable: false,
    targets: [],
  }));
  return [...readable, ...hidden];
}

async function encryptSecret(publicKey, value) {
  await sodium.ready;
  const keyBytes = sodium.from_base64(publicKey, sodium.base64_variants.ORIGINAL);
  const message = sodium.from_string(value);
  const encrypted = sodium.crypto_box_seal(message, keyBytes);
  return sodium.to_base64(encrypted, sodium.base64_variants.ORIGINAL);
}

async function upsertEnv(credentials, projectId, input) {
  const token = auth(credentials);
  const { owner, repo } = parseRepo(projectId);
  if (input.secret) {
    const key = await github(token, `/repos/${owner}/${repo}/actions/secrets/public-key`);
    const encryptedValue = await encryptSecret(key.key, input.value);
    await github(token, `/repos/${owner}/${repo}/actions/secrets/${encodeURIComponent(input.key)}`, {
      method: 'PUT',
      body: { encrypted_value: encryptedValue, key_id: key.key_id },
    });
    return { key: input.key };
  }
  try {
    await github(token, `/repos/${owner}/${repo}/actions/variables/${encodeURIComponent(input.key)}`, {
      method: 'PATCH',
      body: { name: input.key, value: input.value },
    });
  } catch (err) {
    if (err.upstream !== 404) throw err;
    await github(token, `/repos/${owner}/${repo}/actions/variables`, {
      method: 'POST',
      body: { name: input.key, value: input.value },
    });
  }
  return { key: input.key };
}

async function deleteEnv(credentials, projectId, key, options = {}) {
  const token = auth(credentials);
  const { owner, repo } = parseRepo(projectId);
  const kind = options.secret ? 'secrets' : 'variables';
  await github(token, `/repos/${owner}/${repo}/actions/${kind}/${encodeURIComponent(key)}`, { method: 'DELETE' });
}

module.exports = {
  key: 'github_pages',
  name: 'GitHub Pages',
  description: 'Sites GitHub Pages, workflows Actions, variables et secrets.',
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
