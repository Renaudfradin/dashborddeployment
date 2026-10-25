'use strict';

const { userFromAccessToken } = require('../services/auth.service');
const { sendError } = require('../lib/errors');

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) {
      return res.status(401).json({ error: 'Authentification requise' });
    }
    req.user = await userFromAccessToken(token);
    return next();
  } catch (err) {
    return sendError(res, err);
  }
}

module.exports = { requireAuth };
