import prisma from './db.js';
import { logger } from './logger.js';

let dashboardSchemaPatched = false;

/** Colonnes requises par getGuildState / getOrCreateRuntime (migration 20260601120000). */
export async function ensureDashboardSchemaPatches(): Promise<void> {
  if (dashboardSchemaPatched) return;

  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "dashboard_settings"
        ADD COLUMN IF NOT EXISTS "commandRestrictions" JSONB,
        ADD COLUMN IF NOT EXISTS "sidebarFavorites" TEXT[] DEFAULT ARRAY[]::TEXT[];
      ALTER TABLE "dashboard_audit_logs"
        ADD COLUMN IF NOT EXISTS "channelId" TEXT;
    `);
    dashboardSchemaPatched = true;
  } catch (error) {
    logger.warn('SchemaPatches', `Dashboard schema patch failed: ${String(error)}`);
  }
}
