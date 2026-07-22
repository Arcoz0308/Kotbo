import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * Remonte l'arborescence jusqu'au premier .env trouve.
 *
 * Les scripts Prisma sont lances via `bun run --filter @kotbo/database`, donc
 * avec packages/database pour cwd, alors que le .env vit a la racine du monorepo.
 * Chercher uniquement dans cwd donnait un DATABASE_URL vide.
 */
function findEnvFile(): string | null {
  let dir = process.cwd();

  for (;;) {
    const candidate = resolve(dir, '.env');
    if (existsSync(candidate)) return candidate;

    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const envPath = findEnvFile();

if (!process.env.DATABASE_URL && envPath) {
  const envContent = readFileSync(envPath, 'utf8');
  for (const rawLine of envContent.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;

    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

export default {
  schema: './prisma',
  migrations: {
    path: './prisma/migrations',
    seed: 'bun run prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
} satisfies import('prisma').PrismaConfig;