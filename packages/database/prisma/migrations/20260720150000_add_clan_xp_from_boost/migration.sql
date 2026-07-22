-- AlterTable
ALTER TABLE "guilds" ADD COLUMN     "clanXpFromBoost" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "clanXpPerBoost" INTEGER NOT NULL DEFAULT 100;
