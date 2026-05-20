import { describe, expect, test } from 'bun:test';
import { parseDurationToMs } from '../../commands/transcript';

describe('commande transcript duration parser', () => {
  test('parse correctement les durées valides', () => {
    expect(parseDurationToMs('30m')).toBe(30 * 60 * 1000);
    expect(parseDurationToMs('2h')).toBe(2 * 60 * 60 * 1000);
    expect(parseDurationToMs('1j')).toBe(24 * 60 * 60 * 1000);
    expect(parseDurationToMs('7j')).toBe(7 * 24 * 60 * 60 * 1000);
    expect(parseDurationToMs(' 5  heures ')).toBe(5 * 60 * 60 * 1000);
  });

  test('retourne null pour les durées invalides', () => {
    expect(parseDurationToMs('invalide')).toBeNull();
    expect(parseDurationToMs('abc')).toBeNull();
    expect(parseDurationToMs('10xyz')).toBeNull();
  });
});
