'use strict';

const { listConnections, withAdapter, touch } = require('./connections.service');

const HEALTHY = new Set([
  'ready',
  'success',
  'successful',
  'built',
  'published',
  'active',
  'deployed',
  'healthy',
  'online',
  'ok',
]);

const IN_FLIGHT = new Set([
  'building',
  'queued',
  'deploying',
  'pending',
  'enqueued',
  'initializing',
  'creating',
  'waiting',
  'in_progress',
]);

function isHealthy(status) {
  return HEALTHY.has(String(status || '').toLowerCase());
}

function isInFlight(status) {
  return IN_FLIGHT.has(String(status || '').toLowerCase());
}

function isFailed(status) {
  return ['error', 'failed', 'failure', 'crashed', 'canceled', 'cancelled'].includes(
    String(status || '').toLowerCase(),
  );
}

async function mapLimit(items, limit, fn) {
  const queue = items.slice();
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      await fn(item);
    }
  });
  await Promise.all(workers);
}

async function inventory(userId) {
  const connections = await listConnections(userId);
  const services = [];
  const errors = [];
  await mapLimit(connections, 3, async (connection) => {
    try {
      const { row, adapter, credentials } = await withAdapter(userId, connection.id);
      if (!adapter.capabilities.listProjects) return;
      const projects = await adapter.listProjects(credentials);
      await touch(row, 'connected', null);
      for (const project of projects.slice(0, 40)) {
        services.push({
          connectionId: connection.id,
          provider: connection.provider,
          providerName: connection.providerName,
          connectionLabel: connection.label,
          accountName: connection.accountName,
          capabilities: adapter.capabilities,
          credentials,
          adapter,
          project,
        });
      }
    } catch (err) {
      errors.push({
        connectionId: connection.id,
        provider: connection.provider,
        label: connection.label,
        message: err.message || 'Lecture impossible',
      });
    }
  });
  return { connections, services, errors };
}

function publicService(service) {
  return {
    connectionId: service.connectionId,
    provider: service.provider,
    providerName: service.providerName,
    connectionLabel: service.connectionLabel,
    accountName: service.accountName,
    project: {
      id: service.project.id,
      name: service.project.name,
      url: service.project.url,
      status: service.project.status,
      region: service.project.region,
      updatedAt: service.project.updatedAt,
    },
  };
}

async function deploymentsOf(service, limit = 8) {
  if (!service.capabilities.listDeployments) return [];
  const rows = await service.adapter.listDeployments(service.credentials, service.project.id);
  return (rows || []).slice(0, limit).map((row) => ({
    ...row,
    connectionId: service.connectionId,
    projectId: service.project.id,
    projectName: service.project.name,
    provider: service.provider,
    providerName: service.providerName,
  }));
}

async function fleetSummary(userId) {
  const { connections, services, errors } = await inventory(userId);
  const healthy = services.filter((item) => isHealthy(item.project.status) || !item.project.status).length;
  const degraded = services.filter((item) => isFailed(item.project.status)).length;
  const total = services.length;
  const byProvider = {};
  for (const item of services) {
    byProvider[item.providerName] = (byProvider[item.providerName] || 0) + 1;
  }
  return {
    total,
    healthy,
    degraded,
    errorCount: errors.length,
    uptime: total ? Math.round((healthy / total) * 10000) / 100 : null,
    providers: Object.entries(byProvider).map(([name, count]) => ({ name, count })),
    connectionCount: connections.length,
    cells: services.map((item) => ({
      id: `${item.connectionId}:${item.project.id}`,
      name: item.project.name,
      provider: item.providerName,
      status: item.project.status,
      state: isFailed(item.project.status) ? 'fault' : isHealthy(item.project.status) || !item.project.status ? 'nominal' : 'degraded',
    })),
    errors,
    services: services.map(publicService),
  };
}

async function serviceMesh(userId) {
  const { services, errors } = await inventory(userId);
  const rows = [];
  await mapLimit(services, 4, async (service) => {
    let latest = null;
    let logSample = [];
    try {
      const deployments = await deploymentsOf(service, 1);
      latest = deployments[0] || null;
      if (latest && service.capabilities.logs) {
        const logs = await service.adapter.getLogs(service.credentials, service.project.id, latest.id);
        logSample = (logs || []).slice(-6);
      }
    } catch (err) {
      logSample = [{ timestamp: null, level: 'error', message: err.message || 'Lecture impossible' }];
    }
    rows.push({
      ...publicService(service),
      latest,
      logSample,
    });
  });
  const nominal = rows.filter((row) => !isFailed(row.project.status)).length;
  return {
    total: rows.length,
    nominal,
    degraded: rows.length - nominal,
    errors,
    services: rows,
  };
}

function withDurations(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const key = `${row.connectionId}:${row.projectId}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    for (let index = 0; index < list.length; index += 1) {
      const previous = list[index - 1];
      const current = list[index];
      if (!previous?.createdAt || !current.createdAt) {
        current.durationMs = null;
        continue;
      }
      const delta = new Date(current.createdAt) - new Date(previous.createdAt);
      current.durationMs = delta >= 0 ? delta : null;
    }
  }
  return rows;
}

async function deploymentBoard(userId) {
  const { services, errors } = await inventory(userId);
  const all = [];
  await mapLimit(services, 4, async (service) => {
    try {
      const rows = await deploymentsOf(service, 8);
      all.push(...rows);
    } catch (err) {
      errors.push({
        connectionId: service.connectionId,
        provider: service.provider,
        label: service.project.name,
        message: err.message || 'Déploiements indisponibles',
      });
    }
  });
  withDurations(all);
  all.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const inFlight = all.filter((row) => isInFlight(row.status));
  return {
    inFlight: inFlight.length,
    queued: all.filter((row) => String(row.status || '').toLowerCase() === 'queued').length,
    history: all.slice(0, 40),
    errors,
    projects: services.map(publicService),
  };
}

async function logTail(userId) {
  const { services, errors } = await inventory(userId);
  const lines = [];
  await mapLimit(services, 4, async (service) => {
    if (!service.capabilities.logs || !service.capabilities.listDeployments) return;
    try {
      const deployments = await deploymentsOf(service, 1);
      const latest = deployments[0];
      if (!latest) return;
      const logs = await service.adapter.getLogs(service.credentials, service.project.id, latest.id);
      for (const line of logs || []) {
        lines.push({
          ...line,
          provider: service.provider,
          providerName: service.providerName,
          projectName: service.project.name,
          connectionId: service.connectionId,
          projectId: service.project.id,
          deploymentId: latest.id,
        });
      }
    } catch (err) {
      errors.push({
        connectionId: service.connectionId,
        provider: service.provider,
        label: service.project.name,
        message: err.message || 'Journaux indisponibles',
      });
    }
  });
  lines.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
  const levels = { info: 0, warn: 0, error: 0, debug: 0, other: 0 };
  for (const line of lines) {
    const level = String(line.level || '').toLowerCase();
    if (level.includes('err') || level.includes('fail')) levels.error += 1;
    else if (level.includes('warn')) levels.warn += 1;
    else if (level.includes('debug')) levels.debug += 1;
    else if (level.includes('info') || level === '') levels.info += 1;
    else levels.other += 1;
  }
  const stamps = lines.map((line) => (line.timestamp ? new Date(line.timestamp).getTime() : NaN)).filter((value) => !Number.isNaN(value));
  let linesPerSec = null;
  if (stamps.length >= 2) {
    const span = (Math.max(...stamps) - Math.min(...stamps)) / 1000;
    if (span > 0) linesPerSec = Math.round((lines.length / span) * 100) / 100;
  }
  return {
    total: lines.length,
    levels,
    linesPerSec,
    lines: lines.slice(-400),
    errors,
  };
}

async function vaultSnapshot(userId) {
  const { services, errors } = await inventory(userId);
  const variables = [];
  await mapLimit(services, 4, async (service) => {
    if (!service.capabilities.envRead) return;
    try {
      const env = await service.adapter.listEnv(service.credentials, service.project.id);
      for (const item of env || []) {
        variables.push({
          key: item.key,
          value: item.value,
          secret: item.secret,
          readable: item.readable,
          targets: item.targets || [],
          connectionId: service.connectionId,
          projectId: service.project.id,
          projectName: service.project.name,
          provider: service.provider,
          providerName: service.providerName,
          canWrite: Boolean(service.capabilities.envWrite),
        });
      }
    } catch (err) {
      errors.push({
        connectionId: service.connectionId,
        provider: service.provider,
        label: service.project.name,
        message: err.message || 'Variables indisponibles',
      });
    }
  });

  const byConnection = new Map();
  for (const item of variables) {
    if (!byConnection.has(item.connectionId)) byConnection.set(item.connectionId, new Map());
    const keys = byConnection.get(item.connectionId);
    if (!keys.has(item.key)) keys.set(item.key, []);
    keys.get(item.key).push(item);
  }
  const drifts = [];
  for (const [connectionId, keys] of byConnection) {
    const projectIds = new Set(
      services.filter((item) => item.connectionId === connectionId).map((item) => item.project.id),
    );
    if (projectIds.size < 2) continue;
    for (const [key, rows] of keys) {
      const present = new Set(rows.map((row) => row.projectId));
      if (present.size < projectIds.size) {
        drifts.push({ connectionId, key, reason: 'missing' });
        continue;
      }
      const readable = rows.filter((row) => row.readable && row.value != null);
      const distinct = new Set(readable.map((row) => row.value));
      if (distinct.size > 1) drifts.push({ connectionId, key, reason: 'mismatch' });
    }
  }

  const readable = variables.filter((item) => item.readable).length;
  return {
    total: variables.length,
    readable,
    masked: variables.length - readable,
    driftCount: drifts.length,
    drifts,
    variables,
    errors,
    projects: services.map(publicService),
  };
}

async function activityStream(userId) {
  const board = await deploymentBoard(userId);
  const events = board.history.slice(0, 24).map((row) => ({
    at: row.createdAt,
    kind: isFailed(row.status) ? 'deploy_failed' : isInFlight(row.status) ? 'deploy_running' : 'deploy',
    title: row.projectName,
    detail: [row.providerName, row.status, row.branch, row.commitSha ? String(row.commitSha).slice(0, 7) : null]
      .filter(Boolean)
      .join(' · '),
    connectionId: row.connectionId,
    projectId: row.projectId,
  }));
  for (const error of board.errors) {
    events.unshift({
      at: new Date().toISOString(),
      kind: 'connection_error',
      title: error.label,
      detail: error.message,
      connectionId: error.connectionId,
      projectId: null,
    });
  }
  return { events: events.slice(0, 30) };
}

module.exports = {
  fleetSummary,
  serviceMesh,
  deploymentBoard,
  logTail,
  vaultSnapshot,
  activityStream,
};
