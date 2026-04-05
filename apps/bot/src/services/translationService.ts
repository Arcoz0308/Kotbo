import { translate as googleTranslate } from '@vitalets/google-translate-api';
import { LRUCache } from 'lru-cache';
import { logger } from '../utils/logger.js';

type TranslatorFn = typeof googleTranslate;
type FallbackTranslatorFn = (text: string, targetLang: string, sourceLang?: string) => Promise<string | null>;

type FallbackTranslator = {
  name: string;
  translate: FallbackTranslatorFn;
};

type TranslationServiceDeps = {
  translator: TranslatorFn;
  log: typeof logger;
  fallbackTranslators?: FallbackTranslator[];
  now?: () => number;
  googleQuotaCooldownMs?: number;
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

function withTimeout(signalTimeoutMs: number): AbortSignal {
  return AbortSignal.timeout(signalTimeoutMs);
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

function isGoogleQuotaError(err: unknown): boolean {
  const msg = getErrorMessage(err).toLowerCase();
  return msg.includes('toomanyrequests') || msg.includes('too many requests') || msg.includes('http 429') || msg.includes('429');
}

function createMyMemoryFallback(): FallbackTranslator {
  return {
    name: 'MyMemory',
    async translate(text: string, targetLang: string, sourceLang?: string): Promise<string | null> {
      const from = sourceLang?.toLowerCase() ?? 'auto';
      const to = targetLang.toLowerCase();
      const url = new URL('https://api.mymemory.translated.net/get');
      url.searchParams.set('q', text);
      url.searchParams.set('langpair', `${from}|${to}`);

      const response = await fetch(url, {
        signal: withTimeout(5000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = (await response.json()) as {
        responseData?: {
          translatedText?: string;
        };
      };

      const translatedText = payload.responseData?.translatedText?.trim();
      return translatedText && translatedText.length > 0 ? translatedText : null;
    },
  };
}

function createLibreTranslateFallback(): FallbackTranslator | null {
  const libreTranslateUrl = process.env.LIBRETRANSLATE_URL?.trim() || 'https://libretranslate.de';

  const apiKey = process.env.LIBRETRANSLATE_API_KEY?.trim();

  return {
    name: 'LibreTranslate',
    async translate(text: string, targetLang: string, sourceLang?: string): Promise<string | null> {
      const from = sourceLang?.toLowerCase() ?? 'auto';
      const to = targetLang.toLowerCase();

      const response = await fetch(`${libreTranslateUrl.replace(/\/$/, '')}/translate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: text,
          source: from,
          target: to,
          format: 'text',
          api_key: apiKey || undefined,
        }),
        signal: withTimeout(5000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = (await response.json()) as {
        translatedText?: string;
      };

      const translatedText = payload.translatedText?.trim();
      return translatedText && translatedText.length > 0 ? translatedText : null;
    },
  };
}

function createDefaultFallbackTranslators(): FallbackTranslator[] {
  const providers: FallbackTranslator[] = [];
  const libreTranslate = createLibreTranslateFallback();

  if (libreTranslate) {
    providers.push(libreTranslate);
  }

  providers.push(createMyMemoryFallback());
  return providers;
}

function parseGoogleQuotaCooldownMs(raw: string | undefined): number {
  const fallbackMs = 10 * 60 * 1000;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallbackMs;
  }
  return parsed;
}

export function createTranslationService(deps: TranslationServiceDeps): TranslationService {
  const cache = createCache();
  const fallbackTranslators = deps.fallbackTranslators ?? [];
  const now = deps.now ?? Date.now;
  const googleQuotaCooldownMs = deps.googleQuotaCooldownMs ?? parseGoogleQuotaCooldownMs(process.env.GOOGLE_TRANSLATE_QUOTA_COOLDOWN_MS);
  let googleQuotaCooldownUntil = 0;

  async function translateWithFallback(text: string, to: string, from: string | undefined, cacheKey: string): Promise<string | null> {
    for (const fallback of fallbackTranslators) {
      try {
        const fallbackResult = await fallback.translate(text, to, from);
        if (fallbackResult) {
          cache.set(cacheKey, fallbackResult);
          deps.log.warn('Translation', `Fallback utilise: ${fallback.name}`);
          return fallbackResult;
        }
      } catch (fallbackError) {
        deps.log.error(
          'Translation',
          `Erreur fallback ${fallback.name}:`,
          getErrorMessage(fallbackError),
        );
      }
    }

    return null;
  }

  return {
    async translate(text: string, targetLang: string, sourceLang?: string): Promise<string | null> {
      const currentTime = now();
      const to = targetLang.toLowerCase();
      const from = sourceLang?.toLowerCase();
      const cacheKey = `${from ?? 'auto'}:${to}:${text}`;

      const cached = cache.get(cacheKey);
      if (cached) {
        deps.log.debug('Translation', 'Cache hit for translation');
        return cached;
      }

      if (currentTime < googleQuotaCooldownUntil) {
        deps.log.warn('Translation', 'Google en cooldown quota, utilisation directe des fallback APIs.');
        return translateWithFallback(text, to, from, cacheKey);
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
        if (!isGoogleQuotaError(err)) {
          return null;
        }
        googleQuotaCooldownUntil = currentTime + googleQuotaCooldownMs;
        deps.log.warn('Translation', 'Quota Google atteint, bascule vers les fallback APIs.');
      }

      return translateWithFallback(text, to, from, cacheKey);
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
  fallbackTranslators: createDefaultFallbackTranslators(),
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
