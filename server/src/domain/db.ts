/**
 * One Prisma client for the process.
 *
 * Next's dev server re-evaluates modules on every edit, and a fresh client per
 * evaluation exhausts Postgres connections within a few saves. Stashing it on
 * `globalThis` is the standard way out and costs nothing in production.
 */
import { PrismaClient } from '@prisma/client';

const store = globalThis as unknown as { mahironPrisma?: PrismaClient };

export const db: PrismaClient = store.mahironPrisma ?? new PrismaClient();

if (process.env['NODE_ENV'] !== 'production') store.mahironPrisma = db;
