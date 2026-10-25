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
    'Containers et Functions serverless de la région choisie.',
    'Les journaux Cockpit (temps réel) ne sont pas inclus : le statut et le message d’erreur API sont affichés.',
    'Les variables secrètes ne sont pas modifiées ici, Scaleway n’en renvoie pas la valeur.',
  ],
};

function credentialsFields() {
  return [
    {
      name: 'secretKey',
      label: 'Secret key',
      secret: true,
      required: true,
      help: 'IAM → API keys.',
    },
    {
      name: 'projectId',
      label: 'Project ID',
      secret: false,
      required: true,
    },
    {
      name: 'region',
      label: 'Région',
      secret: false,
      required: true,
      defaultValue: 'fr-par',
      options: ['fr-par', 'nl-ams', 'pl-waw', 'it-mil'],
    },
  ];
}

function auth(credentials) {
  if (!credentials?.secretKey || !credentials?.projectId) {
    const err = new Error('Secret key et project ID Scaleway sont requis');
    err.status = 400;
    err.expose = true;
    throw err;
  }
  return {
    secretKey: credentials.secretKey,
    projectId: credentials.projectId,
    region: credentials.region || 'fr-par',
  };
}

function scw(path, secretKey, options = {}) {
  return providerRequest(`https://api.scaleway.com${path}`, {
    ...options,
    headers: { 'X-Auth-Token': secretKey, ...options.headers },
  });
}

function parseId(projectId) {
  const [kind, region, id] = String(projectId).split('::');
  if (!['container', 'function'].includes(kind) || !region || !id) {
    const err = new Error('Identifiant Scaleway invalide');
    err.status = 400;
    err.expose = true;
    throw err;
  }
  return { kind, region, id };
}

async function listPaged(path, secretKey, collection) {
  const items = [];
  for (let page = 1; page <= 5; page += 1) {
    const joiner = path.includes('?') ? '&' : '?';
    const data = await scw(`${path}${joiner}page=${page}&page_size=100`, secretKey);
    const batch = data[collection] || [];
    items.push(...batch);
    if (batch.length < 100) break;
  }
  return items;
}

async function testConnection(credentials) {
  const { secretKey, projectId } = auth(credentials);
  const project = await scw(`/account/v3/projects/${encodeURIComponent(projectId)}`, secretKey);
  return { accountName: project.name || projectId };
}

function endpointOf(resource) {
  return asUrl(resource.public_endpoint || resource.domain_name || resource.endpoint);
}

function mapResource(kind, region, resource) {
  return {
    id: `${kind}::${region}::${resource.id}`,
    name: resource.name,
    url: endpointOf(resource),
    status: resource.status || null,
    region,
    updatedAt: iso(resource.updated_at),
    providerMeta: { kind, image: resource.image || resource.registry_image || null },
  };
}

async function listProjects(credentials) {
  const { secretKey, projectId, region } = auth(credentials);
  const query = `project_id=${encodeURIComponent(projectId)}`;
  async function safeList(path, secretKey, collection) {
    try {
      return await listPaged(path, secretKey, collection);
    } catch (err) {
      if (err.upstream === 403 || err.upstream === 404) return [];
      throw err;
    }
  }
  const [containers, functions] = await Promise.all([
    safeList(`/containers/v1/regions/${region}/containers?${query}`, secretKey, 'containers'),
    safeList(`/functions/v1beta1/regions/${region}/functions?${query}`, secretKey, 'functions'),
  ]);
  return [
    ...containers.map((item) => mapResource('container', region, item)),
    ...functions.map((item) => mapResource('function', region, item)),
  ];
}

async function getResource(credentials, projectId) {
  const { secretKey } = auth(credentials);
  const { kind, region, id } = parseId(projectId);
  const base = kind === 'container'
    ? `/containers/v1/regions/${region}/containers/${id}`
    : `/functions/v1beta1/regions/${region}/functions/${id}`;
  const resource = await scw(base, secretKey);
  return { resource, kind, region, id, base };
}

function mapDeployment(resource, meta) {
  return {
    id: resource.id,
    status: resource.status || null,
    url: endpointOf(resource),
    createdAt: iso(resource.created_at),
    commitSha: null,
    commitMessage: meta.image || resource.image || resource.runtime || null,
    branch: null,
  };
}

async function listDeployments(credentials, projectId) {
  const loaded = await getResource(credentials, projectId);
  return [mapDeployment(loaded.resource, loaded.resource)];
}

async function redeploy(credentials, projectId) {
  const { secretKey } = auth(credentials);
  const { kind, region, id, resource } = await getResource(credentials, projectId);
  const path = kind === 'container'
    ? `/containers/v1/regions/${region}/containers/${id}/redeploy`
    : `/functions/v1beta1/regions/${region}/functions/${id}/deploy`;
  const updated = await scw(path, secretKey, { method: 'POST', body: {} });
  return mapDeployment(updated || { ...resource, status: 'pending' }, resource);
}

async function getLogs(credentials, projectId) {
  const { resource } = await getResource(credentials, projectId);
  const lines = [];
  if (resource.status) {
    lines.push({ timestamp: iso(resource.updated_at), level: 'info', message: `Statut : ${resource.status}` });
  }
  if (resource.error_message) {
    lines.push({ timestamp: iso(resource.updated_at), level: 'error', message: resource.error_message });
  }
  lines.push({
    timestamp: null,
    level: 'info',
    message: 'Les flux Cockpit ne sont pas chargés dans cette version.',
  });
  return lines;
}

function secretEntries(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((item) => ({ key: item.key || item.name, value: item.value ?? null }));
  }
  return Object.entries(raw).map(([key, value]) => ({ key, value: value ?? null }));
}

function mapEnv(resource) {
  const plain = Object.entries(resource.environment_variables || {}).map(([key, value]) => ({
    key,
    value: value == null ? null : String(value),
    secret: false,
    readable: value != null,
    targets: [],
  }));
  const secrets = secretEntries(resource.secret_environment_variables).map((item) => ({
    key: item.key,
    value: null,
    secret: true,
    readable: false,
    targets: [],
  }));
  return [...plain, ...secrets.filter((item) => item.key)];
}

async function listEnv(credentials, projectId) {
  const { resource } = await getResource(credentials, projectId);
  return mapEnv(resource);
}

async function upsertEnv(credentials, projectId, input) {
  if (input.secret) {
    const err = new Error('Les secrets Scaleway ne sont pas modifiables ici : leur valeur n’est pas renvoyée par l’API.');
    err.status = 400;
    err.expose = true;
    throw err;
  }
  const { secretKey } = auth(credentials);
  const { resource, base } = await getResource(credentials, projectId);
  const next = { ...(resource.environment_variables || {}) };
  next[input.key] = input.value;
  await scw(base, secretKey, { method: 'PATCH', body: { environment_variables: next } });
  return { key: input.key };
}

async function deleteEnv(credentials, projectId, key, options = {}) {
  if (options.secret) {
    const err = new Error('Les secrets Scaleway ne sont pas supprimés ici.');
    err.status = 400;
    err.expose = true;
    throw err;
  }
  const { secretKey } = auth(credentials);
  const { resource, base } = await getResource(credentials, projectId);
  const next = { ...(resource.environment_variables || {}) };
  if (!Object.prototype.hasOwnProperty.call(next, key)) {
    const err = new Error('Variable introuvable');
    err.status = 404;
    err.expose = true;
    throw err;
  }
  delete next[key];
  await scw(base, secretKey, { method: 'PATCH', body: { environment_variables: next } });
}

module.exports = {
  key: 'scaleway',
  name: 'Scaleway',
  description: 'Containers et Functions serverless Scaleway.',
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
