-- CreateTable
CREATE TABLE IF NOT EXISTS "dc_voice_sessions" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL,
    "leftAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dc_voice_sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "dc_voice_sessions_guildId_userId_joinedAt_idx" ON "dc_voice_sessions"("guildId", "userId", "joinedAt");
CREATE INDEX IF NOT EXISTS "dc_voice_sessions_guildId_channelId_joinedAt_idx" ON "dc_voice_sessions"("guildId", "channelId", "joinedAt");

CREATE TABLE IF NOT EXISTS "dc_detection_samples" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "altUserId" TEXT,
    "score" INTEGER NOT NULL,
    "features" JSONB NOT NULL,
    "label" TEXT,
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dc_detection_samples_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "dc_detection_samples_guildId_userId_idx" ON "dc_detection_samples"("guildId", "userId");
CREATE INDEX IF NOT EXISTS "dc_detection_samples_guildId_label_idx" ON "dc_detection_samples"("guildId", "label");
CREATE INDEX IF NOT EXISTS "dc_detection_samples_guildId_createdAt_idx" ON "dc_detection_samples"("guildId", "createdAt");

CREATE TABLE IF NOT EXISTS "dc_signal_weights" (
    "id" TEXT NOT NULL,
    "guildId" TEXT,
    "signalType" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dc_signal_weights_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "dc_signal_weights_guildId_signalType_key" ON "dc_signal_weights"("guildId", "signalType");
CREATE INDEX IF NOT EXISTS "dc_signal_weights_signalType_idx" ON "dc_signal_weights"("signalType");

-- Foreign keys (corrected: the checked-in migration referenced "Guild" instead of
-- the mapped table name "guilds", so these were never actually created in production)
DO $$ BEGIN
  ALTER TABLE "dc_voice_sessions"
  ADD CONSTRAINT "dc_voice_sessions_guildId_fkey"
  FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "dc_detection_samples"
  ADD CONSTRAINT "dc_detection_samples_guildId_fkey"
  FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "dc_signal_weights"
  ADD CONSTRAINT "dc_signal_weights_guildId_fkey"
  FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
