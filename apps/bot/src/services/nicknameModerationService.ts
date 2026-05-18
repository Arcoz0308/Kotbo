/**
 * Service de modération automatique des pseudos Discord.
 * Détecte les pseudos problématiques (racisme, menaces, insultes, caractères invisibles)
 * et fournit un pseudo de remplacement neutre.
 */

// Pseudo de remplacement affiché aux modérateurs et dans les logs
export const SAFE_NICKNAME = 'pseudo non conforme | automod';

/**
 * Liste de base de mots/fragments interdits.
 * Cette liste est complétée par les mots personnalisés définis par chaque serveur.
 * Les termes sont en minuscules ; la comparaison est insensible à la casse.
 */
const BASE_BANNED_WORDS: string[] = [
  // Racisme / haine ethnique (FR)
  'nègre', 'négro', 'neger', 'niggr', 'nigger', 'nigga',
  'youpin', 'youpine', 'feuj', 'juif de merde', 'sale juif',
  'arabe de merde', 'sale arabe', 'bougnoule', 'bicot', 'crouille',
  'chinetoque', 'jap', 'asiatic', 'ritale', 'polak',
  'raton', 'bamboula', 'nègresse', 'noiraud',
  'renoi', 'kebla', 'reubeu', 'gitan de merde', 'romanichel',
  // Menaces
  'je vais te tuer', 'je vais te crever', 'je vais te défoncer',
  'death threat', 'kill yourself', 'kys', 'go die',
  // Insultes graves
  'pédophile', 'pedo', 'nazi', 'führer', 'hitler', 'heil',
  'génocide', 'extermination', 'zyklon',
  // LGBTQ+ phobic
  'pédé', 'pede', 'tapette', 'gouine', 'fiotte', 'travelo',
  'transphobe', 'homophobe',
  // Termes sexuels explicites souvent utilisés comme pseudos provocateurs
  'bite', 'queue', 'pénis', 'vagin', 'chatte', 'couilles',
  'enculé', 'encule', 'baise-moi', 'suce moi', 'lèche moi',
  // EN — insultes courantes
  'fuck you', 'motherfucker', 'cunt', 'faggot', 'retard',
  'whore', 'slut', 'bitch ass',
];

/**
 * Regex
 */
const INVISIBLE_ONLY_REGEX = /^[\s\u200B\u200C\u200D\u00AD\uFEFF\u2060\u180E\u00A0\u2000-\u200A\u202F\u205F\u3000]+$/;

/**
 * Vérifie si un pseudo est problématique.
 *
 * @param name        Le pseudo brut (nickname ou username) à analyser.
 * @param customWords Liste de mots/fragments supplémentaires définis par le serveur.
 * @returns `true` si le pseudo doit être remplacé, `false` sinon.
 */
export function isNicknameProblematic(name: string, customWords: string[] = []): boolean {
  if (!name || name.trim().length === 0) return true;

  // Pseudos entièrement composés de caractères invisibles
  if (INVISIBLE_ONLY_REGEX.test(name)) return true;

  const normalized = name.toLowerCase();
  const allBanned = [...BASE_BANNED_WORDS, ...customWords.map((w) => w.toLowerCase())];

  return allBanned.some((word) => {
    if (!word.trim()) return false;
    // Vérification basique : le fragment est contenu dans le pseudo normalisé
    return normalized.includes(word);
  });
}

/**
 * Retourne une raison lisible pour le log du renommage automatique.
 */
export function buildRenameReason(originalName: string): string {
  return `Automod: pseudo non conforme détecté — original: "${originalName}"`;
}
