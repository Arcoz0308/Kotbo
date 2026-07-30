-- Index de support pour les agrégats du Pulse.
--
-- Le snapshot quotidien compte les tickets clos dans la journée
-- (`closedAt` dans [début, fin[), un accès qu'aucun index existant ne couvre :
-- `20260728000000_add_ticket_performance_indexes` indexe `createdAt` et `status`,
-- mais pas `closedAt`.
CREATE INDEX IF NOT EXISTS "tickets_guildId_closedAt_idx" ON "tickets"("guildId", "closedAt");

-- Doublon : la contrainte UNIQUE (guildId, dateKey) fournit déjà exactement le
-- même index B-tree. Le conserver ne faisait que renchérir chaque écriture.
DROP INDEX IF EXISTS "pulse_snapshots_guildId_dateKey_idx";
