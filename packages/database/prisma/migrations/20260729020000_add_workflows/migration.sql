-- Node Workflow Builder : automatisations no-code par blocs interconnectés.
-- Le graphe est stocké en JSON et interprété par le moteur du bot.

CREATE TABLE IF NOT EXISTS "workflows" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "triggerEvent" TEXT NOT NULL,
  "triggerType" TEXT NOT NULL,
  "graph" JSONB NOT NULL,
  "createdById" TEXT,
  "runCount" INTEGER NOT NULL DEFAULT 0,
  "successCount" INTEGER NOT NULL DEFAULT 0,
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "lastRunAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "workflows_guildId_enabled_idx" ON "workflows" ("guildId", "enabled");
CREATE INDEX IF NOT EXISTS "workflows_guildId_triggerEvent_enabled_idx"
  ON "workflows" ("guildId", "triggerEvent", "enabled");

CREATE TABLE IF NOT EXISTS "workflow_executions" (
  "id" TEXT NOT NULL,
  "workflowId" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "triggerPayload" JSONB,
  "context" JSONB,
  "currentNodeId" TEXT,
  "loopStack" JSONB,
  "resumeAt" TIMESTAMP(3),
  "nodeVisits" INTEGER NOT NULL DEFAULT 0,
  "iterations" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "workflow_executions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "workflow_executions_workflowId_startedAt_idx"
  ON "workflow_executions" ("workflowId", "startedAt");
CREATE INDEX IF NOT EXISTS "workflow_executions_guildId_startedAt_idx"
  ON "workflow_executions" ("guildId", "startedAt");
-- Sert au cron de reprise des nœuds Delay
CREATE INDEX IF NOT EXISTS "workflow_executions_status_resumeAt_idx"
  ON "workflow_executions" ("status", "resumeAt");

CREATE TABLE IF NOT EXISTS "workflow_execution_steps" (
  "id" TEXT NOT NULL,
  "executionId" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "nodeId" TEXT NOT NULL,
  "nodeType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OK',
  "inputs" JSONB,
  "outputs" JSONB,
  "error" TEXT,
  "durationMs" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "workflow_execution_steps_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "workflow_execution_steps_executionId_order_idx"
  ON "workflow_execution_steps" ("executionId", "order");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflows_guildId_fkey') THEN
    ALTER TABLE "workflows" ADD CONSTRAINT "workflows_guildId_fkey"
      FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_executions_workflowId_fkey') THEN
    ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_workflowId_fkey"
      FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_executions_guildId_fkey') THEN
    ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_guildId_fkey"
      FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_execution_steps_executionId_fkey') THEN
    ALTER TABLE "workflow_execution_steps" ADD CONSTRAINT "workflow_execution_steps_executionId_fkey"
      FOREIGN KEY ("executionId") REFERENCES "workflow_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
