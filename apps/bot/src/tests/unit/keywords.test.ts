import { describe, expect, test } from 'bun:test';
import { extractKeywords } from '../../utils/keywords';

describe('extractKeywords', () => {
  test('filtre les stop words, retire les URLs et limite a 8 mots', () => {
    const result = extractKeywords(
      'Le guide complet TypeScript et Node.js pour les développeurs modernes',
      'Ce guide explique https://example.com comment optimiser architecture, performances, tests unitaires et qualité logicielle dans un projet Bun.',
    );

    expect(result.length).toBeLessThanOrEqual(8);
    expect(result).toContain('typescript');
    expect(result).toContain('architecture');
    expect(result.join(' ')).not.toContain('https');
    expect(result).not.toContain('le');
  });

  test('retourne des mots uniques tries par longueur', () => {
    const result = extractKeywords('Node Node Node JavaScript JavaScript architecture');
    expect(result[0]).toBe('architecture');
    expect(new Set(result).size).toBe(result.length);
  });
});
