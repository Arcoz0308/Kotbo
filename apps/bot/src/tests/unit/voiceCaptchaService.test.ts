import { describe, expect, mock, test } from 'bun:test';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const prismaMock = {
  captchaSession: {
    findFirst: mock(async () => null),
    update: mock(async () => ({})),
  },
  raidProtectionConfig: { findMany: mock(async () => []) },
};

const moduleMocks: Array<[string, () => Record<string, unknown>]> = [
  ['../../utils/db', () => ({ default: prismaMock, prisma: prismaMock, prismaRead: prismaMock })],
  ['../../utils/logger', () => ({
    logger: {
      info: mock(() => undefined),
      warn: mock(() => undefined),
      error: mock(() => undefined),
      debug: mock(() => undefined),
    },
  })],
  ['../../services/moderation/raidProtectionService', () => ({
    getRaidProtectionConfig: mock(async () => null),
  })],
];

for (const [relativePath, factory] of moduleMocks) {
  mock.module(path.resolve(import.meta.dir, `${relativePath}.ts`), factory);
  mock.module(path.resolve(import.meta.dir, `${relativePath}.js`), factory);
}

const { VOICE_ALPHABET, VOICE_CODE_LENGTH, generateVoiceCode, estimateTurnMs } = await import(
  '../../services/moderation/voiceCaptchaService.js'
);

describe('alphabet vocal', () => {
  test("n'utilise que des symboles phonétiquement distincts en français", () => {
    // B/C/D/G/P/T/V se prononcent tous "-é", M et N se confondent : les inclure
    // ferait échouer des membres humains sur une simple ambiguïté sonore.
    for (const confusable of 'BCDGPTVNEFIOWY01') {
      expect(VOICE_ALPHABET).not.toContain(confusable);
    }
  });

  test('ne contient aucun doublon', () => {
    expect(new Set(VOICE_ALPHABET).size).toBe(VOICE_ALPHABET.length);
  });

  test('reste synchronisé avec le script de génération du pack audio', () => {
    const script = readFileSync(
      path.resolve(import.meta.dir, '../../../../../scripts/generate-captcha-voice.sh'),
      'utf-8'
    );
    const declared = [...script.matchAll(/\[([A-Z0-9])\]="/g)].map((match) => match[1]);

    expect(declared.length).toBe(VOICE_ALPHABET.length);
    expect(declared.sort().join('')).toBe([...VOICE_ALPHABET].sort().join(''));
  });

  test('est un sous-ensemble de l’alphabet image, pour que le repli reste lisible', () => {
    const imageAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (const symbol of VOICE_ALPHABET) {
      expect(imageAlphabet).toContain(symbol);
    }
  });
});

describe('generateVoiceCode', () => {
  test('produit un code de la longueur attendue, dans le bon alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateVoiceCode();
      expect(code).toHaveLength(VOICE_CODE_LENGTH);
      for (const symbol of code) expect(VOICE_ALPHABET).toContain(symbol);
    }
  });

  test('ne renvoie pas deux fois la même valeur sur un petit échantillon', () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateVoiceCode()));
    expect(codes.size).toBeGreaterThan(90);
  });
});

describe('estimateTurnMs', () => {
  test("reste sous le plafond qui rendrait la file plus longue que le délai d'expiration", () => {
    // 25 membres (limite de file par défaut) doivent tenir sous 10 minutes,
    // valeur par défaut de captchaTimeoutMinutes.
    expect(estimateTurnMs() * 25).toBeLessThan(10 * 60 * 1000);
  });
});
