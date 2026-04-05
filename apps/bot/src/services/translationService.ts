import { LRUCache } from 'lru-cache';
import { logger } from '../utils/logger.js';

type TranslatorFn = (text: string, targetLang: string, sourceLang?: string) => Promise<string | null>;

type TranslationProvider = {
  name: string;
  translate: TranslatorFn;
  healthcheck: () => Promise<boolean>;
};

type TranslationServiceDeps = {
  translator: TranslatorFn;
  log: typeof logger;
  providerName: string;
};

type TranslationService = {
  translate: (text: string, targetLang: string, sourceLang?: string) => Promise<string | null>;
  isTranslationAvailable: () => boolean;
  clearCacheForTests: () => void;
};

function createCache() {
  return new LRUCache<string, string>({
    max: 1000,
    ttl: 1000 * 60 * 60,
  });
}

function withTimeout(signalTimeoutMs: number): AbortSignal {
  return AbortSignal.timeout(signalTimeoutMs);
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function normalizeLangCode(lang: string | undefined, mode: 'source' | 'target'): string {
  if (!lang || !lang.trim()) {
    return mode === 'source' ? 'auto' : 'fr';
  }

  const normalized = lang.trim();

  if (/^[a-z]{2}$/i.test(normalized)) {
    return normalized.toLowerCase();
  }

  if (/^[a-z]{2}-[a-z]{2}$/i.test(normalized)) {
    const [base, region] = normalized.split('-');
    return `${base.toLowerCase()}-${region.toLowerCase()}`;
  }

  return mode === 'source' ? 'auto' : 'fr';
}

function splitIntoChunks(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (sentences.length === 0) return [text.slice(0, maxLen)];

  let current = '';
  for (const sentence of sentences) {
    if (!current) {
      current = sentence;
      continue;
    }

    if ((current.length + 1 + sentence.length) <= maxLen) {
      current = `${current} ${sentence}`;
      continue;
    }

    chunks.push(current);

    if (sentence.length <= maxLen) {
      current = sentence;
      continue;
    }

    for (let start = 0; start < sentence.length; start += maxLen) {
      chunks.push(sentence.slice(start, start + maxLen));
    }
    current = '';
  }

  if (current) chunks.push(current);
  return chunks;
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/$/, '');
}

function buildLibreTranslateBaseUrls(): string[] {
  const envUrl = process.env.LIBRETRANSLATE_URL?.trim();
  const candidates = [
    envUrl,
    'http://localhost:5000',
    'http://127.0.0.1:5000',
    'http://libretranslate:5000',
  ].filter((v): v is string => Boolean(v && v.trim()));

  return Array.from(new Set(candidates.map(normalizeBaseUrl)));
}

function createLibreTranslateProvider(): TranslationProvider {
  const baseUrls = buildLibreTranslateBaseUrls();
  const apiKey = process.env.LIBRETRANSLATE_API_KEY?.trim();
  const timeoutMsRaw = Number(process.env.TRANSLATION_TIMEOUT_MS ?? '7000');
  const timeoutMs = Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0 ? timeoutMsRaw : 7000;
  let preferredBaseUrl = baseUrls[0] ?? 'http://localhost:5000';

  async function translateChunk(baseUrl: string, chunk: string, targetLang: string, sourceLang?: string): Promise<string | null> {
    const source = normalizeLangCode(sourceLang, 'source');
    const target = normalizeLangCode(targetLang, 'target');

    const response = await fetch(`${baseUrl}/translate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        q: chunk,
        source,
        target,
        format: 'text',
        api_key: apiKey || undefined,
      }),
      signal: withTimeout(timeoutMs),
    });

    const rawBody = await response.text();

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${rawBody.slice(0, 120)}`);
    }

    if (!rawBody.trim()) {
      return null;
    }

    if (rawBody.trimStart().startsWith('<')) {
      throw new Error('Reponse non JSON (HTML)');
    }

    let payload: { translatedText?: string; error?: string };
    try {
      payload = JSON.parse(rawBody) as { translatedText?: string; error?: string };
    } catch {
      throw new Error('Failed to parse JSON');
    }

    if (payload.error) {
      throw new Error(payload.error);
    }

    const translatedText = payload.translatedText?.trim();
    return translatedText && translatedText.length > 0 ? translatedText : null;
  }

  function getOrderedBaseUrls(): string[] {
    return [preferredBaseUrl, ...baseUrls.filter((url) => url !== preferredBaseUrl)];
  }

  return {
    name: 'LibreTranslate',
    async translate(text: string, targetLang: string, sourceLang?: string): Promise<string | null> {
      const chunks = splitIntoChunks(text, 1800);
      const translatedChunks: string[] = [];

      for (const chunk of chunks) {
        let translated: string | null = null;
        let lastError: unknown = null;

        for (const baseUrl of getOrderedBaseUrls()) {
          try {
            translated = await translateChunk(baseUrl, chunk, targetLang, sourceLang);
            preferredBaseUrl = baseUrl;
            break;
          } catch (error) {
            lastError = error;
          }
        }

        if (translated === null && lastError) {
          throw new Error(
            `Unable to connect. Is the computer able to access the url? Tried: ${getOrderedBaseUrls().join(', ')}. Derniere erreur: ${getErrorMessage(lastError)}`,
          );
        }

        if (!translated) return null;
        translatedChunks.push(translated);
      }

      return translatedChunks.join(' ').trim() || null;
    },
    async healthcheck(): Promise<boolean> {
      for (const baseUrl of getOrderedBaseUrls()) {
        try {
          const response = await fetch(`${baseUrl}/languages`, {
            headers: { Accept: 'application/json' },
            signal: withTimeout(5000),
          });
          if (!response.ok) continue;

          const rawBody = await response.text();
          if (!rawBody.trim() || rawBody.trimStart().startsWith('<')) continue;

          const payload = JSON.parse(rawBody) as unknown;
          if (Array.isArray(payload)) {
            preferredBaseUrl = baseUrl;
            return true;
          }
        } catch {
          continue;
        }
      }

      return false;
    },
  };
}

export function createTranslationService(deps: TranslationServiceDeps): TranslationService {
  const cache = createCache();

  return {
    async translate(text: string, targetLang: string, sourceLang?: string): Promise<string | null> {
      const to = normalizeLangCode(targetLang, 'target');
      const from = normalizeLangCode(sourceLang, 'source');
      const cacheKey = `${from}:${to}:${text}`;

      const cached = cache.get(cacheKey);
      if (cached) {
        deps.log.debug('Translation', 'Cache hit for translation');
        return cached;
      }

      try {
        const result = await deps.translator(text, to, from);
        if (result) cache.set(cacheKey, result);
        return result;
      } catch (err) {
        deps.log.error('Translation', `Erreur ${deps.providerName}:`, getErrorMessage(err));
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

const localProvider = createLibreTranslateProvider();

const translationService = createTranslationService({
  translator: localProvider.translate,
  log: logger,
  providerName: localProvider.name,
});

export async function checkTranslationProviderHealth(): Promise<boolean> {
  const healthy = await localProvider.healthcheck();
  const configuredUrl = process.env.LIBRETRANSLATE_URL?.trim() || '(non défini)';
  if (healthy) {
    logger.success('Translation', `LibreTranslate local est pret (healthcheck OK). URL configuree: ${configuredUrl}`);
  } else {
    logger.warn('Translation', `LibreTranslate local indisponible ou reponse invalide (healthcheck KO). URL configuree: ${configuredUrl}`);
  }
  return healthy;
}

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
