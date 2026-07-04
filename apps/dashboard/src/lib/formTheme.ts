// Thème visuel des formulaires publics (partagé builder / rendu public).
// Le serveur sanitize theme + customCss ; ici on ne fait que du rendu.

export interface FormTheme {
  bannerUrl?: string;
  logoUrl?: string;
  accentColor?: string;
  backgroundColor?: string;
  cardColor?: string;
  textColor?: string;
  fontFamily?: string;
  borderRadius?: number;
  glass?: boolean;
  welcomeText?: string;
  confirmationText?: string;
}

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

/** Charge une police Google Fonts une seule fois (whitelist uniquement). */
export function loadGoogleFont(fontFamily: string) {
  if (!(ALLOWED_FONTS as readonly string[]).includes(fontFamily)) return;
  const id = `gfont-${fontFamily.replace(/\s+/g, '-').toLowerCase()}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${fontFamily.replace(/\s+/g, '+')}:wght@400;500;600;700&display=swap`;
  document.head.appendChild(link);
}

/**
 * CSS de base généré depuis le thème structuré (cartes, radius, glass, texte).
 * Injecté avant le CSS custom pour que ce dernier puisse tout surcharger.
 */
export function themeBaseCss(theme: FormTheme | null | undefined): string {
  if (!theme) return '';
  const rules: string[] = [];
  if (theme.cardColor) {
    rules.push(`.pf-root .pf-card{background:${theme.cardColor} !important;}`);
  }
  if (theme.glass) {
    rules.push(`.pf-root .pf-card{backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);background:color-mix(in srgb, ${theme.cardColor || '#151823'} 65%, transparent) !important;border:1px solid rgba(255,255,255,0.08) !important;}`);
  }
  if (theme.borderRadius !== undefined) {
    rules.push(`.pf-root .pf-card{border-radius:${theme.borderRadius}px !important;}`);
  }
  if (theme.textColor) {
    rules.push(`.pf-root .pf-card, .pf-root .pf-card :is(h1,h2,h3,label,span,p,td,th){color:${theme.textColor} !important;}`);
    rules.push(`.pf-root .pf-card .pf-error, .pf-root .pf-card .pf-error *{color:#f43f5e !important;}`);
  }
  if (theme.fontFamily) {
    rules.push(`.pf-root, .pf-root input, .pf-root textarea, .pf-root select, .pf-root button{font-family:'${theme.fontFamily}', system-ui, sans-serif;}`);
  }
  return rules.join('\n');
}

/** Variables CSS appliquées au conteneur racine de la page publique. */
export function themeStyleVars(theme: FormTheme | null | undefined, fallbackAccent = '#6366f1'): string {
  const t = theme || {};
  const vars: string[] = [`--form-color:${t.accentColor || fallbackAccent}`];
  if (t.backgroundColor) vars.push(`--form-bg:${t.backgroundColor}`);
  if (t.cardColor) vars.push(`--form-card:${t.cardColor}`);
  if (t.textColor) vars.push(`--form-text:${t.textColor}`);
  if (t.fontFamily) vars.push(`--form-font:'${t.fontFamily}', system-ui, sans-serif`);
  if (t.borderRadius !== undefined) vars.push(`--form-radius:${t.borderRadius}px`);
  return vars.join(';');
}
