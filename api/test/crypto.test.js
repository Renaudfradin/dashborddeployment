'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.CREDENTIALS_ENCRYPTION_KEY = 'test-encryption-key';

const { encryptJson, decryptJson } = require('../src/lib/crypto');

test('chiffre et déchiffre un secret', () => {
  const payload = { token: 'secret-token', teamId: 'team_1' };
  const encoded = encryptJson(payload);
  assert.notEqual(encoded, JSON.stringify(payload));
  assert.equal(encoded.includes('secret-token'), false);
  assert.deepEqual(decryptJson(encoded), payload);
});

test('refuse un secret modifié', () => {
  const encoded = encryptJson({ token: 'abc' });
  const raw = Buffer.from(encoded.slice(3), 'base64');
  raw[raw.length - 1] ^= 1;
  const tampered = `v1:${raw.toString('base64')}`;
  assert.throws(() => decryptJson(tampered));
});
