'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://dashboard:dashboard@localhost:5432/deployment_dashboard';
process.env.CREDENTIALS_ENCRYPTION_KEY = process.env.CREDENTIALS_ENCRYPTION_KEY || 'test-encryption-key';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt';

const { requireOwnedConnection } = require('../src/services/connections.service');

test('une connexion d’un autre utilisateur est introuvable', async () => {
  const calls = [];
  const db = {
    providerConnection: {
      async findFirst({ where }) {
        calls.push(where);
        assert.equal(where.userId, 'user-a');
        assert.equal(where.id, 'conn-1');
        return null;
      },
    },
  };
  await assert.rejects(
    () => requireOwnedConnection('user-a', 'conn-1', db),
    (err) => err.status === 404,
  );
  assert.equal(calls.length, 1);
});

test('la connexion est renvoyée seulement si le couple id + utilisateur correspond', async () => {
  const row = { id: 'conn-1', userId: 'user-a', provider: 'vercel' };
  const db = {
    providerConnection: {
      async findFirst({ where }) {
        if (where.userId === row.userId && where.id === row.id) return row;
        return null;
      },
    },
  };
  const found = await requireOwnedConnection('user-a', 'conn-1', db);
  assert.equal(found, row);
  await assert.rejects(() => requireOwnedConnection('user-b', 'conn-1', db), (err) => err.status === 404);
});
