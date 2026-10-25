'use strict';

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function cleanMessage(input) {
  return String(input || 'Erreur hébergeur')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/token["']?\s*[:=]\s*["'][^"']+["']/gi, 'token=[redacted]')
    .slice(0, 400);
}

function sendError(res, err) {
  const status = err.status && Number.isInteger(err.status) ? err.status : 500;
  if (status >= 500) console.error(err);
  const message = status >= 500 && !err.expose ? 'Erreur interne' : cleanMessage(err.message);
  res.status(status).json({ error: message });
}

module.exports = { httpError, cleanMessage, sendError };
