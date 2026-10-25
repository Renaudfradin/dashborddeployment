'use strict';

const { providerRequest, asUrl, iso, mapPool } = require('./http');

const ENDPOINT = 'https://backboard.railway.com/graphql/v2';

const capabilities = {
  listProjects: true,
  listDeployments: true,
  redeploy: true,
  logs: true,
  envRead: true,
  envWrite: true,
  envValuesReadable: true,
  notes: [
    'Utiliser un token de compte Railway, pas un token limité à un seul projet.',
    'Un service correspond à un environnement (production s’il existe).',
  ],
};

function credentialsFields() {
  return [
    {
      name: 'token',
      label: 'Token de compte',
      secret: true,
      required: true,
      help: 'railway.com → Account → Tokens.',
    },
  ];
}

function auth(credentials) {
  if (!credentials?.token) {
    const err = new Error('Token Railway manquant');
    err.status = 400;
    err.expose = true;
    throw err;
  }
  return credentials.token;
}

async function gql(token, query, variables) {
  const data = await providerRequest(ENDPOINT, {
    method: 'POST',
    token,
    body: { query, variables },
  });
  if (data?.errors?.length) {
    const err = new Error(data.errors.map((item) => item.message).filter(Boolean).join(' ; ') || 'Erreur Railway');
    err.status = 502;
    err.expose = true;
    throw err;
  }
  return data?.data || {};
}

function nodes(connection) {
  if (!connection) return [];
  if (Array.isArray(connection)) return connection;
  if (Array.isArray(connection.edges)) return connection.edges.map((edge) => edge.node).filter(Boolean);
  return [];
}

function parseProjectId(projectId) {
  const [railwayProjectId, serviceId, environmentId] = String(projectId).split('::');
  if (!railwayProjectId || !serviceId || !environmentId) {
    const err = new Error('Identifiant de service Railway invalide');
    err.status = 400;
    err.expose = true;
    throw err;
  }
  return { railwayProjectId, serviceId, environmentId };
}

function pickEnvironment(environments) {
  return environments.find((item) => /^production$/i.test(item.name || '')) || environments[0] || null;
}

function firstDomain(domains) {
  if (!domains) return null;
  if (typeof domains === 'string') return asUrl(domains);
  const groups = [domains.customDomains, domains.serviceDomains, domains.domains];
  for (const group of groups) {
    const list = Array.isArray(group) ? group : [];
    for (const entry of list) {
      const host = typeof entry === 'string' ? entry : entry?.domain;
      if (host) return asUrl(host);
    }
  }
  return null;
}

async function testConnection(credentials) {
  const token = auth(credentials);
  const data = await gql(token, 'query { me { name email } }');
  const me = data.me || {};
  return { accountName: me.name || me.email || 'Railway' };
}

async function listProjects(credentials) {
  const token = auth(credentials);
  const data = await gql(
    token,
    `query {
      projects {
        edges {
          node {
            id
            name
            updatedAt
            services { edges { node { id name } } }
            environments { edges { node { id name } } }
          }
        }
      }
    }`,
  );
  const projects = nodes(data.projects);
  const rows = [];
  for (const project of projects) {
    const environment = pickEnvironment(nodes(project.environments));
    const services = nodes(project.services);
    if (!environment) continue;
    const decorated = await mapPool(services, 4, async (service) => {
      let url = null;
      try {
        const domains = await gql(
          token,
          `query ($projectId: String!, $environmentId: String!, $serviceId: String!) {
            domains(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId)
          }`,
          { projectId: project.id, environmentId: environment.id, serviceId: service.id },
        );
        url = firstDomain(domains.domains);
      } catch {
        url = null;
      }
      return {
        id: `${project.id}::${service.id}::${environment.id}`,
        name: `${project.name} / ${service.name}`,
        url,
        status: environment.name || null,
        region: null,
        updatedAt: iso(project.updatedAt),
        providerMeta: {
          projectId: project.id,
          serviceId: service.id,
          environmentId: environment.id,
          environmentName: environment.name,
        },
      };
    });
    rows.push(...decorated);
  }
  return rows;
}

function mapDeployment(node) {
  const meta = node.meta || {};
  return {
    id: node.id,
    status: node.status || null,
    url: asUrl(node.staticUrl),
    createdAt: iso(node.createdAt),
    commitSha: meta.commitHash || meta.commitSha || null,
    commitMessage: meta.commitMessage || null,
    branch: meta.branch || null,
  };
}

async function listDeployments(credentials, projectId) {
  const token = auth(credentials);
  const ids = parseProjectId(projectId);
  const data = await gql(
    token,
    `query ($projectId: String!, $environmentId: String!, $serviceId: String!) {
      deployments(first: 15, input: { projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId }) {
        edges { node { id status createdAt staticUrl meta } }
      }
    }`,
    {
      projectId: ids.railwayProjectId,
      environmentId: ids.environmentId,
      serviceId: ids.serviceId,
    },
  );
  return nodes(data.deployments).map(mapDeployment);
}

async function redeploy(credentials, projectId) {
  const token = auth(credentials);
  const ids = parseProjectId(projectId);
  const data = await gql(
    token,
    `mutation ($serviceId: String!, $environmentId: String!) {
      serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId)
    }`,
    { serviceId: ids.serviceId, environmentId: ids.environmentId },
  );
  const id = typeof data.serviceInstanceRedeploy === 'string' ? data.serviceInstanceRedeploy : 'redeploy';
  return {
    id,
    status: 'QUEUED',
    url: null,
    createdAt: new Date().toISOString(),
    commitSha: null,
    commitMessage: null,
    branch: null,
  };
}

function mapLog(entry) {
  return {
    timestamp: iso(entry.timestamp),
    level: entry.severity || entry.level || 'info',
    message: entry.message || '',
  };
}

async function getLogs(credentials, _projectId, deploymentId) {
  const token = auth(credentials);
  const query = `query ($deploymentId: String!, $limit: Int) {
    buildLogs(deploymentId: $deploymentId, limit: $limit) { message timestamp severity }
    deploymentLogs(deploymentId: $deploymentId, limit: $limit) { message timestamp severity }
  }`;
  const data = await gql(token, query, { deploymentId, limit: 200 });
  const lines = [...(data.buildLogs || []), ...(data.deploymentLogs || [])].map(mapLog).filter((line) => line.message);
  if (!lines.length) {
    return [{ timestamp: null, level: 'info', message: 'Aucun journal pour ce déploiement.' }];
  }
  return lines;
}

async function listEnv(credentials, projectId) {
  const token = auth(credentials);
  const ids = parseProjectId(projectId);
  const data = await gql(
    token,
    `query ($projectId: String!, $environmentId: String!, $serviceId: String) {
      variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId)
    }`,
    {
      projectId: ids.railwayProjectId,
      environmentId: ids.environmentId,
      serviceId: ids.serviceId,
    },
  );
  const variables = data.variables && typeof data.variables === 'object' ? data.variables : {};
  return Object.entries(variables).map(([key, value]) => ({
    key,
    value: value == null ? null : String(value),
    secret: false,
    readable: value != null,
    targets: [],
  }));
}

async function upsertEnv(credentials, projectId, input) {
  const token = auth(credentials);
  const ids = parseProjectId(projectId);
  await gql(
    token,
    `mutation ($input: VariableUpsertInput!) { variableUpsert(input: $input) }`,
    {
      input: {
        projectId: ids.railwayProjectId,
        environmentId: ids.environmentId,
        serviceId: ids.serviceId,
        name: input.key,
        value: input.value,
      },
    },
  );
  return { key: input.key };
}

async function deleteEnv(credentials, projectId, key) {
  const token = auth(credentials);
  const ids = parseProjectId(projectId);
  await gql(
    token,
    `mutation ($input: VariableDeleteInput!) { variableDelete(input: $input) }`,
    {
      input: {
        projectId: ids.railwayProjectId,
        environmentId: ids.environmentId,
        serviceId: ids.serviceId,
        name: key,
      },
    },
  );
}

module.exports = {
  key: 'railway',
  name: 'Railway',
  description: 'Services Railway : déploiements, logs et variables.',
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
