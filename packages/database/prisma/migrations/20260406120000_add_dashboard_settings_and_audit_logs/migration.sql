CREATE TABLE IF NOT EXISTS "dashboard_settings" (
  "guildId" TEXT NOT NULL,
  "email" TEXT NOT NULL DEFAULT '',
  "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
  "cloudBackup" BOOLEAN NOT NULL DEFAULT true,
  "debugLog" BOOLEAN NOT NULL DEFAULT false,
  "killSwitchEnabled" BOOLEAN NOT NULL DEFAULT false,
  "severityByModule" JSONB,
  "messageTemplate" TEXT NOT NULL DEFAULT E'🔔 {titre}\n\n{resume}\n\nSource: {source}\nAuteur: {auteur}\n\nPublié automatiquement par Kotbo.',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "dashboard_settings_pkey" PRIMARY KEY ("guildId")
);

CREATE TABLE IF NOT EXISTS "dashboard_audit_logs" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "user" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "context" TEXT NOT NULL,
  "module" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "details" TEXT NOT NULL,
  "dateIso" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "dashboard_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "dashboard_audit_logs_guildId_dateIso_idx"
ON "dashboard_audit_logs"("guildId", "dateIso");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'dashboard_settings_guildId_fkey'
  ) THEN
    ALTER TABLE "dashboard_settings"
    ADD CONSTRAINT "dashboard_settings_guildId_fkey"
    FOREIGN KEY ("guildId") REFERENCES "guilds"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'dashboard_audit_logs_guildId_fkey'
  ) THEN
    ALTER TABLE "dashboard_audit_logs"
    ADD CONSTRAINT "dashboard_audit_logs_guildId_fkey"
    FOREIGN KEY ("guildId") REFERENCES "guilds"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
