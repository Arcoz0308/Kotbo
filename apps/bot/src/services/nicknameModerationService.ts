/**
 * Service de modération automatique des pseudos Discord.
 * Délègue la détection des mots bannis à bannedWordsService (service générique partagé).
 */

import { containsBannedWord, INVISIBLE_ONLY_REGEX } from './bannedWordsService.js';

export { loadBannedWords, invalidateBannedWordsCache } from './bannedWordsService.js';

/** Pseudo de remplacement appliqué automatiquement. */
export const SAFE_NICKNAME = 'pseudo non conforme | automod';

/**
 * Vérifie si un pseudo est non conforme.
 *
 * @param name  Le pseudo brut (nickname, globalName ou username) à analyser.
 * @param words Liste de mots bannis chargée via `loadBannedWords(guildId)`.
 * @returns `true` si le pseudo doit être remplacé.
 */
export function isNicknameProblematic(name: string, words: string[]): boolean {
  if (!name || name.trim().length === 0) return true;
  if (INVISIBLE_ONLY_REGEX.test(name)) return true;
  return containsBannedWord(name, words);
}

/**
 * Retourne une raison de renommage lisible pour les logs Discord.
 */
export function buildRenameReason(originalName: string): string {
  return `Automod: pseudo non conforme — original: "${originalName}"`;
}
