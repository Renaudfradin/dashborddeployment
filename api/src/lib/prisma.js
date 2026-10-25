'use strict';

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: process.env.PRISMA_LOG === '1' ? ['error', 'warn'] : ['error'],
});

module.exports = prisma;
