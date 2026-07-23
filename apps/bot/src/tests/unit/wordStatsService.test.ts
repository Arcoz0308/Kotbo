import { describe, expect, mock, test } from 'bun:test';
import path from 'node:path';

const moduleMocks: Array<[string, () => Record<string, unknown>]> = [
  ['../../utils/db', () => ({ default: {}, prisma: {}, prismaRead: {} })],
  ['../../utils/logger', () => ({
    logger: {
      info: mock(() => undefined),
      warn: mock(() => undefined),
      error: mock(() => undefined),
      debug: mock(() => undefined),
    },
  })],
];

for (const [relativePath, factory] of moduleMocks) {
  mock.module(path.resolve(import.meta.dir, `${relativePath}.ts`), factory);
  mock.module(path.resolve(import.meta.dir, `${relativePath}.js`), factory);
}

const { tokenize } = await import('../../services/analytics/wordStatsService.js');

describe('tokenize', () => {
  test('garde les mots significatifs et ignore les mots-outils', () => {
    expect(tokenize('les serveurs discord sont vraiment pratiques')).toEqual([
      'serveurs', 'discord', 'vraiment', 'pratiques',
    ]);
  });

  test('ignore les mots trop courts et les nombres purs', () => {
    expect(tokenize('a bc 42 1000 python')).toEqual(['python']);
  });

  test('retire les URLs, mentions, salons et emojis custom', () => {
    const result = tokenize('regarde https://example.com/page <@123456789> dans <#987654321> avec <:kotbo:111>');
    expect(result).toEqual(['regarde']);
    expect(result.join(' ')).not.toContain('example');
    expect(result.join(' ')).not.toContain('kotbo');
  });

  test('retire les blocs de code et le code inline', () => {
    const result = tokenize('voici ```const secret = "motdepasse"``` et `inline_token` fini');
    expect(result).toEqual(['voici', 'fini']);
  });

  test('retire les timestamps Discord', () => {
    // "vous" est un mot-outil filtré, d'où sa disparition de "rendez-vous"
    expect(tokenize('rendez-vous <t:1234567890:F> demain')).toEqual(['rendez', 'demain']);
  });

  test('normalise la casse et gère les accents', () => {
    expect(tokenize('MODÉRATION Modération modération')).toEqual([
      'modération', 'modération', 'modération',
    ]);
  });

  test('ignore l’argot Discord courant', () => {
    expect(tokenize('mdr ptdr lol jsp javascript')).toEqual(['javascript']);
  });

  test('borne la longueur des mots', () => {
    const tooLong = 'a'.repeat(25);
    expect(tokenize(`${tooLong} typescript`)).toEqual(['typescript']);
  });

  test('retourne un tableau vide pour un message sans contenu utile', () => {
    expect(tokenize('les et de')).toEqual([]);
    expect(tokenize('')).toEqual([]);
  });

  test('conserve les apostrophes internes mais coupe aux bords', () => {
    // "aujourd'hui" reste un mot, les quotes encadrantes disparaissent
    expect(tokenize("'aujourd'hui' arrive")).toEqual(["aujourd'hui", 'arrive']);
  });
});
