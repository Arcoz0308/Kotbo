-- Staff Simulator : entraînement des modérateurs sur incidents simulés.

CREATE TABLE IF NOT EXISTS "simulation_configs" (
  "guildId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "testChannelId" TEXT,
  "stepTimeoutSeconds" INTEGER NOT NULL DEFAULT 180,
  "traineeRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "simulation_configs_pkey" PRIMARY KEY ("guildId")
);

CREATE TABLE IF NOT EXISTS "simulation_scenarios" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "difficulty" TEXT NOT NULL DEFAULT 'MEDIUM',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "steps" JSONB NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "simulation_scenarios_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "simulation_scenarios_guildId_enabled_idx"
  ON "simulation_scenarios" ("guildId", "enabled");

CREATE TABLE IF NOT EXISTS "simulation_sessions" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "scenarioId" TEXT NOT NULL,
  "traineeId" TEXT NOT NULL,
  "traineeName" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "currentStep" INTEGER NOT NULL DEFAULT 0,
  "webhookId" TEXT,
  "postedMessageIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "score" INTEGER NOT NULL DEFAULT 0,
  "maxScore" INTEGER NOT NULL DEFAULT 0,
  "scorePercent" INTEGER NOT NULL DEFAULT 0,
  "correctCount" INTEGER NOT NULL DEFAULT 0,
  "partialCount" INTEGER NOT NULL DEFAULT 0,
  "missedCount" INTEGER NOT NULL DEFAULT 0,
  "averageResponseMs" INTEGER NOT NULL DEFAULT 0,
  "advice" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "simulation_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "simulation_sessions_guildId_startedAt_idx"
  ON "simulation_sessions" ("guildId", "startedAt");
CREATE INDEX IF NOT EXISTS "simulation_sessions_guildId_traineeId_startedAt_idx"
  ON "simulation_sessions" ("guildId", "traineeId", "startedAt");
CREATE INDEX IF NOT EXISTS "simulation_sessions_guildId_status_idx"
  ON "simulation_sessions" ("guildId", "status");

CREATE TABLE IF NOT EXISTS "simulation_answers" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "stepIndex" INTEGER NOT NULL,
  "stepId" TEXT NOT NULL,
  "stepKind" TEXT NOT NULL,
  "expectedAction" TEXT NOT NULL,
  "expectedMinutes" INTEGER,
  "chosenAction" TEXT,
  "chosenMinutes" INTEGER,
  "correct" BOOLEAN NOT NULL DEFAULT false,
  "partiallyCorrect" BOOLEAN NOT NULL DEFAULT false,
  "points" INTEGER NOT NULL DEFAULT 0,
  "maxPoints" INTEGER NOT NULL DEFAULT 0,
  "slow" BOOLEAN NOT NULL DEFAULT false,
  "reason" TEXT NOT NULL DEFAULT '',
  "responseMs" INTEGER NOT NULL DEFAULT 0,
  "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "answeredAt" TIMESTAMP(3),

  CONSTRAINT "simulation_answers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "simulation_answers_sessionId_stepIndex_key"
  ON "simulation_answers" ("sessionId", "stepIndex");
CREATE INDEX IF NOT EXISTS "simulation_answers_sessionId_stepIndex_idx"
  ON "simulation_answers" ("sessionId", "stepIndex");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'simulation_configs_guildId_fkey') THEN
    ALTER TABLE "simulation_configs" ADD CONSTRAINT "simulation_configs_guildId_fkey"
      FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'simulation_scenarios_guildId_fkey') THEN
    ALTER TABLE "simulation_scenarios" ADD CONSTRAINT "simulation_scenarios_guildId_fkey"
      FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'simulation_sessions_guildId_fkey') THEN
    ALTER TABLE "simulation_sessions" ADD CONSTRAINT "simulation_sessions_guildId_fkey"
      FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'simulation_sessions_scenarioId_fkey') THEN
    ALTER TABLE "simulation_sessions" ADD CONSTRAINT "simulation_sessions_scenarioId_fkey"
      FOREIGN KEY ("scenarioId") REFERENCES "simulation_scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'simulation_answers_sessionId_fkey') THEN
    ALTER TABLE "simulation_answers" ADD CONSTRAINT "simulation_answers_sessionId_fkey"
      FOREIGN KEY ("sessionId") REFERENCES "simulation_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
