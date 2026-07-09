-- Actions configurables par bouton du menu de présentation du thread d'accueil :
-- afficher une page embed (comportement historique), attribuer/retirer/basculer un
-- rôle, ou rediriger vers un salon du serveur / une URL externe.

-- AlterTable
ALTER TABLE "welcome_menu_pages"
  ADD COLUMN "actionType" TEXT NOT NULL DEFAULT 'EMBED',
  ADD COLUMN "roleId" TEXT,
  ADD COLUMN "roleAction" TEXT NOT NULL DEFAULT 'ADD',
  ADD COLUMN "linkUrl" TEXT,
  ALTER COLUMN "embedTitle" DROP NOT NULL,
  ALTER COLUMN "embedDescription" DROP NOT NULL;
