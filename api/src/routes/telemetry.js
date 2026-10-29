'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { sendError } = require('../lib/errors');
const telemetry = require('../services/telemetry.service');

const router = express.Router();

router.use(requireAuth);

function bind(method) {
  return async (req, res) => {
    try {
      res.json(await telemetry[method](req.user.id));
    } catch (err) {
      sendError(res, err);
    }
  };
}

router.get('/fleet', bind('fleetSummary'));
router.get('/services', bind('serviceMesh'));
router.get('/deployments', bind('deploymentBoard'));
router.get('/logs', bind('logTail'));
router.get('/vault', bind('vaultSnapshot'));
router.get('/activity', bind('activityStream'));

module.exports = router;
