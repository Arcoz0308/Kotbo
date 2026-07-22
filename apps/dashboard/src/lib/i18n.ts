/**
 * Point d'entrée i18n du dashboard (Paraglide-JS / Inlang).
 *
 * - `m` : messages compilés, type-safe et tree-shakés → `m.home_greeting({ name })`.
 * - `setLocale` / `getLocale` : lecture/écriture de la langue active.
 *
 * La langue est persistée par Paraglide (stratégie `localStorage`, clé
 * `PARAGLIDE_LOCALE`) et reste synchronisée avec `userPrefs.language`
 * via `applyLocale()` ci-dessous.
 */
import { m } from './paraglide/messages.js';
import { getLocale, setLocale, locales, baseLocale, type Locale } from './paraglide/runtime.js';

/**
 * Aligne la langue Paraglide sur la préférence utilisateur.
 *
 * Appelée à l'init (sans reload) et à chaque changement de langue (avec reload,
 * comportement par défaut de Paraglide) pour appliquer la traduction partout.
 */
export function applyLocale(lang: string, options?: { reload?: boolean }) {
  if (!locales.includes(lang as Locale)) return;
  if (getLocale() === lang) return;
  setLocale(lang as Locale, options);
}

/** Locale BCP 47 pour `toLocaleDateString`/`toLocaleTimeString`. */
export function dateLocale(): string {
  return getLocale() === 'fr' ? 'fr-FR' : 'en-GB';
}

export { m, getLocale, setLocale, locales, baseLocale };
export type { Locale };
