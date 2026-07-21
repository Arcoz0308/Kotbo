-- AlterTable
ALTER TABLE "guilds" ADD COLUMN     "clanAnnouncementChannelId" TEXT,
ADD COLUMN     "clanRewardGiveaway" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "clanRewardLeaderRole" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "clanRewardXpBoost" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "clanRewardXpBoostRate" DOUBLE PRECISION NOT NULL DEFAULT 1.2,
ADD COLUMN     "lastWinningClanId" TEXT;
