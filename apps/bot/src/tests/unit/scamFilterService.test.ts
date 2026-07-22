import { describe, expect, it } from 'bun:test';
import { detectScam } from '../../services/moderation/scamFilterService.js';
import type { RaidProtectionConfig } from '@prisma/client';

function makeConfig(overrides: Partial<RaidProtectionConfig> = {}): RaidProtectionConfig {
  return {
    scamFilterCustomDomains: [],
    scamFilterWhitelist: [],
    ...overrides,
  } as RaidProtectionConfig;
}

describe('detectScam', () => {
  it('détecte les lookalikes de domaine Discord', () => {
    const result = detectScam('Free nitro here https://d1scord-nitro.xyz/claim', makeConfig());
    expect(result.matched).toBe(true);
  });

  it('détecte les lookalikes steamcommunity', () => {
    const result = detectScam('trade https://steamcommunlty.ru/tradeoffer', makeConfig());
    expect(result.matched).toBe(true);
  });

  it('détecte la combinaison @everyone + appât nitro + lien', () => {
    const result = detectScam('@everyone FREE NITRO 3 months!! claim now https://example.com/gift', makeConfig());
    expect(result.matched).toBe(true);
  });

  it('ne bloque pas les domaines officiels Discord/Steam', () => {
    expect(detectScam('rejoins https://discord.gg/abc123', makeConfig()).matched).toBe(false);
    expect(detectScam('mon profil https://steamcommunity.com/id/foo', makeConfig()).matched).toBe(false);
  });

  it('ne bloque pas un message ordinaire avec lien', () => {
    const result = detectScam('regarde cette vidéo https://youtube.com/watch?v=abc', makeConfig());
    expect(result.matched).toBe(false);
  });

  it('bloque les domaines personnalisés (et leurs sous-domaines)', () => {
    const config = makeConfig({ scamFilterCustomDomains: ['evil.com'] });
    expect(detectScam('clique https://evil.com/x', config).matched).toBe(true);
    expect(detectScam('clique https://sub.evil.com/x', config).matched).toBe(true);
  });

  it('respecte la whitelist', () => {
    const config = makeConfig({ scamFilterWhitelist: ['d1scord-nitro.xyz'] });
    expect(detectScam('https://d1scord-nitro.xyz/legit', config).matched).toBe(false);
  });
});
