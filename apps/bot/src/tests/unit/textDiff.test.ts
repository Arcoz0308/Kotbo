import { describe, expect, test } from 'bun:test';

// Le moteur de diff ligne à ligne est rendu par le dashboard mais testé ici :
// il vit dans @kotbo/shared, le package de logique pure sans dépendance que les
// deux applications se partagent.
import { diffLines, diffStats, toSideBySide } from '@kotbo/shared';

describe('diffLines', () => {
  test('ne produit que du contexte pour deux textes identiques', () => {
    const lines = diffLines('bonjour\nmonde', 'bonjour\nmonde');
    expect(lines.every((line) => line.type === 'context')).toBe(true);
    expect(lines).toHaveLength(2);
  });

  test('détecte une ligne ajoutée à la fin', () => {
    const lines = diffLines('a', 'a\nb');
    expect(lines.map((l) => l.type)).toEqual(['context', 'added']);
    expect(lines[1].content).toBe('b');
    expect(lines[1].beforeLine).toBeNull();
    expect(lines[1].afterLine).toBe(2);
  });

  test('détecte une ligne supprimée', () => {
    const lines = diffLines('a\nb', 'a');
    expect(lines.map((l) => l.type)).toEqual(['context', 'removed']);
    expect(lines[1].afterLine).toBeNull();
  });

  test('représente une ligne modifiée comme une suppression suivie d\'un ajout', () => {
    const lines = diffLines('bonjour', 'bonsoir');
    expect(lines.map((l) => l.type)).toEqual(['removed', 'added']);
  });

  test('conserve les lignes communes autour d\'une modification', () => {
    const lines = diffLines('debut\nmilieu\nfin', 'debut\nautre\nfin');
    expect(lines[0].type).toBe('context');
    expect(lines[lines.length - 1].type).toBe('context');
    expect(lines.some((l) => l.type === 'removed' && l.content === 'milieu')).toBe(true);
    expect(lines.some((l) => l.type === 'added' && l.content === 'autre')).toBe(true);
  });

  test('ne signale pas comme modifiée une ligne seulement déplacée', () => {
    // « commun » existe des deux côtés : il doit rester du contexte
    const lines = diffLines('commun\nsupprime', 'commun\najoute');
    const contextLines = lines.filter((l) => l.type === 'context');
    expect(contextLines).toHaveLength(1);
    expect(contextLines[0].content).toBe('commun');
  });

  test('gère un texte vide en entrée', () => {
    expect(diffLines('', '')).toEqual([]);
    expect(diffLines('', 'nouveau').map((l) => l.type)).toEqual(['added']);
    expect(diffLines('ancien', '').map((l) => l.type)).toEqual(['removed']);
  });

  test('normalise les fins de ligne Windows', () => {
    const lines = diffLines('a\r\nb', 'a\nb');
    expect(lines.every((line) => line.type === 'context')).toBe(true);
  });

  test('numérote correctement les lignes de chaque côté', () => {
    const lines = diffLines('a\nb\nc', 'a\nX\nc');
    const removed = lines.find((l) => l.type === 'removed');
    const added = lines.find((l) => l.type === 'added');
    expect(removed?.beforeLine).toBe(2);
    expect(added?.afterLine).toBe(2);
  });

  test('bascule en remplacement global au-delà de la limite de lignes', () => {
    const big = Array.from({ length: 401 }, (_, i) => `ligne ${i}`).join('\n');
    const lines = diffLines(big, 'court');
    // Aucun contexte : toutes les lignes d'origine sont supprimées, la nouvelle ajoutée
    expect(lines.some((l) => l.type === 'context')).toBe(false);
    expect(lines.filter((l) => l.type === 'removed')).toHaveLength(401);
    expect(lines.filter((l) => l.type === 'added')).toHaveLength(1);
  });
});

describe('diffStats', () => {
  test('compte séparément ajouts et suppressions', () => {
    const stats = diffStats(diffLines('a\nb', 'a\nc\nd'));
    expect(stats.removed).toBe(1);
    expect(stats.added).toBe(2);
  });

  test('retourne zéro pour deux textes identiques', () => {
    expect(diffStats(diffLines('a', 'a'))).toEqual({ added: 0, removed: 0 });
  });
});

describe('toSideBySide', () => {
  test('aligne une suppression et l\'ajout correspondant sur la même rangée', () => {
    const rows = toSideBySide(diffLines('bonjour', 'bonsoir'));
    expect(rows).toHaveLength(1);
    expect(rows[0].before?.content).toBe('bonjour');
    expect(rows[0].after?.content).toBe('bonsoir');
  });

  test('répète la ligne de contexte des deux côtés', () => {
    const rows = toSideBySide(diffLines('a', 'a'));
    expect(rows[0].before).toBe(rows[0].after);
  });

  test('laisse la colonne de gauche vide pour un ajout pur', () => {
    const rows = toSideBySide(diffLines('a', 'a\nb'));
    const addedRow = rows.find((row) => row.after?.type === 'added');
    expect(addedRow?.before).toBeNull();
  });

  test('laisse la colonne de droite vide pour une suppression pure', () => {
    const rows = toSideBySide(diffLines('a\nb', 'a'));
    const removedRow = rows.find((row) => row.before?.type === 'removed');
    expect(removedRow?.after).toBeNull();
  });

  test('aligne des blocs de tailles différentes sans perdre de ligne', () => {
    const rows = toSideBySide(diffLines('x\ny', 'p\nq\nr'));
    expect(rows).toHaveLength(3);
    expect(rows[2].before).toBeNull();
    expect(rows[2].after?.content).toBe('r');
  });
});
