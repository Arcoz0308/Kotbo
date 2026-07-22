-- AlterTable
ALTER TABLE "guilds" ADD COLUMN     "clanXpFromLevelUp" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "clanXpPerLevelUp" INTEGER NOT NULL DEFAULT 50;
