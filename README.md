# Kotbo

> [!WARNING]
> Le REAMDME n'est pas à jour et date de la realese 1.0 Merci de ne pas en prendre compte sauf pour la stack.

> Le bot Discord orienté actu tech qui transforme des flux bruts en publication éditorialisée, modérée et actionnable.

Kotbo est un bot Discord TypeScript/Bun en monorepo, centré sur la veille : RSS, YouTube, validation humaine, digest, traduction, abonnement DM et outils utilitaires.

## Sommaire

- [Kotbo](#kotbo)
  - [Sommaire](#sommaire)
  - [Vision](#vision)
  - [Fonctionnalites](#fonctionnalites)
    - [Flux RSS intelligents](#flux-rss-intelligents)
    - [Pipeline de moderation](#pipeline-de-moderation)
    - [YouTube monitoring](#youtube-monitoring)
    - [Digest editorial](#digest-editorial)
    - [Experience admin et moderation](#experience-admin-et-moderation)
    - [Experience utilisateur](#experience-utilisateur)
    - [Fonctions additionnelles](#fonctions-additionnelles)
  - [Architecture du projet](#architecture-du-projet)
    - [Cycle de vie d'une news RSS](#cycle-de-vie-dune-news-rss)
  - [Stack technique](#stack-technique)
  - [Installation locale rapide](#installation-locale-rapide)
    - [1) Prerequis](#1-prerequis)
    - [2) Installer les dependances](#2-installer-les-dependances)
    - [3) Variables d'environnement](#3-variables-denvironnement)
  - [Configuration environnement](#configuration-environnement)
  - [Base de donnees Prisma](#base-de-donnees-prisma)
  - [Lancement du bot](#lancement-du-bot)
    - [Deploiement des slash commands](#deploiement-des-slash-commands)
    - [Demarrer en local](#demarrer-en-local)
    - [Workflow complet (db + deploy + run)](#workflow-complet-db--deploy--run)
  - [Commandes disponibles](#commandes-disponibles)
    - [Administration et configuration](#administration-et-configuration)
    - [RSS et moderation](#rss-et-moderation)
    - [YouTube](#youtube)
    - [Utilitaires](#utilitaires)
  - [Panneaux interactifs](#panneaux-interactifs)
  - [Automatisations et cron](#automatisations-et-cron)
  - [Docker](#docker)
  - [Depannage](#depannage)
    - [Le bot ne se connecte pas](#le-bot-ne-se-connecte-pas)
    - [Les commandes slash ne s'affichent pas](#les-commandes-slash-ne-saffichent-pas)
    - [Erreurs base de donnees](#erreurs-base-de-donnees)
    - [Les news n'arrivent pas](#les-news-narrivent-pas)
  - [Idees d'evolution](#idees-devolution)

## Vision

Kotbo suit une boucle simple et efficace :

1. Il detecte (RSS/YouTube).
2. Il filtre (mots-cles globaux + par flux).
3. Il propose (queue de validation).
4. Il publie (salon public + thread de discussion).
5. Il diffuse (digest + DM abonnes + roles optionnels).

Resultat : moins de bruit, plus de signal.

## Fonctionnalites

### Flux RSS intelligents

- Ajout/suppression/activation des flux par slash command et panneaux.
- Filtrage avance :
  - Mots-cles globaux (serveur).
  - Mots-cles par flux.
  - Exclusions prioritaires.
- Auto-publication possible ou validation manuelle.
- Detection d'etat technique des flux (`lastPollStatus`, erreur, dernier poll).

### Pipeline de moderation

- Queue de validation dediee.
- Actions de moderation :
  - Valider.
  - Rejeter.
  - Traduire (si non FR).
  - Marquer pour epinglage.
- Publication en salon public apres validation.
- Creation automatique d'un thread de discussion avec regles.

### YouTube monitoring

- Abonnement/desabonnement a des chaines (ID/URL).
- Detection des nouvelles videos et shorts.
- Validation en queue, puis publication.
- Mention de role differenciee shorts vs videos longues.

### Digest editorial

- Digest quotidien ou hebdomadaire.
- Horaire configurable (HH:MM UTC).
- Canal dedie (ou fallback canal public).
- Mention d'un role optionnelle.
- Texte d'introduction personnalisable.

### Experience admin et moderation

- Setup guide pas-a-pas (`/setup`).
- Hub de configuration central (`/config`).
- Role moderateur personnalisable.
- Restriction de la commande `/status` a un salon specifique.

### Experience utilisateur

- Abonnements DM par flux (opt-in par boutons).
- Commande `/help` dynamique (avec autocompletion).
- Commandes utilitaires pour les devs (`/devutils`, `/epoch`, `/excuse`, `/ping`).

### Fonctions additionnelles

- Code Police (reformatte automatiquement du code non balise dans Discord).
- Daily Algo (publication + collecte de solutions via modal).
- Support d'un module releases GitHub (configuration presente, extensible).

## Architecture du projet

```text
Kotbo/
|-- apps/
|   `-- bot/                # Application Discord.js
|       `-- src/
|           |-- commands/   # Slash commands
|           |-- events/     # Listeners + cron registration
|           |-- handlers/   # Routing interactions + sessions
|           |-- panels/     # UI Discord (embeds, boutons, modals)
|           |-- services/   # RSS, YouTube, digest, notifications, traduction
|           `-- utils/      # Prisma client, logger, helpers
|-- packages/
|   `-- database/
|       `-- prisma/
|           |-- schema.prisma
|           |-- migrations/
|           `-- seed.ts
|-- Dockerfile
|-- bunfig.toml
`-- package.json
```

### Cycle de vie d'une news RSS

```text
RSS poll (toutes les 5 min)
  -> Filtrage mots-cles
  -> (Optionnel) traduction
  -> Queue validation OU auto-publication
  -> Publication salon public
  -> Thread discussion auto
  -> DM abonnes du flux
```

## Stack technique

- Runtime: Bun
- Langage: TypeScript
- API Discord: discord.js v14
- BDD: PostgreSQL
- ORM: Prisma
- Cache/Queue: Redis + BullMQ
- Planification: node-cron
- Parsing RSS: rss-parser
- Observabilite: Sentry (bot + dashboard)
- Traduction: LibreTranslate local (self-hosted via Docker Compose)

## Installation locale rapide

### 1) Prerequis

- Bun installe
- PostgreSQL accessible
- Une application Discord configuree (token + client id)

### 2) Installer les dependances

```bash
bun install
```

### 3) Variables d'environnement

```bash
cp .env.example .env
```

Renseigner ensuite les valeurs reelles dans `.env`.

## Configuration environnement

Variables principales :

- `DISCORD_TOKEN`: token du bot Discord.
- `DISCORD_CLIENT_ID`: application/client ID Discord.
- `GUILD_ID`: serveur cible pour seed et deploiement local des commandes.
- `DATABASE_URL`: connexion PostgreSQL Prisma.
- `LOG_LEVEL`: `info` ou `debug`.
- `REDIS_URL` ou (`REDIS_HOST` + `REDIS_PORT` + `REDIS_PASSWORD`): connexion Redis pour cache/queue BullMQ.
- `BULLMQ_CONCURRENCY`: nombre de jobs BullMQ traites en parallele (defaut `2`).
- `BOT_SENTRY_DSN` (ou `SENTRY_DSN`): DSN Sentry pour le bot.
- `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, `SENTRY_TRACES_SAMPLE_RATE`: telemetry bot Sentry.
- `VITE_SENTRY_DSN`: DSN Sentry frontend dashboard.
- `VITE_SENTRY_ENVIRONMENT`, `VITE_SENTRY_RELEASE`, `VITE_SENTRY_TRACES_SAMPLE_RATE`: telemetry dashboard Sentry.
- `NATHAN_YOUTUBE_CHANNEL_ID`: optionnel, fallback historique YouTube.
- `LIBRETRANSLATE_URL`: URL de l'instance LibreTranslate (`http://libretranslate:5000` en docker compose).
- `LIBRETRANSLATE_API_KEY`: optionnel, cle API LibreTranslate si l'instance choisie en exige une.
- `TRANSLATION_TIMEOUT_MS`: timeout des appels traduction (defaut: `7000`).

## Base de donnees Prisma

Depuis la racine du monorepo :

```bash
bun db:generate
bun db:push
bun db:seed
```

Ou via migration dev (package database) :

```bash
bun db:migrate
```

En production/deploiement (migrations versionnees) :

```bash
bun db:migrate:deploy
```

Le seed initialise notamment :

- Un ensemble de flux RSS FR/EN.
- Les excuses developpeur en francais.

## Lancement du bot

### Deploiement des slash commands

```bash
bun deploy-commands
```

- Si `GUILD_ID` est defini: deploiement serveur (instantane).
- Sinon: deploiement global (propagation potentiellement lente).

### Demarrer en local

```bash
bun dev
```

ou

```bash
bun dev:bot
```

### Workflow complet (db + deploy + run)

```bash
bun deploy
```

## Commandes disponibles

### Administration et configuration

- `/setup`
  - Assistant de configuration pas-a-pas.
- `/config`
  - Hub de configuration complet.
- `/admin info`
  - Resume des parametres persistes.
- `/admin set-algo-channel channel:<salon>`
- `/admin set-releases-channel channel:<salon>`

### RSS et moderation

- `/feed add nom:<texte> url:<url> [categorie] [auto_publier] [langue] [traduire_en]`
- `/feed remove nom:<autocomplete>`
- `/feed toggle nom:<autocomplete>`
- `/feed autopub nom:<autocomplete> auto_publier:<bool>`
- `/feed list`
- `/feed status`
- `/feed keywords nom:<autocomplete> [inclure] [exclure]`
- `/feed role nom:<autocomplete> [role] [auto_creer]`
- `/news submit url:<url>`

### YouTube

- `/youtube subscribe channel:<id|url>`
- `/youtube unsubscribe channel:<id|url>`
- `/youtube list`

### Utilitaires

- `/help [cmd]`
- `/info`
- `/ping`
- `/status url:<url>`
- `/epoch [value]`
- `/excuse`
- `/devutils jwt token:<jwt>`
- `/devutils base64 action:<encode|decode> content:<texte>`
- `/devutils hash content:<texte>`

## Panneaux interactifs

Le bot propose une UX riche basee sur :

- Embeds de configuration.
- Boutons d'action rapide.
- Select menus (salons, roles, sections).
- Modals pour saisie structuree.

Sections principales du hub :

- Flux d'actualite (RSS, YouTube, digest, traduction, mots-cles).
- Police du code.
- Daily Algo.
- Releases GitHub.
- Restriction `/status`.

## Automatisations et cron

Jobs planifies:

- RSS polling: toutes les 5 minutes.
- YouTube polling: toutes les 15 minutes.
- Digest check: chaque minute (envoi seulement a l'heure configuree).

Bonnes pratiques d'exploitation:

- Garder un salon de validation dedie.
- Activer `LOG_LEVEL=debug` pour diagnostiquer un flux instable.
- Eviter l'auto-publication globale sans filtres si volume eleve.

## Docker

Image basee sur `oven/bun`.

Mode recommande (bot + LibreTranslate heberge localement):

```bash
docker compose up --build
```

Ce mode demarre:

1. Le service LibreTranslate local (`http://libretranslate:5000` dans le reseau compose).
2. Le bot avec fallback local automatique quand Google est en quota.

Arret:

```bash
docker compose down
```

Build:

```bash
docker build -t kotbo:latest .
```

Run (exemple):

```bash
docker run --rm -it --env-file .env kotbo:latest
```

Le conteneur execute au demarrage:

1. Deploiement des commandes.
2. Lancement du bot.

## Depannage

### Le bot ne se connecte pas

Verifier:

- `DISCORD_TOKEN` valide.
- Intentions/permissions configurees dans l'application Discord.

### Les commandes slash ne s'affichent pas

- Relancer `bun deploy-commands`.
- En global, attendre la propagation.
- En local, utiliser `GUILD_ID` pour un deploiement instantane.

### Erreurs base de donnees

- Verifier `DATABASE_URL`.
- Regenerer Prisma client: `bun db:generate`.
- Synchroniser schema (local): `bun db:push` ou `bun db:migrate`.
- Synchroniser schema (prod): `bun db:migrate:deploy`.

### Les news n'arrivent pas

Verifier dans la config du serveur:

- Salon de validation (`configChannelId`) si moderation manuelle.
- Salon public (`publicChannelId`) pour publication.
- Flux actifs.
- Mots-cles trop restrictifs.

## Idees d'evolution

1. Observabilite: dashboard de stats (latence RSS, taux de validation, taux de traduction).
2. Scoring de qualite de source (fiabilite, cadence, taux de rejet).
3. Export hebdomadaire des tendances (categories, sujets chauds, sources leaders).
4. Test suite (unitaires + integration) pour securiser les evolutions.
