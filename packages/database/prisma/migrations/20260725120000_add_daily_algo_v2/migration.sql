-- Daily Algo v2 : barème de points entier, semaine compétitive, points bonus
-- manuels, sanctions, et pont optionnel vers les points de clan.

-- AlterEnum
ALTER TYPE "DailyAlgoSubmissionStatus" ADD VALUE 'DISMISSED';

-- CreateEnum
CREATE TYPE "DailyAlgoWeekStatus" AS ENUM ('OPEN', 'CLOSED');

-- AlterTable
ALTER TABLE "daily_algo_runs" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'DAILY',
ADD COLUMN     "pointsMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "daily_algo_submissions" ADD COLUMN     "abuseFlagged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "abuseReason" TEXT,
ADD COLUMN     "pointsAwarded" INTEGER;

-- AlterTable
ALTER TABLE "guilds" ADD COLUMN     "dailyAlgoTimezone" TEXT NOT NULL DEFAULT 'Europe/Paris',
ADD COLUMN     "dailyAlgoParticipationPoints" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "dailyAlgoWeekendMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
ADD COLUMN     "dailyAlgoWeeklyRewardsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dailyAlgoWeekRole1Id" TEXT,
ADD COLUMN     "dailyAlgoWeekRole2Id" TEXT,
ADD COLUMN     "dailyAlgoWeekRole3Id" TEXT,
ADD COLUMN     "dailyAlgoWeekRoleRotate" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "dailyAlgoWeekXp1" INTEGER NOT NULL DEFAULT 500,
ADD COLUMN     "dailyAlgoWeekXp2" INTEGER NOT NULL DEFAULT 300,
ADD COLUMN     "dailyAlgoWeekXp3" INTEGER NOT NULL DEFAULT 150,
ADD COLUMN     "dailyAlgoWeekParticipationXp" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "dailyAlgoWeekAnnouncementChannelId" TEXT,
ADD COLUMN     "dailyAlgoSanctionType" TEXT NOT NULL DEFAULT 'WARN',
ADD COLUMN     "dailyAlgoSanctionWeight" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "dailyAlgoSanctionDurationMinutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "clanPointsFromDailyAlgo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "clanPointsFromDailyAlgoRate" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
ADD COLUMN     "clanPointsDailyAlgoTop1" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "clanPointsDailyAlgoTop2" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "clanPointsDailyAlgoTop3" INTEGER NOT NULL DEFAULT 10;

-- CreateTable
CREATE TABLE "daily_algo_weeks" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "weekKey" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "DailyAlgoWeekStatus" NOT NULL DEFAULT 'OPEN',
    "finalLeaderboard" JSONB,
    "closedAt" TIMESTAMP(3),
    "rewardsGrantedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_algo_weeks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_algo_weekly_rewards" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "xpGranted" INTEGER NOT NULL DEFAULT 0,
    "clanPointsGranted" INTEGER NOT NULL DEFAULT 0,
    "roleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_algo_weekly_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_algo_bonus_points" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "grantedById" TEXT NOT NULL,
    "weekKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_algo_bonus_points_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_algo_weeks_guildId_weekKey_key" ON "daily_algo_weeks"("guildId", "weekKey");

-- CreateIndex
CREATE INDEX "daily_algo_weeks_guildId_status_idx" ON "daily_algo_weeks"("guildId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "daily_algo_weekly_rewards_weekId_userId_key" ON "daily_algo_weekly_rewards"("weekId", "userId");

-- CreateIndex
CREATE INDEX "daily_algo_weekly_rewards_guildId_userId_idx" ON "daily_algo_weekly_rewards"("guildId", "userId");

-- CreateIndex
CREATE INDEX "daily_algo_bonus_points_guildId_weekKey_idx" ON "daily_algo_bonus_points"("guildId", "weekKey");

-- CreateIndex
CREATE INDEX "daily_algo_bonus_points_guildId_userId_idx" ON "daily_algo_bonus_points"("guildId", "userId");

-- AddForeignKey
ALTER TABLE "daily_algo_weeks" ADD CONSTRAINT "daily_algo_weeks_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_algo_weekly_rewards" ADD CONSTRAINT "daily_algo_weekly_rewards_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "daily_algo_weeks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_algo_bonus_points" ADD CONSTRAINT "daily_algo_bonus_points_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
