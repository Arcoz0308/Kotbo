-- La durée d'un accès passe du jour à la minute. Une seule unité de stockage
-- couvre desormais aussi bien un essai commercial de 15 jours qu'une période de
-- 30 minutes pour tester le cycle de vie complet.
--
-- La migration precedente (20260728120000_add_trial_access) n'a vecu que
-- quelques heures, mais les reprises ci-dessous restent justes si des codes ont
-- deja ete generes entre-temps.

-- 1. Nouvelle colonne de durée sur les codes.
ALTER TABLE "activation_codes" ADD COLUMN IF NOT EXISTS "durationMinutes" INTEGER;

UPDATE "activation_codes"
SET "durationMinutes" = "durationDays" * 1440
WHERE "durationDays" IS NOT NULL AND "durationMinutes" IS NULL;

ALTER TABLE "activation_codes" DROP COLUMN IF EXISTS "durationDays";

-- 2. Durée de la période en cours, portée par la guilde. Recopiée depuis le code
--    consommé pour les essais déjà ouverts ; à défaut, déduite de la période
--    écoulée entre l'activation et l'échéance.
ALTER TABLE "guilds" ADD COLUMN IF NOT EXISTS "accessDurationMinutes" INTEGER;

-- Toute période ouverte l'a été par un code (y compris via activate-auto, qui en
-- génère un), donc cette seule reprise suffit.
UPDATE "guilds" g
SET "accessDurationMinutes" = c."durationMinutes"
FROM "activation_codes" c
WHERE c."usedByGuildId" = g."id"
  AND c."durationMinutes" IS NOT NULL
  AND g."accessDurationMinutes" IS NULL;

-- 3. Les paliers de rappel déjà envoyés étaient exprimés en jours restants.
UPDATE "guilds"
SET "accessRemindersSent" = ARRAY(SELECT unnest("accessRemindersSent") * 1440)
WHERE COALESCE(array_length("accessRemindersSent", 1), 0) > 0;
