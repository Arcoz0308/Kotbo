-- Guild toggles for message logging / global search
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS "messageLoggingEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS "messageLoggingRetentionDays" INTEGER NOT NULL DEFAULT 90;
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS "messageLoggingIgnoredChannels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS "messageLoggingStatus" JSONB;

-- Message log table
CREATE TABLE IF NOT EXISTS "message_logs" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "channelName" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorAvatar" TEXT,
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "content" TEXT NOT NULL DEFAULT '',
    "attachments" JSONB,
    "embedCount" INTEGER NOT NULL DEFAULT 0,
    "hasAttachment" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "message_logs_messageId_key" ON "message_logs"("messageId");
CREATE INDEX IF NOT EXISTS "message_logs_guildId_createdAt_idx" ON "message_logs"("guildId", "createdAt");
CREATE INDEX IF NOT EXISTS "message_logs_guildId_channelId_idx" ON "message_logs"("guildId", "channelId");
CREATE INDEX IF NOT EXISTS "message_logs_guildId_authorId_idx" ON "message_logs"("guildId", "authorId");
CREATE INDEX IF NOT EXISTS "message_logs_guildId_deletedAt_idx" ON "message_logs"("guildId", "deletedAt");

-- Trigram-style substring search acceleration for content (Discord/Windows-style search).
-- Wrapped so a managed Postgres without the pg_trgm privilege doesn't fail the deploy;
-- search still works without the index (just slower on very large tables).
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE INDEX IF NOT EXISTS "message_logs_content_trgm_idx" ON "message_logs" USING gin ("content" gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm index non créé (%). La recherche fonctionnera sans index trigramme.', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'message_logs_guildId_fkey'
  ) THEN
    ALTER TABLE "message_logs"
      ADD CONSTRAINT "message_logs_guildId_fkey"
      FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
