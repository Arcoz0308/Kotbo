// ============================================================================
// PERSONNALISATION DES FORMULAIRES PUBLICS
// Sanitization du CSS custom + validation du thème structuré.
// Tout ce qui sort d'ici est servi tel quel sur les pages publiques :
// aucune entrée utilisateur ne doit pouvoir casser la page ou exfiltrer.
// ============================================================================

/** Polices autorisées (chargées via Google Fonts côté client). */
export const ALLOWED_FONTS = [
  'Inter',
  'Poppins',
  'Roboto',
  'Montserrat',
  'Open Sans',
  'Lato',
  'Nunito',
  'Raleway',
  'Outfit',
  'Space Grotesk',
  'JetBrains Mono',
  'Playfair Display',
] as const;

export type CustomFormTheme = {
  bannerUrl?: string;
  logoUrl?: string;
  accentColor?: string;
  backgroundColor?: string;
  cardColor?: string;
  textColor?: string;
  fontFamily?: string;
  borderRadius?: number; // px, 0-32
  glass?: boolean;
  welcomeText?: string;
  confirmationText?: string;
};

const MAX_CSS_LENGTH = 20_000;
const MAX_TEXT_LENGTH = 2_000;

const COLOR_RE = /^(#[0-9a-fA-F]{3,8}|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(,\s*[\d.]+\s*)?\)|hsla?\(\s*[\d.]+\s*,\s*[\d.]+%\s*,\s*[\d.]+%\s*(,\s*[\d.]+\s*)?\))$/;

function sanitizeColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return COLOR_RE.test(trimmed) ? trimmed : undefined;
}

function sanitizeImageUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length > 500) return undefined;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:') return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function sanitizeText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().slice(0, MAX_TEXT_LENGTH);
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Valide un thème de formulaire : ne conserve que les clés connues,
 * avec des valeurs strictement contraintes (couleurs CSS valides,
 * URLs https, police dans la liste blanche).
 */
export function sanitizeFormTheme(input: unknown): CustomFormTheme | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const theme: CustomFormTheme = {};

  const bannerUrl = sanitizeImageUrl(raw.bannerUrl);
  if (bannerUrl) theme.bannerUrl = bannerUrl;
  const logoUrl = sanitizeImageUrl(raw.logoUrl);
  if (logoUrl) theme.logoUrl = logoUrl;

  const accentColor = sanitizeColor(raw.accentColor);
  if (accentColor) theme.accentColor = accentColor;
  const backgroundColor = sanitizeColor(raw.backgroundColor);
  if (backgroundColor) theme.backgroundColor = backgroundColor;
  const cardColor = sanitizeColor(raw.cardColor);
  if (cardColor) theme.cardColor = cardColor;
  const textColor = sanitizeColor(raw.textColor);
  if (textColor) theme.textColor = textColor;

  if (typeof raw.fontFamily === 'string' && (ALLOWED_FONTS as readonly string[]).includes(raw.fontFamily)) {
    theme.fontFamily = raw.fontFamily;
  }

  if (typeof raw.borderRadius === 'number' && Number.isFinite(raw.borderRadius)) {
    theme.borderRadius = Math.max(0, Math.min(32, Math.round(raw.borderRadius)));
  }

  if (typeof raw.glass === 'boolean') theme.glass = raw.glass;

  const welcomeText = sanitizeText(raw.welcomeText);
  if (welcomeText) theme.welcomeText = welcomeText;
  const confirmationText = sanitizeText(raw.confirmationText);
  if (confirmationText) theme.confirmationText = confirmationText;

  return Object.keys(theme).length > 0 ? theme : null;
}

// Motifs supprimés en boucle jusqu'à stabilité (contre "expr/**/ession" & co)
const DANGEROUS_PATTERNS: RegExp[] = [
  /@\s*(import|charset|namespace|document)\b[^;{]*;?/gi,
  /expression\s*\(/gi,
  /-moz-binding\s*[^;}]*(;|(?=\}))/gi,
  /behavior\s*:[^;}]*(;|(?=\}))/gi,
  /(javascript|vbscript)\s*:/gi,
  // position fixed/sticky : empêche les overlays plein écran de phishing
  /position\s*:\s*(fixed|sticky)[^;}]*(;|(?=\}))/gi,
];

/**
 * Sanitize le CSS custom d'un formulaire public.
 * - longueur plafonnée
 * - commentaires et caractères <> supprimés (pas de sortie de balise <style>)
 * - at-rules dangereuses, expressions, bindings et position:fixed retirés
 * - url() limité aux data-URIs d'images (les visuels externes passent
 *   par le thème structuré, validé en https)
 */
export function sanitizeCustomCss(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  let css = input.slice(0, MAX_CSS_LENGTH);

  // Commentaires (peuvent fragmenter des mots-clés dangereux)
  css = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  // Jamais de balisage HTML dans du CSS légitime
  css = css.replace(/[<>]/g, '');

  for (let i = 0; i < 10; i++) {
    const before = css;
    for (const pattern of DANGEROUS_PATTERNS) {
      css = css.replace(pattern, ' ');
    }
    // url(...) : seuls les data-URIs d'images sont conservés
    css = css.replace(/url\s*\(\s*(['"]?)([^)'"]*)\1\s*\)/gi, (_match, _quote, target: string) => {
      const value = target.trim().toLowerCase();
      return value.startsWith('data:image/') ? `url("${target.trim()}")` : 'none';
    });
    if (css === before) break;
  }

  const trimmed = css.trim();
  return trimmed.length > 0 ? trimmed : null;
}
