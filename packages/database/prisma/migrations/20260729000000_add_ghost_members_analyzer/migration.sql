-- Ghost Members Analyzer : audit de présence silencieuse.
-- Ajoute les signaux d'activité non textuelle sur les profils membres, la
-- configuration de classification par serveur et le journal des prunages.

-- ── Signaux d'activité silencieuse sur MemberProfile ─────────────────────────
ALTER TABLE "member_profiles" ADD COLUMN IF NOT EXISTS "lastReactionAt" TIMESTAMP(3);
ALTER TABLE "member_profiles" ADD COLUMN IF NOT EXISTS "lastDashboardLoginAt" TIMESTAMP(3);
ALTER TABLE "member_profiles" ADD COLUMN IF NOT EXISTS "interactionCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "member_profiles" ADD COLUMN IF NOT EXISTS "ghostStatus" TEXT;
ALTER TABLE "member_profiles" ADD COLUMN IF NOT EXISTS "ghostComputedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "member_profiles_guildId_ghostStatus_idx"
  ON "member_profiles" ("guildId", "ghostStatus");

-- ── Configuration de classification par serveur ──────────────────────────────
CREATE TABLE IF NOT EXISTS "ghost_analyzer_configs" (
  "guildId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "inactiveDays" INTEGER NOT NULL DEFAULT 60,
  "spectatorWindowDays" INTEGER NOT NULL DEFAULT 30,
  "gracePeriodDays" INTEGER NOT NULL DEFAULT 30,
  "protectStaff" BOOLEAN NOT NULL DEFAULT true,
  "protectBoosters" BOOLEAN NOT NULL DEFAULT true,
  "protectedRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "maxPruneBatch" INTEGER NOT NULL DEFAULT 50,
  "pruneReason" TEXT NOT NULL DEFAULT 'Nettoyage des membres inactifs',
  "lastComputedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ghost_analyzer_configs_pkey" PRIMARY KEY ("guildId")
);

-- ── Journal d'exécution des prunages ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ghost_prune_runs" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "executedById" TEXT NOT NULL,
  "executedByName" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "targetStatuses" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "totalTargeted" INTEGER NOT NULL DEFAULT 0,
  "successCount" INTEGER NOT NULL DEFAULT 0,
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "kickedUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "failures" JSONB,
  "reason" TEXT,
  "criteria" JSONB,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "ghost_prune_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ghost_prune_runs_guildId_startedAt_idx"
  ON "ghost_prune_runs" ("guildId", "startedAt");

-- ── Clés étrangères ──────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ghost_analyzer_configs_guildId_fkey'
  ) THEN
    ALTER TABLE "ghost_analyzer_configs"
      ADD CONSTRAINT "ghost_analyzer_configs_guildId_fkey"
      FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ghost_prune_runs_guildId_fkey'
  ) THEN
    ALTER TABLE "ghost_prune_runs"
      ADD CONSTRAINT "ghost_prune_runs_guildId_fkey"
      FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
