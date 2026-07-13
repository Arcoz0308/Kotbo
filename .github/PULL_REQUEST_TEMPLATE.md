## 📝 Description
Cette PR implémente le module complet de **Clans** pour Kotbo. Elle intègre la structure de données (Prisma), les APIs d'administration, les services asynchrones sécurisés pour Discord (rate-limiting de masse), les commandes slash pour les membres, et les interfaces web (panneau d'administration et classement public).

---

## 🎯 Changements principaux

### 1. Base de données & Migrations
- **Schéma Prisma** : Modèles `Clan` (associé à un rôle Discord unique) et `ClanMemberContribution` (suivi de l'XP par joueur, clan et saison).
- **Migration SQL** : Script `20260713164100_add_clan_system` pour automatiser la mise à jour des tables en production.
- **Rétention des points** : Les points gagnés par un joueur restent associés au clan d'origine même si le joueur quitte ou change de clan en cours de saison.

### 2. API Backend & Services Discord
- **REST API** : CRUD pour les clans, exécution de tâches de masse et reset de saison.
- **API Publique** : Endpoint `/api/public/guilds/:guildId/clans` pour exposer les classements sans authentification.
- **Auto-mod & Unicité** : Sécurité dans `clanEvents.ts` forçant un seul clan par membre Discord, avec alertes de modération et logs d'audit.
- **Rate-Limit Guard** : Processus d'arrière-plan (`clanService.ts`) cadencé à 450ms/appel pour distribuer ou retirer les rôles sans subir de ban de l'API Discord.
- **Gain d'XP** : Intégration dans `levelingService.ts` pour créditer automatiquement l'XP d'activité (écrit/vocal) sur le clan actif du membre.

### 3. Commandes Slash Discord
- **/clan list** : Liste les clans configurés.
- **/clan leaderboard** : Affiche le classement général des clans pour la saison active.
- **/clan info <clan>** : Détails d'un clan et top 10 des contributeurs de la saison (avec autocomplétion).
- **/clan distribute** & **/clan clear** : Commandes réservées aux administrateurs pour lancer les processus de masse.

### 4. Interface Web (Svelte 5)
- **Panneau d'administration** : Page `Clans.svelte` pour configurer le module, créer/éditer des clans et suivre l'avancement live des tâches de masse.
- **Sécurités de confirmation** : Fenêtre de double-validation exigeant la saisie d'un mot-clé (`DISTRIBUER`, `RETIRER`, `RESET`) avant chaque action destructive ou lourde.
- **Classement Public** : Page responsive `LevelingClanPublic.svelte` (route `/:serverId/leveling/clan`) permettant de consulter le classement des clans et le top des participants (avec recherche par pseudo).

---

## 🧪 Comment tester ?

1. **Migration** : Exécuter la migration Prisma sur le serveur de dev.
2. **Configuration** : Activer le module de clans depuis le Dashboard Kotbo, créer 2 clans et leur assigner des rôles Discord distincts.
3. **Distribution** : Cliquer sur le bouton **Distribuer** sur le Dashboard, saisir le mot-clé de validation et vérifier le bon déroulement progressif de la tâche (barre de progression).
4. **Gain de points** : Envoyer des messages ou passer du temps en vocal avec un rôle de clan actif, puis vérifier l'incrémentation via `/clan leaderboard`.
5. **Changement de clan** : Changer manuellement le rôle de clan d'un membre de test, gagner des points à nouveau, et vérifier avec `/clan info` que l'historique des points dans l'ancien clan est bien préservé.
6. **Sécurité Unique** : Ajouter manuellement un deuxième rôle de clan à un membre et vérifier que le bot lui retire automatiquement le premier rôle avec un avertissement de log.
7. **Reset** : Effectuer un reset de saison et vérifier que le compteur passe à la saison supérieure et remet les scores à 0.

---

## ⚓ Liens / Issues
- Closes # (Clans Integration)

---

## 📜 Validation des conditions
*En soumettant cette Pull Request, vous devez valider les points suivants :*

- [x] Mes modifications respectent le style de code du projet.
- [x] J'ai testé mon code en local et il s'exécute sans erreur.
- [x] **J'accepte que ma contribution soit intégrée au projet Kotbo sous les termes de sa licence (Source-Available) et cède les droits d'exploitation associés à la structure Kotbo.**
