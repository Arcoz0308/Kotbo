-- Interactive Audit Logger & Visual Diff : conservation des états avant/après
-- des modifications de messages, membres, rôles, salons et permissions.

CREATE TABLE IF NOT EXISTS "audit_logger_configs" (
  "guildId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "retentionDays" INTEGER NOT NULL DEFAULT 90,
  "captureMessages" BOOLEAN NOT NULL DEFAULT true,
  "captureMembers" BOOLEAN NOT NULL DEFAULT true,
  "captureRoles" BOOLEAN NOT NULL DEFAULT true,
  "captureChannels" BOOLEAN NOT NULL DEFAULT true,
  "ignoredChannelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "ignoredUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "audit_logger_configs_pkey" PRIMARY KEY ("guildId")
);

CREATE TABLE IF NOT EXISTS "audit_events" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "targetName" TEXT,
  "executorId" TEXT,
  "executorName" TEXT,
  "channelId" TEXT,
  "channelName" TEXT,
  "before" JSONB,
  "after" JSONB,
  "changes" JSONB NOT NULL,
  "changedFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "audit_events_guildId_createdAt_idx"
  ON "audit_events" ("guildId", "createdAt");
CREATE INDEX IF NOT EXISTS "audit_events_guildId_eventType_createdAt_idx"
  ON "audit_events" ("guildId", "eventType", "createdAt");
CREATE INDEX IF NOT EXISTS "audit_events_guildId_executorId_createdAt_idx"
  ON "audit_events" ("guildId", "executorId", "createdAt");
CREATE INDEX IF NOT EXISTS "audit_events_guildId_targetId_idx"
  ON "audit_events" ("guildId", "targetId");
CREATE INDEX IF NOT EXISTS "audit_events_guildId_channelId_createdAt_idx"
  ON "audit_events" ("guildId", "channelId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_logger_configs_guildId_fkey'
  ) THEN
    ALTER TABLE "audit_logger_configs"
      ADD CONSTRAINT "audit_logger_configs_guildId_fkey"
      FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_events_guildId_fkey'
  ) THEN
    ALTER TABLE "audit_events"
      ADD CONSTRAINT "audit_events_guildId_fkey"
      FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
