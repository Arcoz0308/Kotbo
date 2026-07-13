-- AlterTable
ALTER TABLE "guilds" ADD COLUMN     "clanXpFromActivity" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "clanXpFromLevelUp" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "clanXpPerLevelUp" INTEGER NOT NULL DEFAULT 50;
