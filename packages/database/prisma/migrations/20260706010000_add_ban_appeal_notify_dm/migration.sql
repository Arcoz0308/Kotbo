-- Ajoute l'option d'envoi automatique du lien public d'appel de bannissement
-- par DM lors d'un ban définitif. Partagée entre le module Appels et le
-- module Sanctions (même colonne, deux écrans de configuration).

-- AlterTable
ALTER TABLE "ban_appeal_configs" ADD COLUMN "notifyOnBanDM" BOOLEAN NOT NULL DEFAULT false;
