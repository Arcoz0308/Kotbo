import { franc } from 'franc-min';

const FRANC_TO_DEEPL: Record<string, string> = {
  fra: 'FR',
  eng: 'EN',
  deu: 'DE',
  spa: 'ES',
  ita: 'IT',
  por: 'PT',
  nld: 'NL',
  pol: 'PL',
  rus: 'RU',
  jpn: 'JA',
  zho: 'ZH',
};

const LANG_NAMES: Record<string, string> = {
  FR: 'Français',
  EN: 'Anglais',
  DE: 'Allemand',
  ES: 'Espagnol',
  IT: 'Italien',
  PT: 'Portugais',
  NL: 'Néerlandais',
  PL: 'Polonais',
  RU: 'Russe',
  JA: 'Japonais',
  ZH: 'Chinois',
};

export function detectLanguage(text: string): string | null {
  if (!text || text.trim().length < 20) return null;
  const code = franc(text, { minLength: 10 });
  if (code === 'und') return null;
  return FRANC_TO_DEEPL[code] ?? null;
}

export function getLangName(code: string): string {
  return LANG_NAMES[code.toUpperCase()] ?? code;
}
