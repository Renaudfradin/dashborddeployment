'use strict';

const prisma = require('../lib/prisma');
const { httpError } = require('../lib/errors');
const { encryptJson, decryptJson } = require('../lib/crypto');
const { getAdapter, validateCredentials } = require('../providers/registry');

function publicConnection(row) {
  const adapter = getAdapter(row.provider);
  return {
    id: row.id,
    provider: row.provider,
    providerName: adapter.name,
    label: row.label,
    accountName: row.accountName,
    status: row.status,
    statusMessage: row.statusMessage,
    lastCheckedAt: row.lastCheckedAt,
    createdAt: row.createdAt,
    capabilities: adapter.capabilities,
  };
}

async function requireOwnedConnection(userId, connectionId, db = prisma) {
  const row = await db.providerConnection.findFirst({
    where: { id: connectionId, userId },
  });
  if (!row) throw httpError(404, 'Connexion introuvable');
  return row;
}

function openCredentials(row) {
  return decryptJson(row.credentialsEnc);
}

async function touch(row, status, statusMessage) {
  return prisma.providerConnection.update({
    where: { id: row.id },
    data: {
      status,
      statusMessage: statusMessage ? String(statusMessage).slice(0, 300) : null,
      lastCheckedAt: new Date(),
    },
  });
}

async function audit(userId, connectionId, action, targetRef, metadata) {
  await prisma.auditLog.create({
    data: {
      userId,
      connectionId,
      action,
      targetRef: targetRef ? String(targetRef).slice(0, 200) : null,
      metadata: metadata || undefined,
    },
  });
}

async function createConnection(userId, { provider, label, credentials }) {
  const adapter = getAdapter(provider);
  const cleanLabel = String(label || '').trim().slice(0, 80);
  if (!cleanLabel) throw httpError(400, 'Le libellé est requis');
  const stored = validateCredentials(adapter, credentials);
  let account;
  try {
    account = await adapter.testConnection(stored);
  } catch (err) {
    throw httpError(err.status && err.status < 500 ? err.status : 400, err.message || 'Connexion refusée');
  }
  try {
    const row = await prisma.providerConnection.create({
      data: {
        userId,
        provider: adapter.key,
        label: cleanLabel,
        accountName: account.accountName,
        credentialsEnc: encryptJson(stored),
        status: 'connected',
        lastCheckedAt: new Date(),
      },
    });
    return publicConnection(row);
  } catch (err) {
    if (err.code === 'P2002') throw httpError(409, 'Ce libellé existe déjà pour cet hébergeur');
    throw err;
  }
}

async function listConnections(userId) {
  const rows = await prisma.providerConnection.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(publicConnection);
}

async function deleteConnection(userId, connectionId) {
  const row = await requireOwnedConnection(userId, connectionId);
  await prisma.providerConnection.delete({ where: { id: row.id } });
}

async function retestConnection(userId, connectionId) {
  const row = await requireOwnedConnection(userId, connectionId);
  const adapter = getAdapter(row.provider);
  try {
    const account = await adapter.testConnection(openCredentials(row));
    const updated = await prisma.providerConnection.update({
      where: { id: row.id },
      data: {
        accountName: account.accountName,
        status: 'connected',
        statusMessage: null,
        lastCheckedAt: new Date(),
      },
    });
    return publicConnection(updated);
  } catch (err) {
    await touch(row, 'error', err.message);
    throw err;
  }
}

async function withAdapter(userId, connectionId) {
  const row = await requireOwnedConnection(userId, connectionId);
  return {
    row,
    adapter: getAdapter(row.provider),
    credentials: openCredentials(row),
  };
}

module.exports = {
  publicConnection,
  requireOwnedConnection,
  createConnection,
  listConnections,
  deleteConnection,
  retestConnection,
  withAdapter,
  touch,
  audit,
};
