ALTER TABLE "daily_algo_problems"
ADD COLUMN IF NOT EXISTS "usedAt" TIMESTAMP(3);

ALTER TABLE "daily_algo_runs"
ADD COLUMN IF NOT EXISTS "dateKey" TEXT;

CREATE INDEX IF NOT EXISTS "daily_algo_problems_language_usedAt_idx" ON "daily_algo_problems"("language", "usedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "daily_algo_runs_guildId_dateKey_key" ON "daily_algo_runs"("guildId", "dateKey");