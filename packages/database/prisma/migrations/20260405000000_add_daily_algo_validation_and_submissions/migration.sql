ALTER TABLE "guilds"
ADD COLUMN IF NOT EXISTS "dailyAlgoValidationChannelId" TEXT;

DO $$ BEGIN
    CREATE TYPE "DailyAlgoSubmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "daily_algo_runs" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "challengeChannelId" TEXT NOT NULL,
    "validationChannelId" TEXT,
    "challengeMessageId" TEXT,
    "summarySentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_algo_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "daily_algo_submissions" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "solution" TEXT NOT NULL,
    "status" "DailyAlgoSubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "validationMessageId" TEXT,
    "validatedById" TEXT,
    "validatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_algo_submissions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "daily_algo_runs_guildId_createdAt_idx" ON "daily_algo_runs"("guildId", "createdAt");
CREATE INDEX IF NOT EXISTS "daily_algo_submissions_runId_status_idx" ON "daily_algo_submissions"("runId", "status");
CREATE INDEX IF NOT EXISTS "daily_algo_submissions_authorId_idx" ON "daily_algo_submissions"("authorId");

DO $$ BEGIN
    ALTER TABLE "daily_algo_runs"
    ADD CONSTRAINT "daily_algo_runs_guildId_fkey"
    FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "daily_algo_runs"
    ADD CONSTRAINT "daily_algo_runs_problemId_fkey"
    FOREIGN KEY ("problemId") REFERENCES "daily_algo_problems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "daily_algo_submissions"
    ADD CONSTRAINT "daily_algo_submissions_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "daily_algo_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
