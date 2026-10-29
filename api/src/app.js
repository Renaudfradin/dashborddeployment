'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth');
const providerRoutes = require('./routes/providers');
const connectionRoutes = require('./routes/connections');
const overviewRoutes = require('./routes/overview');
const telemetryRoutes = require('./routes/telemetry');
const { sendError } = require('./lib/errors');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));
  app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3024',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Trop de tentatives, réessayez plus tard' },
  });
  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/providers', providerRoutes);
  app.use('/api/connections', connectionRoutes);
  app.use('/api/overview', overviewRoutes);
  app.use('/api/telemetry', telemetryRoutes);

  app.use((err, _req, res, _next) => {
    sendError(res, err);
  });

  return app;
}

module.exports = { createApp };
