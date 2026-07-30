/**
 * Diff textuel ligne à ligne, façon Git.
 *
 * Utilisé par le visualiseur d'audit pour comparer le contenu d'un message
 * avant et après édition. L'algorithme repose sur la plus longue sous-séquence
 * commune : les lignes déplacées ne sont pas signalées comme modifiées, seules
 * les vraies insertions et suppressions le sont.
 */

export type DiffLineType = 'context' | 'added' | 'removed';

export interface DiffLine {
  type: DiffLineType;
  /** Numéro de ligne dans le texte d'origine, null pour une ligne ajoutée */
  beforeLine: number | null;
  /** Numéro de ligne dans le texte modifié, null pour une ligne supprimée */
  afterLine: number | null;
  content: string;
}

/**
 * Au-delà de cette taille, la comparaison exacte coûterait trop cher pour un
 * rendu de dashboard : on retombe sur un remplacement global.
 */
const MAX_LINES = 400;

function splitLines(text: string): string[] {
  if (text === '') return [];
  return text.replace(/\r\n/g, '\n').split('\n');
}

/**
 * Longueurs des plus longues sous-séquences communes, calculées de la fin vers
 * le début pour permettre un parcours avant lors de la reconstruction.
 */
function lcsLengths(before: string[], after: string[]): number[][] {
  const lengths: number[][] = Array.from(
    { length: before.length + 1 },
    () => new Array<number>(after.length + 1).fill(0),
  );

  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      lengths[i][j] = before[i] === after[j]
        ? lengths[i + 1][j + 1] + 1
        : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }

  return lengths;
}

/** Remplacement bloc à bloc, sans recherche de similarité. */
function wholesaleReplacement(before: string[], after: string[]): DiffLine[] {
  return [
    ...before.map((content, index) => ({
      type: 'removed' as const,
      beforeLine: index + 1,
      afterLine: null,
      content,
    })),
    ...after.map((content, index) => ({
      type: 'added' as const,
      beforeLine: null,
      afterLine: index + 1,
      content,
    })),
  ];
}

/**
 * Compare deux textes et retourne la suite de lignes annotées.
 * Deux textes identiques produisent uniquement des lignes de contexte.
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const beforeLines = splitLines(before ?? '');
  const afterLines = splitLines(after ?? '');

  if (beforeLines.length > MAX_LINES || afterLines.length > MAX_LINES) {
    return wholesaleReplacement(beforeLines, afterLines);
  }

  const lengths = lcsLengths(beforeLines, afterLines);
  const result: DiffLine[] = [];

  let i = 0;
  let j = 0;

  while (i < beforeLines.length && j < afterLines.length) {
    if (beforeLines[i] === afterLines[j]) {
      result.push({ type: 'context', beforeLine: i + 1, afterLine: j + 1, content: beforeLines[i] });
      i++;
      j++;
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      result.push({ type: 'removed', beforeLine: i + 1, afterLine: null, content: beforeLines[i] });
      i++;
    } else {
      result.push({ type: 'added', beforeLine: null, afterLine: j + 1, content: afterLines[j] });
      j++;
    }
  }

  while (i < beforeLines.length) {
    result.push({ type: 'removed', beforeLine: i + 1, afterLine: null, content: beforeLines[i] });
    i++;
  }

  while (j < afterLines.length) {
    result.push({ type: 'added', beforeLine: null, afterLine: j + 1, content: afterLines[j] });
    j++;
  }

  return result;
}

export interface DiffStats {
  added: number;
  removed: number;
}

export function diffStats(lines: DiffLine[]): DiffStats {
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.type === 'added') added++;
    else if (line.type === 'removed') removed++;
  }
  return { added, removed };
}

/**
 * Réorganise un diff en deux colonnes alignées pour un rendu côte à côte :
 * une suppression et l'ajout qui la suit immédiatement occupent la même rangée.
 */
export interface SideBySideRow {
  before: DiffLine | null;
  after: DiffLine | null;
}

export function toSideBySide(lines: DiffLine[]): SideBySideRow[] {
  const rows: SideBySideRow[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.type === 'context') {
      rows.push({ before: line, after: line });
      index++;
      continue;
    }

    // On regroupe le bloc de suppressions puis le bloc d'ajouts contigus
    const removed: DiffLine[] = [];
    while (index < lines.length && lines[index].type === 'removed') {
      removed.push(lines[index]);
      index++;
    }

    const added: DiffLine[] = [];
    while (index < lines.length && lines[index].type === 'added') {
      added.push(lines[index]);
      index++;
    }

    const height = Math.max(removed.length, added.length);
    for (let offset = 0; offset < height; offset++) {
      rows.push({ before: removed[offset] ?? null, after: added[offset] ?? null });
    }
  }

  return rows;
}
