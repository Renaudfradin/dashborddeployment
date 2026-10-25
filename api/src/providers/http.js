'use strict';

const { cleanMessage } = require('../lib/errors');

class ProviderError extends Error {
  constructor(message, status = 502) {
    super(cleanMessage(message));
    this.status = status;
    this.expose = true;
    this.isProvider = true;
  }
}

async function providerRequest(url, options = {}) {
  const headers = {
    Accept: options.accept || 'application/json',
    ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    ...options.headers,
  };
  let response;
  try {
    response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch (err) {
    throw new ProviderError(`Réseau indisponible : ${err.message}`);
  }

  const text = await response.text();
  if (!response.ok) {
    let detail = text;
    try {
      const parsed = JSON.parse(text);
      detail =
        parsed.message ||
        parsed.error_description ||
        parsed.error?.message ||
        (typeof parsed.error === 'string' ? parsed.error : '') ||
        text;
    } catch {
      detail = text;
    }
    const status = response.status === 401 || response.status === 403 ? 400 : 502;
    const prefix = response.status === 401 || response.status === 403
      ? 'Accès refusé par l’hébergeur'
      : 'Hébergeur';
    const error = new ProviderError(`${prefix} (${response.status}) : ${detail || response.statusText}`, status);
    error.upstream = response.status;
    throw error;
  }

  if (options.raw) {
    return options.withHeaders ? { data: text, headers: response.headers } : text;
  }
  if (!text) {
    return options.withHeaders ? { data: null, headers: response.headers } : null;
  }
  try {
    const data = JSON.parse(text);
    return options.withHeaders ? { data, headers: response.headers } : data;
  } catch {
    return options.withHeaders ? { data: text, headers: response.headers } : text;
  }
}

function asUrl(value) {
  if (!value) return null;
  const raw = String(value);
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return `https://${raw}`;
}

function iso(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    const ms = value < 1e12 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return out;
}

module.exports = {
  ProviderError,
  providerRequest,
  asUrl,
  iso,
  mapPool,
};
