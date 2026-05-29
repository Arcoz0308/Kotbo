-- AlterTable
ALTER TABLE "guilds" ADD COLUMN IF NOT EXISTS "nicknameModerationWhitelist" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "guilds" ADD COLUMN IF NOT EXISTS "nicknameModerationBypass" TEXT[] DEFAULT ARRAY[]::TEXT[];
