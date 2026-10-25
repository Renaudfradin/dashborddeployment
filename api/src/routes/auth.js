'use strict';

const express = require('express');
const {
  register,
  login,
  rotateRefreshToken,
  revokeRefreshToken,
  sanitizeUser,
} = require('../services/auth.service');
const { requireAuth } = require('../middleware/auth');
const { sendError } = require('../lib/errors');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const result = await register(req.body || {});
    res.status(201).json({ user: result.user, token: result.accessToken, refreshToken: result.refreshToken });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/login', async (req, res) => {
  try {
    const result = await login(req.body || {});
    res.json({ user: result.user, token: result.accessToken, refreshToken: result.refreshToken });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const tokens = await rotateRefreshToken((req.body || {}).refreshToken);
    res.json({ token: tokens.accessToken, refreshToken: tokens.refreshToken });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/logout', requireAuth, async (req, res) => {
  try {
    await revokeRefreshToken((req.body || {}).refreshToken);
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: sanitizeUser(req.user) });
});

module.exports = router;
