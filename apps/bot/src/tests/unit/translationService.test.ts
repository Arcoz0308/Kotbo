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
});
