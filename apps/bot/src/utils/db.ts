import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

loadEnv({ path: path.resolve(currentDir, '../../../../.env') });
loadEnv({ path: path.resolve(currentDir, '../../.env') });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL non défini. Vérifie ton fichier .env.');
}

const poolSize = Number.parseInt(process.env.DATABASE_POOL_SIZE ?? '30', 10) || 30;
const adapter = new PrismaPg({ connectionString, max: poolSize });

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter,
    log: process.env.LOG_LEVEL === 'debug' ? ['error', 'warn'] : ['error'],
  });

// Diagnostic log to see what models are actually loaded at runtime
if (process.env.NODE_ENV !== 'production') {
  const models = Object.keys(prisma).filter(k => !k.startsWith('_') && !k.startsWith('$'));
  console.log("[Prisma Startup Diagnostics] Loaded Models:", models);
}

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Read replica for dashboard/analytics queries (heavy reads that shouldn't
// block the primary write pool). Falls back to the primary if not configured.
const readReplicaUrl = process.env.DATABASE_READ_REPLICA_URL;
const globalForReadReplica = globalThis as unknown as { prismaReadReplica: PrismaClient };

export const prismaRead: PrismaClient = readReplicaUrl
  ? (globalForReadReplica.prismaReadReplica ||
    (() => {
      const readPoolSize = Number.parseInt(process.env.DATABASE_READ_POOL_SIZE ?? '20', 10) || 20;
      const readAdapter = new PrismaPg({ connectionString: readReplicaUrl, max: readPoolSize });
      const client = new PrismaClient({
        adapter: readAdapter,
        log: ['error'],
      });
      if (process.env.NODE_ENV !== 'production') globalForReadReplica.prismaReadReplica = client;
      return client;
    })())
  : prisma;

export default prisma;
