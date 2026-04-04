# Zone de tests du bot

Cette zone centralise les tests avant lancement.

## Objectif

- Valider les utilitaires metier (langue, mots-cles, embeds, parsing metadata)
- Verifier les contrats de toutes les features (commandes, handlers, events, panels, services, utils)
- Bloquer le demarrage si la qualite minimale n'est pas respectee

## Organisation

- `contracts.features.test.ts`: couverture structurelle factorisee de toutes les features
- `helpers/`: fonctions partagees de decouverte et verification des modules
- `unit/`: tests unitaires metier

## Commandes

Depuis la racine:

- `bun test:bot`
- `bun coverage:bot`
- `bun quality:bot`

Depuis `apps/bot`:

- `bun run test:unit`
- `bun run test:coverage`
- `bun run coverage:gate`
- `bun run quality:gate`
- `bun run start:safe`
- `bun run dev:safe`

## Seuils de couverture

- Fonctions: 80%
- Lignes: 90%

Variables optionnelles:

- `KOTBO_COVERAGE_FUNCS`
- `KOTBO_COVERAGE_LINES`
