/**
 * Extrait les mots-clés pertinents d'un titre et d'une description d'article.
 * Filtre les mots vides français/anglais, la ponctuation et les mots courts.
 * Retourne des mots-clés uniques, en minuscules, max 8.
 */

const STOP_WORDS = new Set([
  // Français
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'en', 'et', 'ou', 'à',
  'au', 'aux', 'ce', 'se', 'sa', 'son', 'ses', 'mon', 'ma', 'mes', 'ton',
  'ta', 'tes', 'nous', 'vous', 'ils', 'elles', 'je', 'tu', 'il', 'elle',
  'que', 'qui', 'quoi', 'dont', 'où', 'sur', 'sous', 'dans', 'par', 'pour',
  'avec', 'sans', 'entre', 'vers', 'chez', 'si', 'ne', 'pas', 'plus', 'très',
  'mais', 'car', 'donc', 'or', 'ni', 'est', 'sont', 'était', 'été', 'être',
  'avoir', 'faire', 'cette', 'cet', 'ces', 'leur', 'leurs', 'tout', 'tous',
  'toute', 'toutes', 'même', 'comme', 'aussi', 'alors', 'après', 'avant',
  'bien', 'déjà', 'encore', 'lors', 'selon', 'via', 'dès',

  // Anglais
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'on', 'at',
  'by', 'for', 'with', 'about', 'as', 'from', 'into', 'through', 'this',
  'that', 'these', 'those', 'it', 'its', 'we', 'our', 'you', 'your',
  'he', 'she', 'they', 'their', 'his', 'her', 'and', 'or', 'but', 'not',
  'so', 'yet', 'nor', 'if', 'then', 'than', 'when', 'how', 'all', 'any',
  'both', 'each', 'more', 'most', 'other', 'some', 'such', 'up', 'out',
  'no', 'only', 'same', 'just', 'new',
]);

export function extractKeywords(title: string, description?: string | null): string[] {
  const raw = `${title} ${description ?? ''}`;

  const words = raw
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[^a-z0-9\u00C0-\u024F\s-]/gi, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^-+|-+$/g, ''))
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const w of words) {
    if (!seen.has(w)) {
      seen.add(w);
      unique.push(w);
    }
  }

  return unique
    .sort((a, b) => b.length - a.length)
    .slice(0, 8);
}
