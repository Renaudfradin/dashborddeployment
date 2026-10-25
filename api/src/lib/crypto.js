'use strict';

const crypto = require('crypto');

function encryptionKey() {
  const secret = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!secret) {
    const err = new Error('CREDENTIALS_ENCRYPTION_KEY manquant');
    err.status = 500;
    throw err;
  }
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptJson(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${Buffer.concat([iv, tag, ciphertext]).toString('base64')}`;
}

function decryptJson(payload) {
  if (typeof payload !== 'string' || !payload.startsWith('v1:')) {
    const err = new Error('Secret de connexion illisible');
    err.status = 500;
    throw err;
  }
  const buf = Buffer.from(payload.slice(3), 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}

module.exports = { encryptJson, decryptJson };
