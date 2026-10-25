'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { httpError } = require('../lib/errors');

const ACCESS_TTL = '15m';
const REFRESH_DAYS = 7;

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw httpError(500, 'JWT_SECRET manquant');
  return secret;
}

function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function generateTokens(user) {
  const accessToken = jwt.sign({ sub: user.id, email: user.email }, jwtSecret(), { expiresIn: ACCESS_TTL });
  const refreshToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash: hashToken(refreshToken), expiresAt },
  });
  return { accessToken, refreshToken };
}

async function register({ email, password, name }) {
  if (process.env.ALLOW_REGISTRATION !== 'true') {
    throw httpError(403, 'Les inscriptions sont fermées');
  }
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) throw httpError(400, 'Email invalide');
  if (!password || String(password).length < 8) throw httpError(400, 'Le mot de passe doit contenir au moins 8 caractères');
  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const user = await prisma.user.create({
      data: {
        email: normalized,
        passwordHash,
        name: name ? String(name).trim().slice(0, 80) : null,
      },
    });
    const tokens = await generateTokens(user);
    return { user: sanitizeUser(user), ...tokens };
  } catch (err) {
    if (err.code === 'P2002') throw httpError(409, 'Un compte existe déjà avec cet email');
    throw err;
  }
}

async function login({ email, password }) {
  const normalized = String(email || '').trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user || !(await bcrypt.compare(String(password || ''), user.passwordHash))) {
    throw httpError(401, 'Email ou mot de passe incorrect');
  }
  if (!user.isActive) throw httpError(401, 'Compte désactivé');
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  const tokens = await generateTokens(updated);
  return { user: sanitizeUser(updated), ...tokens };
}

async function rotateRefreshToken(refreshToken) {
  if (!refreshToken) throw httpError(400, 'refreshToken est requis');
  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(refreshToken) },
    include: { user: true },
  });
  if (!row || row.revokedAt || row.expiresAt < new Date() || !row.user.isActive) {
    throw httpError(401, 'Session expirée');
  }
  await prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
  const tokens = await generateTokens(row.user);
  return tokens;
}

async function revokeRefreshToken(refreshToken) {
  if (!refreshToken) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

async function userFromAccessToken(token) {
  let payload;
  try {
    payload = jwt.verify(token, jwtSecret());
  } catch {
    throw httpError(401, 'Session invalide');
  }
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive) throw httpError(401, 'Session invalide');
  return user;
}

module.exports = {
  sanitizeUser,
  register,
  login,
  rotateRefreshToken,
  revokeRefreshToken,
  userFromAccessToken,
};
