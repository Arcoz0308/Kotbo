-- Migration: index member_invites by (guildId, inviteCode)
-- Utilisé par la détection de double-comptes pour repérer les invitations générales/publiques
-- (grand nombre de membres arrivés via le même code) sans scan de table.
CREATE INDEX IF NOT EXISTS "member_invites_guildId_inviteCode_idx" ON "member_invites"("guildId", "inviteCode");
