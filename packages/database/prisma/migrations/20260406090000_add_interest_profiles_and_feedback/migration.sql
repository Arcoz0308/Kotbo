-- CreateEnum
CREATE TYPE "InterestDecision" AS ENUM ('ALLOWED', 'FILTERED_OUT');

-- CreateEnum
CREATE TYPE "FeedbackSource" AS ENUM ('STAFF_APPROVE', 'STAFF_REJECT', 'USER_INTERESTING', 'USER_NOT_INTERESTING', 'RECOVERY_OVERRIDE');

-- AlterTable
ALTER TABLE "guilds" ADD COLUMN "preferencesMigrated" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "feed_items"
ADD COLUMN "interestDecision" "InterestDecision" NOT NULL DEFAULT 'ALLOWED',
ADD COLUMN "interestReason" TEXT,
ADD COLUMN "interestScore" DOUBLE PRECISION,
ADD COLUMN "topics" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "interest_topic_scores" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL DEFAULT '__guild__',
  "topic" TEXT NOT NULL,
  "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "positiveCount" INTEGER NOT NULL DEFAULT 0,
  "negativeCount" INTEGER NOT NULL DEFAULT 0,
  "lastInteractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "interest_topic_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_interest_feedback" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "userId" TEXT,
  "feedItemId" TEXT,
  "topic" TEXT NOT NULL,
  "value" INTEGER NOT NULL,
  "source" "FeedbackSource" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "news_interest_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feed_items_interestDecision_createdAt_idx" ON "feed_items"("interestDecision", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "interest_topic_scores_guildId_userId_topic_key" ON "interest_topic_scores"("guildId", "userId", "topic");

-- CreateIndex
CREATE INDEX "interest_topic_scores_guildId_userId_idx" ON "interest_topic_scores"("guildId", "userId");

-- CreateIndex
CREATE INDEX "interest_topic_scores_topic_idx" ON "interest_topic_scores"("topic");

-- CreateIndex
CREATE INDEX "news_interest_feedback_guildId_createdAt_idx" ON "news_interest_feedback"("guildId", "createdAt");

-- CreateIndex
CREATE INDEX "news_interest_feedback_userId_createdAt_idx" ON "news_interest_feedback"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "news_interest_feedback_feedItemId_idx" ON "news_interest_feedback"("feedItemId");

-- AddForeignKey
ALTER TABLE "interest_topic_scores" ADD CONSTRAINT "interest_topic_scores_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_interest_feedback" ADD CONSTRAINT "news_interest_feedback_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
