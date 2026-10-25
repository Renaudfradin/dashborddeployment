'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { sendError } = require('../lib/errors');
const { listConnections, withAdapter, touch } = require('../services/connections.service');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const connections = await listConnections(req.user.id);
    const settled = await Promise.all(
      connections.map(async (connection) => {
        try {
          const { row, adapter, credentials } = await withAdapter(req.user.id, connection.id);
          const projects = await adapter.listProjects(credentials);
          await touch(row, 'connected', null);
          return {
            connection,
            projects: projects.map((project) => ({ ...project, connectionId: connection.id })),
          };
        } catch (err) {
          try {
            const { row } = await withAdapter(req.user.id, connection.id);
            await touch(row, 'error', err.message);
          } catch {
            /* la connexion a pu disparaître */
          }
          return { connection, error: err.message || 'Lecture impossible' };
        }
      }),
    );
    const services = [];
    const errors = [];
    for (const item of settled) {
      if (item.error) {
        errors.push({
          connectionId: item.connection.id,
          provider: item.connection.provider,
          label: item.connection.label,
          message: item.error,
        });
      } else {
        for (const project of item.projects) {
          services.push({
            connectionId: item.connection.id,
            provider: item.connection.provider,
            providerName: item.connection.providerName,
            connectionLabel: item.connection.label,
            accountName: item.connection.accountName,
            project,
          });
        }
      }
    }
    res.json({ services, errors });
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
