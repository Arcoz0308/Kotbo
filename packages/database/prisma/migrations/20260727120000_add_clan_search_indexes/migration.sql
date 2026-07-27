-- Index de la recherche publique des clans : calcul du rang d'un participant
-- (comptage des contributions du même clan ayant plus de points) et remontée de
-- l'historique de gains d'une personne donnée.

-- CreateIndex
CREATE INDEX "clan_member_contributions_guildId_clanId_season_xp_idx" ON "clan_member_contributions"("guildId", "clanId", "season", "xp");

-- CreateIndex
CREATE INDEX "clan_contribution_events_guildId_userId_createdAt_idx" ON "clan_contribution_events"("guildId", "userId", "createdAt");
