import { describe, expect, test } from 'bun:test';
import { detectLanguage, getLangName } from '../../utils/language';

describe('language utils', () => {
  test('retourne null quand le texte est trop court', () => {
    expect(detectLanguage('Bonjour')).toBeNull();
  });

  test('detecte une langue supportee sur un texte long', () => {
    const text = 'This is a long english text used to validate language detection with enough words and context to avoid ambiguous detection.';
    expect(detectLanguage(text)).toBe('EN');
  });

  test('mappe les noms de langue lisibles', () => {
    expect(getLangName('fr')).toBe('Français');
    expect(getLangName('EN')).toBe('Anglais');
    expect(getLangName('xx')).toBe('xx');
  });
});
