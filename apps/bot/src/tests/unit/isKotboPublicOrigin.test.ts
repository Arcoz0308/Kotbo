import { describe, expect, test } from 'bun:test';
import { isKotboPublicOrigin } from '../../api/shared.js';

describe('isKotboPublicOrigin', () => {
  test('allows kotbo.fr and www', () => {
    expect(isKotboPublicOrigin('https://kotbo.fr')).toBe(true);
    expect(isKotboPublicOrigin('https://www.kotbo.fr')).toBe(true);
  });

  test('allows dash.kotbo.fr dashboard', () => {
    expect(isKotboPublicOrigin('https://dash.kotbo.fr')).toBe(true);
  });

  test('allows other kotbo.fr subdomains', () => {
    expect(isKotboPublicOrigin('https://api.kotbo.fr')).toBe(true);
    expect(isKotboPublicOrigin('https://panel.kotbo.fr')).toBe(true);
  });

  test('allows localhost dev origins', () => {
    expect(isKotboPublicOrigin('http://localhost:5173')).toBe(true);
    expect(isKotboPublicOrigin('http://127.0.0.1:3000')).toBe(true);
  });

  test('rejects unrelated origins', () => {
    expect(isKotboPublicOrigin('https://evil.com')).toBe(false);
    expect(isKotboPublicOrigin('https://notkotbo.fr')).toBe(false);
    expect(isKotboPublicOrigin('https://kotbo.fr.evil.com')).toBe(false);
  });

  test('rejects invalid URLs', () => {
    expect(isKotboPublicOrigin('not-a-url')).toBe(false);
    expect(isKotboPublicOrigin('')).toBe(false);
  });
});
