-- Permet de regrouper les actions de rôle du menu d'accueil en choix
-- mutuellement exclusifs (par exemple les différents clans d'un serveur).
ALTER TABLE "welcome_menu_pages"
  ADD COLUMN "roleGroup" TEXT;
