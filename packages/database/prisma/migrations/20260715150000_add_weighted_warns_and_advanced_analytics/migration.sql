-- Migration: warns pondérés + analytics avancées (mots fréquents, social, onboarding, hygiène des bans)

-- Warns pondérés
ALTER TABLE "sanctions" ADD COLUMN IF NOT EXISTS "weight" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "guilds" ADD COLUMN IF NOT EXISTS "warnWeightingEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "guilds" ADD COLUMN IF NOT EXISTS "warnDecayDays" INTEGER;

-- Toggles analytics
ALTER TABLE "guilds" ADD COLUMN IF NOT EXISTS "wordStatsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "guilds" ADD COLUMN IF NOT EXISTS "banHygieneEnabled" BOOLEAN NOT NULL DEFAULT true;

-- Onboarding (membership screening) complété
ALTER TABLE "member_profiles" ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" TIMESTAMP(3);

-- Analytics sociales sur les messages loggés
ALTER TABLE "message_logs" ADD COLUMN IF NOT EXISTS "mentionedUserIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "message_logs" ADD COLUMN IF NOT EXISTS "repliedToAuthorId" TEXT;
CREATE INDEX IF NOT EXISTS "message_logs_guildId_repliedToAuthorId_idx" ON "message_logs"("guildId", "repliedToAuthorId");

-- Fréquence des mots (agrégat anonyme par jour)
CREATE TABLE IF NOT EXISTS "guild_word_stats" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "guild_word_stats_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "guild_word_stats_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "guild_word_stats_guildId_dateKey_word_key" ON "guild_word_stats"("guildId", "dateKey", "word");
CREATE INDEX IF NOT EXISTS "guild_word_stats_guildId_dateKey_idx" ON "guild_word_stats"("guildId", "dateKey");

-- Hygiène des bans : comptes bannis détectés comme supprimés
CREATE TABLE IF NOT EXISTS "ban_hygiene_records" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userTag" TEXT,
    "detectedDeletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),
    "unbannedAt" TIMESTAMP(3),

    CONSTRAINT "ban_hygiene_records_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ban_hygiene_records_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "ban_hygiene_records_guildId_userId_key" ON "ban_hygiene_records"("guildId", "userId");
CREATE INDEX IF NOT EXISTS "ban_hygiene_records_guildId_unbannedAt_idx" ON "ban_hygiene_records"("guildId", "unbannedAt");
