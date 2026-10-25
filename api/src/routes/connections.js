'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { sendError, httpError } = require('../lib/errors');
const {
  createConnection,
  listConnections,
  deleteConnection,
  retestConnection,
  withAdapter,
  touch,
  audit,
} = require('../services/connections.service');

const router = express.Router();

router.use(requireAuth);

function assertCapability(adapter, key) {
  if (!adapter.capabilities[key]) {
    throw httpError(400, 'Action non disponible pour cet hébergeur');
  }
}

async function run(res, row, fn) {
  try {
    return await fn();
  } catch (err) {
    if (err.upstream === 401 || err.upstream === 403) {
      await touch(row, 'error', err.message).catch(() => {});
    }
    throw err;
  }
}

router.get('/', async (req, res) => {
  try {
    res.json({ connections: await listConnections(req.user.id) });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/', async (req, res) => {
  try {
    const connection = await createConnection(req.user.id, req.body || {});
    res.status(201).json({ connection });
  } catch (err) {
    sendError(res, err);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await deleteConnection(req.user.id, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/:id/test', async (req, res) => {
  try {
    const connection = await retestConnection(req.user.id, req.params.id);
    res.json({ connection });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/:id/projects', async (req, res) => {
  try {
    const { row, adapter, credentials } = await withAdapter(req.user.id, req.params.id);
    const projects = await run(res, row, () => adapter.listProjects(credentials));
    await touch(row, 'connected', null);
    res.json({ projects, capabilities: adapter.capabilities });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/:id/projects/:projectId/deployments', async (req, res) => {
  try {
    const { row, adapter, credentials } = await withAdapter(req.user.id, req.params.id);
    assertCapability(adapter, 'listDeployments');
    const deployments = await run(res, row, () => adapter.listDeployments(credentials, req.params.projectId));
    res.json({ deployments });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/:id/projects/:projectId/redeploy', async (req, res) => {
  try {
    const { row, adapter, credentials } = await withAdapter(req.user.id, req.params.id);
    assertCapability(adapter, 'redeploy');
    const deploymentId = (req.body || {}).deploymentId || null;
    const deployment = await run(res, row, () => adapter.redeploy(credentials, req.params.projectId, deploymentId));
    await audit(req.user.id, row.id, 'redeploy', req.params.projectId, {
      deploymentId: deploymentId || deployment?.id || null,
    });
    res.status(202).json({ deployment });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/:id/projects/:projectId/deployments/:deploymentId/logs', async (req, res) => {
  try {
    const { row, adapter, credentials } = await withAdapter(req.user.id, req.params.id);
    assertCapability(adapter, 'logs');
    const logs = await run(res, row, () =>
      adapter.getLogs(credentials, req.params.projectId, req.params.deploymentId),
    );
    res.json({ logs });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/:id/projects/:projectId/env', async (req, res) => {
  try {
    const { row, adapter, credentials } = await withAdapter(req.user.id, req.params.id);
    assertCapability(adapter, 'envRead');
    const env = await run(res, row, () => adapter.listEnv(credentials, req.params.projectId));
    res.json({
      env: env.map(({ id, ...item }) => item),
      capabilities: adapter.capabilities,
    });
  } catch (err) {
    sendError(res, err);
  }
});

router.put('/:id/projects/:projectId/env', async (req, res) => {
  try {
    const { row, adapter, credentials } = await withAdapter(req.user.id, req.params.id);
    assertCapability(adapter, 'envWrite');
    const key = String((req.body || {}).key || '').trim();
    const value = (req.body || {}).value;
    if (!key) throw httpError(400, 'La clé est requise');
    if (typeof value !== 'string') throw httpError(400, 'La valeur est requise');
    await run(res, row, () =>
      adapter.upsertEnv(credentials, req.params.projectId, {
        key,
        value,
        secret: Boolean((req.body || {}).secret),
      }),
    );
    await audit(req.user.id, row.id, 'env_upsert', `${req.params.projectId}:${key}`, {
      key,
      secret: Boolean((req.body || {}).secret),
    });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

router.delete('/:id/projects/:projectId/env/:key', async (req, res) => {
  try {
    const { row, adapter, credentials } = await withAdapter(req.user.id, req.params.id);
    assertCapability(adapter, 'envWrite');
    const secret = req.query.secret === '1' || req.query.secret === 'true';
    await run(res, row, () => adapter.deleteEnv(credentials, req.params.projectId, req.params.key, { secret }));
    await audit(req.user.id, row.id, 'env_delete', `${req.params.projectId}:${req.params.key}`, {
      key: req.params.key,
      secret,
    });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
