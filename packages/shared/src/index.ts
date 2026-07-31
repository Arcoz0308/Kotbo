/**
 * Logique pure partagée entre le bot et le dashboard.
 *
 * Ce package ne dépend de rien : ni Prisma, ni discord.js, ni API navigateur.
 * Il accueille les algorithmes utilisés des deux côtés, que le bot peut tester
 * et que le dashboard peut embarquer dans son bundle.
 */
export * from './textDiff.js';
export * from './workflow/types.js';
export * from './workflow/catalog.js';
export * from './workflow/validate.js';
export * from './simulation/types.js';
export * from './rankCard/types.js';
export * from './rankCard/presets.js';
export * from './rankCard/fonts.js';
export * from './rankCard/normalize.js';
