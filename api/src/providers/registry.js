'use strict';

const vercel = require('./vercel');
const netlify = require('./netlify');
const railway = require('./railway');
const githubPages = require('./github');
const scaleway = require('./scaleway');

/**
 * Pour ajouter un hébergeur :
 * 1. Créer api/src/providers/<nom>.js avec la même interface
 *    (key, name, description, capabilities, credentialsFields, testConnection,
 *    listProjects, listDeployments, redeploy, getLogs, listEnv, upsertEnv, deleteEnv).
 * 2. L’enregistrer dans ADAPTERS ci-dessous.
 * L’interface lit GET /api/providers et masque les actions dont la capacité est fausse.
 */
const ADAPTERS = [vercel, netlify, railway, githubPages, scaleway];

function listProviders() {
  return ADAPTERS.map((adapter) => ({
    key: adapter.key,
    name: adapter.name,
    description: adapter.description,
    credentials: adapter.credentialsFields(),
    capabilities: adapter.capabilities,
  }));
}

function getAdapter(key) {
  const adapter = ADAPTERS.find((item) => item.key === key);
  if (!adapter) {
    const err = new Error('Hébergeur inconnu');
    err.status = 400;
    err.expose = true;
    throw err;
  }
  return adapter;
}

function validateCredentials(adapter, credentials) {
  const fields = adapter.credentialsFields();
  const input = credentials && typeof credentials === 'object' ? credentials : {};
  const stored = {};
  for (const field of fields) {
    const raw = input[field.name];
    const value = typeof raw === 'string' ? raw.trim() : raw;
    if (field.required && (value == null || value === '')) {
      const err = new Error(`${field.label} est requis`);
      err.status = 400;
      err.expose = true;
      throw err;
    }
    if (value != null && value !== '') stored[field.name] = value;
    else if (field.defaultValue) stored[field.name] = field.defaultValue;
  }
  return stored;
}

module.exports = { listProviders, getAdapter, validateCredentials, ADAPTERS };
