import { existsSync } from 'node:fs';
import { GlobalFonts } from '@napi-rs/canvas';

const FONT_FAMILY = 'Kotbo Canvas';

let ready = false;

/** Registers a usable font for @napi-rs/canvas (Alpine Docker has none by default). */
export function ensureCanvasFonts(): void {
  if (ready) return;

  GlobalFonts.loadSystemFonts?.();

  const candidates = [
    '/usr/share/fonts/ttf-dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
    'C:\\Windows\\Fonts\\arialbd.ttf',
    'C:\\Windows\\Fonts\\segoeuib.ttf',
  ];

  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      GlobalFonts.registerFromPath(path, FONT_FAMILY);
      break;
    } catch {
      // try next candidate
    }
  }

  ready = true;
}

export function canvasFont(size: number, weight: 'normal' | 'bold' = 'normal'): string {
  const prefix = weight === 'bold' ? 'bold ' : '';
  return `${prefix}${size}px "${FONT_FAMILY}", "DejaVu Sans", Arial, sans-serif`;
}
