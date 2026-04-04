import { translate as googleTranslate } from '@vitalets/google-translate-api';
import { LRUCache } from 'lru-cache';
import { logger } from '../utils/logger.js';

type TranslatorFn = typeof googleTranslate;

type TranslationServiceDeps = {
  translator: TranslatorFn;
  log: typeof logger;
};

type TranslationService = {
  translate: (text: string, targetLang: string, sourceLang?: string) => Promise<string | null>;
  isTranslationAvailable: () => boolean;
  clearCacheForTests: () => void;
};

function createCache() {
  return new LRUCache<string, string>({
    max: 1000,
    ttl: 1000 * 60 * 60, // 1 heure de cache
  });
}

export function createTranslationService(deps: TranslationServiceDeps): TranslationService {
  const cache = createCache();

  return {
    async translate(text: string, targetLang: string, sourceLang?: string): Promise<string | null> {
      const to = targetLang.toLowerCase();
      const from = sourceLang?.toLowerCase();
      const cacheKey = `${from ?? 'auto'}:${to}:${text}`;

      const cached = cache.get(cacheKey);
      if (cached) {
        deps.log.debug('Translation', 'Cache hit for translation');
        return cached;
      }

      try {
        const result = await deps.translator(text, {
          to,
          from,
        });
        if (result.text) {
          cache.set(cacheKey, result.text);
        }
        return result.text ?? null;
      } catch (err) {
        deps.log.error('Translation', 'Google Translate error:', err);
        return null;
      }
    },

    isTranslationAvailable(): boolean {
      return true;
    },

    clearCacheForTests(): void {
      cache.clear();
    },
  };
}

const translationService = createTranslationService({
  translator: googleTranslate,
  log: logger,
});

export async function translate(
  text: string,
  targetLang: string,
  sourceLang?: string,
): Promise<string | null> {
  return translationService.translate(text, targetLang, sourceLang);
}

export function isTranslationAvailable(): boolean {
  return translationService.isTranslationAvailable();
}

export function clearTranslationCacheForTests(): void {
  translationService.clearCacheForTests();
}
