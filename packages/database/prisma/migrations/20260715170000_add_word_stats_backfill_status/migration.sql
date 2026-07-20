-- Migration: suivi de l'indexation des stats de mots depuis les messages déjà journalisés
ALTER TABLE "guilds" ADD COLUMN IF NOT EXISTS "wordStatsBackfillStatus" JSONB;
