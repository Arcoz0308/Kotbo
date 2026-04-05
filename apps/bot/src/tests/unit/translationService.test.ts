import { describe, expect, test } from 'bun:test';
import { createTranslationService } from '../../services/translationService';

describe('translationService', () => {
  test('met en cache une traduction pour eviter les appels repetes', async () => {
    let callCount = 0;
    type TranslationDeps = Parameters<typeof createTranslationService>[0];

    const translator: TranslationDeps['translator'] = async (
      text: Parameters<TranslationDeps['translator']>[0],
      options: Parameters<TranslationDeps['translator']>[1],
    ) => {
      void text;
      void options;
      callCount += 1;
      return {
        text: 'bonjour',
        raw: {
          sentences: [],
          src: 'hello',
          confidence: 1,
          ld_result: {
            srclangs: ['en'],
            srclangs_confidences: [1],
            extended_srclangs: ['en'],
          },
        },
      };
    };

    const log = {
      info: () => {},
      success: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    } satisfies TranslationDeps['log'];

    const service = createTranslationService({
      translator,
      log,
    });

    const first = await service.translate('hello', 'FR', 'EN');
    const second = await service.translate('hello', 'FR', 'EN');

    expect(first).toBe('bonjour');
    expect(second).toBe('bonjour');
    expect(callCount).toBe(1);
  });

  test('retourne null en cas d\'erreur traducteur', async () => {
    type TranslationDeps = Parameters<typeof createTranslationService>[0];

    const translator: TranslationDeps['translator'] = async () => {
      throw new Error('boom');
    };

    const log = {
      info: () => {},
      success: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    } satisfies TranslationDeps['log'];

    const service = createTranslationService({
      translator,
      log,
    });

    const result = await service.translate('hello', 'FR');
    expect(result).toBeNull();
  });

  test('utilise un fallback quand Google echoue', async () => {
    type TranslationDeps = Parameters<typeof createTranslationService>[0];

    const translator: TranslationDeps['translator'] = async () => {
      throw new Error('too many requests');
    };

    let fallbackCalls = 0;
    const service = createTranslationService({
      translator,
      log: {
        info: () => {},
        success: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      fallbackTranslators: [
        {
          name: 'FallbackTest',
          translate: async () => {
            fallbackCalls += 1;
            return 'salut';
          },
        },
      ],
    });

    const result = await service.translate('hello', 'FR', 'EN');

    expect(result).toBe('salut');
    expect(fallbackCalls).toBe(1);
  });

  test('retourne null si tous les fallbacks echouent', async () => {
    type TranslationDeps = Parameters<typeof createTranslationService>[0];

    const translator: TranslationDeps['translator'] = async () => {
      throw new Error('primary down');
    };

    const service = createTranslationService({
      translator,
      log: {
        info: () => {},
        success: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      fallbackTranslators: [
        {
          name: 'FallbackKo',
          translate: async () => {
            throw new Error('fallback down');
          },
        },
      ],
    });

    const result = await service.translate('hello', 'FR');
    expect(result).toBeNull();
  });

  test('n\'utilise pas les fallbacks si l\'erreur Google n\'est pas un quota', async () => {
    type TranslationDeps = Parameters<typeof createTranslationService>[0];

    const translator: TranslationDeps['translator'] = async () => {
      throw new Error('socket timeout');
    };

    let fallbackCalls = 0;
    const service = createTranslationService({
      translator,
      log: {
        info: () => {},
        success: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      fallbackTranslators: [
        {
          name: 'FallbackDoitPasEtreAppele',
          translate: async () => {
            fallbackCalls += 1;
            return 'salut';
          },
        },
      ],
    });

    const result = await service.translate('hello', 'FR');
    expect(result).toBeNull();
    expect(fallbackCalls).toBe(0);
  });

  test('active un cooldown Google apres quota et passe directement en fallback', async () => {
    type TranslationDeps = Parameters<typeof createTranslationService>[0];

    let now = 1_000;
    let googleCalls = 0;
    let fallbackCalls = 0;

    const translator: TranslationDeps['translator'] = async () => {
      googleCalls += 1;
      throw new Error('TooManyRequestsError: Too Many Requests');
    };

    const service = createTranslationService({
      translator,
      log: {
        info: () => {},
        success: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      now: () => now,
      googleQuotaCooldownMs: 60_000,
      fallbackTranslators: [
        {
          name: 'FallbackCooldown',
          translate: async () => {
            fallbackCalls += 1;
            return 'fallback-ok';
          },
        },
      ],
    });

    const first = await service.translate('hello', 'FR');
    now += 10_000;
    const second = await service.translate('world', 'FR');

    expect(first).toBe('fallback-ok');
    expect(second).toBe('fallback-ok');
    expect(googleCalls).toBe(1);
    expect(fallbackCalls).toBe(2);
  });
});
