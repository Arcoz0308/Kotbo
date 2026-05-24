ALTER TABLE "guilds" ADD COLUMN IF NOT EXISTS "autoNicknameModerationEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "guilds" ADD COLUMN IF NOT EXISTS "autoNicknameModerationWords" TEXT[] NOT NULL DEFAULT '{}';
