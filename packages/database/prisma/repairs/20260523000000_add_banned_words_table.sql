CREATE TABLE IF NOT EXISTS "banned_words" (
  "id" TEXT NOT NULL,
  "guildId" TEXT,
  "word" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'custom',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "banned_words_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "banned_words_guildId_enabled_idx"
  ON "banned_words"("guildId", "enabled");
CREATE INDEX IF NOT EXISTS "banned_words_guildId_word_idx"
  ON "banned_words"("guildId", "word");
CREATE UNIQUE INDEX IF NOT EXISTS "banned_words_global_word_unique"
  ON "banned_words"("word")
  WHERE "guildId" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "banned_words_guild_word_unique"
  ON "banned_words"("guildId", "word")
  WHERE "guildId" IS NOT NULL;

DO $$ BEGIN
  ALTER TABLE "banned_words"
  ADD CONSTRAINT "banned_words_guildId_fkey"
  FOREIGN KEY ("guildId") REFERENCES "guilds"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Preserve and copy legacy words when production still has the old array
-- column. Keep the source column intact during repair to avoid data loss.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'guilds'
      AND column_name = 'autoNicknameModerationWords'
  ) THEN
    EXECUTE $copy$
      INSERT INTO "banned_words"
        ("id", "guildId", "word", "category", "enabled", "createdAt", "updatedAt")
      SELECT
        gen_random_uuid()::text,
        g."id",
        TRIM(LOWER(word)),
        'custom',
        true,
        NOW(),
        NOW()
      FROM "guilds" g,
           UNNEST(g."autoNicknameModerationWords") AS word
      WHERE TRIM(LOWER(word)) != ''
      ON CONFLICT DO NOTHING
    $copy$;
  END IF;
END $$;
