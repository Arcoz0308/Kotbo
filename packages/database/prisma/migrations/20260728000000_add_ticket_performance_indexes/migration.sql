-- Indexes for the paginated dashboard ticket/transcript hot paths.
CREATE INDEX IF NOT EXISTS "tickets_guildId_createdAt_idx"
  ON "tickets"("guildId", "createdAt");

CREATE INDEX IF NOT EXISTS "tickets_guildId_status_createdAt_idx"
  ON "tickets"("guildId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "tickets_guildId_userId_status_idx"
  ON "tickets"("guildId", "userId", "status");

CREATE INDEX IF NOT EXISTS "tickets_guildId_status_inactivityAlertSent_idx"
  ON "tickets"("guildId", "status", "inactivityAlertSent");

CREATE INDEX IF NOT EXISTS "tickets_guildId_transcriptId_idx"
  ON "tickets"("guildId", "transcriptId");

CREATE INDEX IF NOT EXISTS "transcripts_guildId_createdAt_idx"
  ON "transcripts"("guildId", "createdAt");
