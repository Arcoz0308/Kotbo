/**
 * Service générique de gestion des mots bannis.
 *
 * Utilisable par plusieurs modules :
 *  - Modération des pseudos (nicknameModeration.ts)
 *  - Modération des messages (future automod)
 *  - Tout autre système nécessitant un filtre de contenu
 *
 * Les mots sont stockés en BDD (table `banned_words`) :
 *  - guildId = null → mots globaux (liste de base, read-only côté dashboard serveur)
 *  - guildId = <id> → mots personnalisés par serveur
 */

import prisma from '../utils/db.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Regex — caractères invisibles/non affichables
// ---------------------------------------------------------------------------

/**
 * Regex partagée pour détecter les textes composés uniquement de caractères
 * invisibles ou non affichables (espaces zero-width, soft hyphen, BOM, etc.)
 */
export const INVISIBLE_ONLY_REGEX =
  /^[\s\u200B\u200C\u200D\u00AD\uFEFF\u2060\u180E\u00A0\u2000-\u200A\u202F\u205F\u3000]+$/;

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

type CacheEntry = {
  words: string[];
  expiresAt: number;
};

/** Cache par guildId (ou '__global__' pour les mots globaux) */
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

const GLOBAL_KEY = '__global__';

/**
 * Invalide le cache pour un serveur donné.
 * Si aucun guildId n'est fourni, vide entièrement le cache.
 */
export function invalidateBannedWordsCache(guildId?: string): void {
  if (guildId) {
    cache.delete(guildId);
    cache.delete(GLOBAL_KEY); // les mots globaux font partie du résultat, on les re-fetch aussi
    return;
  }
  cache.clear();
}

// ---------------------------------------------------------------------------
// Chargement
// ---------------------------------------------------------------------------

/** Charge les mots globaux (guildId = null) depuis la BDD, avec cache. */
async function loadGlobalWords(): Promise<string[]> {
  const cached = cache.get(GLOBAL_KEY);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.words;

  try {
    const rows = await prisma.bannedWord.findMany({
      where: { guildId: null, enabled: true },
      select: { word: true },
    });
    const words = rows.map((r) => r.word.toLowerCase());
    cache.set(GLOBAL_KEY, { words, expiresAt: now + CACHE_TTL_MS });
    return words;
  } catch (err) {
    logger.error('BannedWords', 'Erreur lors du chargement des mots globaux:', err);
    return [];
  }
}

/**
 * Charge la liste fusionnée des mots bannis pour un serveur :
 * mots globaux + mots personnalisés du serveur.
 * Le résultat est mis en cache 60 secondes.
 */
export async function loadBannedWords(guildId: string): Promise<string[]> {
  const cached = cache.get(guildId);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.words;

  try {
    const [globalWords, guildRows] = await Promise.all([
      loadGlobalWords(),
      prisma.bannedWord.findMany({
        where: { guildId, enabled: true },
        select: { word: true },
      }),
    ]);

    const guildWords = guildRows.map((r) => r.word.toLowerCase());
    // Dédoublonnage global + serveur
    const merged = [...new Set([...globalWords, ...guildWords])];
    cache.set(guildId, { words: merged, expiresAt: now + CACHE_TTL_MS });
    return merged;
  } catch (err) {
    logger.error('BannedWords', `Erreur lors du chargement pour le serveur ${guildId}:`, err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Détection
// ---------------------------------------------------------------------------

/**
 * Vérifie si un texte contient au moins un mot banni.
 * La comparaison est insensible à la casse.
 *
 * @param text  Le texte à analyser (pseudo, message, etc.)
 * @param words Liste de mots bannis déjà chargée via `loadBannedWords`
 */
export function containsBannedWord(text: string, words: string[]): boolean {
  if (!text || text.trim().length === 0) return false;
  const normalized = text.toLowerCase();
  return words.some((word) => word.trim() && normalized.includes(word));
}
