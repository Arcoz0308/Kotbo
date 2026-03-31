import { translate as googleTranslate } from '@vitalets/google-translate-api';
import { LRUCache } from 'lru-cache';
import { logger } from '../utils/logger.js';

const cache = new LRUCache<string, string>({
  max: 1000,
  ttl: 1000 * 60 * 60, // 1 heure de cache
});

export async function translate(
  text: string,
  targetLang: string,
  sourceLang?: string,
): Promise<string | null> {
  const to = targetLang.toLowerCase();
  const from = sourceLang?.toLowerCase();
  const cacheKey = `${from ?? 'auto'}:${to}:${text}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    logger.debug('Translation', 'Cache hit for translation');
    return cached;
  }

  try {
    const result = await googleTranslate(text, {
      to,
      from,
    });
    if (result.text) {
      cache.set(cacheKey, result.text);
    }
    return result.text ?? null;
  } catch (err) {
    logger.error('Translation', 'Google Translate error:', err);
    return null;
  }
}

export function isTranslationAvailable(): boolean {
  return true;
}
