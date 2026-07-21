-- Nom de provenance personnalisable pour regrouper et comparer les invitations.
ALTER TABLE "guild_invites" ADD COLUMN IF NOT EXISTS "sourceLabel" TEXT;
