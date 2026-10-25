'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { listProviders } = require('../providers/registry');

const router = express.Router();

router.get('/', requireAuth, (_req, res) => {
  res.json({ providers: listProviders() });
});

module.exports = router;
