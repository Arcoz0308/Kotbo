import { describe, expect, test } from 'bun:test';
import { parseDurationToMs, parseDateTimeOrDuration } from '../../commands/moderation/transcript';

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

describe('commande transcript datetime and duration parser', () => {
  test('parse correctement les durées relatives', () => {
    const parsed = parseDateTimeOrDuration('2h');
    expect(parsed).not.toBeNull();
    // Allow up to 10s difference due to execution time
    const diff = Math.abs((Date.now() - 2 * 60 * 60 * 1000) - (parsed || 0));
    expect(diff).toBeLessThan(10000);
  });

  test('parse correctement les timestamps unix en secondes et millisecondes', () => {
    // 1716307200 -> Wed May 21 2026 16:00:00 (approx)
    expect(parseDateTimeOrDuration('1716307200')).toBe(1716307200 * 1000);
    expect(parseDateTimeOrDuration('1716307200000')).toBe(1716307200000);
  });

  test('parse correctement le format de date français DD/MM/YYYY-HH:MM', () => {
    const parsed = parseDateTimeOrDuration('21/05/2026-16:30');
    expect(parsed).not.toBeNull();
    const date = new Date(parsed || 0);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(4); // May (0-indexed)
    expect(date.getDate()).toBe(21);
    expect(date.getHours()).toBe(16);
    expect(date.getMinutes()).toBe(30);
  });

  test('parse correctement le format de date français simple DD/MM/YYYY', () => {
    const parsed = parseDateTimeOrDuration('21/05/2026');
    expect(parsed).not.toBeNull();
    const date = new Date(parsed || 0);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(4);
    expect(date.getDate()).toBe(21);
    expect(date.getHours()).toBe(0);
    expect(date.getMinutes()).toBe(0);
  });

  test('parse correctement le format ISO ou standard JS date', () => {
    const parsed = parseDateTimeOrDuration('2026-05-21T16:30:00Z');
    expect(parsed).toBe(Date.parse('2026-05-21T16:30:00Z'));
  });

  test('retourne null pour les entrées invalides', () => {
    expect(parseDateTimeOrDuration('invalide')).toBeNull();
    expect(parseDateTimeOrDuration('21/05/2026-abc')).toBeNull();
    expect(parseDateTimeOrDuration('')).toBeNull();
  });
});

