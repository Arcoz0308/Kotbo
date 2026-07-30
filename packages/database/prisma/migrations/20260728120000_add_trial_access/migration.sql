-- Accès à durée limitée (période d'essai, abonnement).
-- Les colonnes ont toutes un défaut compatible avec l'existant : les serveurs
-- déjà activés restent en PERMANENT sans expiration.

-- AlterTable
ALTER TABLE "activation_codes"
  ADD COLUMN IF NOT EXISTS "accessType" TEXT NOT NULL DEFAULT 'PERMANENT',
  ADD COLUMN IF NOT EXISTS "durationDays" INTEGER,
  ADD COLUMN IF NOT EXISTS "label" TEXT;

-- AlterTable
ALTER TABLE "guilds"
  ADD COLUMN IF NOT EXISTS "accessType" TEXT NOT NULL DEFAULT 'PERMANENT',
  ADD COLUMN IF NOT EXISTS "accessExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "accessExpiredAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "accessRemindersSent" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- Balayage quotidien des accès arrivant à échéance : on ne lit que les serveurs
-- encore activés dont l'accès a une date de fin.
CREATE INDEX IF NOT EXISTS "guilds_accessExpiresAt_idx" ON "guilds"("accessExpiresAt") WHERE "accessExpiresAt" IS NOT NULL;
