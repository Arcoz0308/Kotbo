/**
 * Point d entree historique du socle API du bot.
 *
 * Le contenu vit desormais dans ./shared/ : core.ts pour la configuration,
 * les types et les utilitaires, et un module par gros domaine. Ce fichier
 * ne fait que les reexporter, les modules qui importent 'shared.js' restent
 * inchanges.
 */
export * from './shared/core.js';
export * from './shared/memberCase.js';
export * from './shared/guildState.js';
export * from './shared/sharding.js';
export * from './shared/markdown.js';
