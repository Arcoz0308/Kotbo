import { translate as googleTranslate } from '@vitalets/google-translate-api';
import { logger } from '../utils/logger.js';

export async function translate(
  text: string,
  targetLang: string,
  sourceLang?: string,
): Promise<string | null> {
  const to = targetLang.toLowerCase();
  const from = sourceLang?.toLowerCase();

  try {
    const result = await googleTranslate(text, {
      to,
      from,
    });
    return result.text ?? null;
  } catch (err) {
    logger.error('Translation', 'Google Translate error:', err);
    return null;
  }
}

export function isTranslationAvailable(): boolean {
  return true;
}
