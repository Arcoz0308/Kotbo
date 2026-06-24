import { createCanvas, loadImage } from '@napi-rs/canvas';
import { write, mkdir } from 'bun';
import { join } from 'path';

// Define stroke colors matching Discord/Kotbo branding
const COLORS = {
  green: '#57F287',
  red: '#ED4245',
  yellow: '#FEE75C',
  blurple: '#5865F2',
  pink: '#EB459E',
  purple: '#9146FF',
  gold: '#F5A623',
  silver: '#B8C2CC',
  bronze: '#CD7F32',
  gray: '#8E9297',
  darkGray: '#4F545C',
};

interface EmojiConfig {
  type: 'lucide' | 'custom';
  lucideName?: string;
  color?: string;
  fillType?: 'none' | 'full' | 'opacity';
  fillOpacity?: number;
  strokeWidth?: number;
  svg?: string;
}

type IconNode = [string, Record<string, string | number>];

const EMOJI_CONFIGS: Record<string, EmojiConfig> = {
  // --- Status (filled container with foreground icon) ---
  ktb_check: {
    type: 'lucide',
    lucideName: 'circle-check',
    color: COLORS.green,
    fillType: 'opacity',
    fillOpacity: 0.15,
  },
  ktb_cross: {
    type: 'lucide',
    lucideName: 'circle-x',
    color: COLORS.red,
    fillType: 'opacity',
    fillOpacity: 0.15,
  },
  ktb_warn: {
    type: 'lucide',
    lucideName: 'triangle-alert',
    color: COLORS.yellow,
    fillType: 'opacity',
    fillOpacity: 0.15,
  },
  ktb_info: {
    type: 'lucide',
    lucideName: 'info',
    color: COLORS.blurple,
    fillType: 'opacity',
    fillOpacity: 0.15,
  },

  // --- UI Elements ---
  ktb_arrow: {
    type: 'lucide',
    lucideName: 'chevron-right',
    color: COLORS.gray,
    fillType: 'none',
  },
  ktb_dot: {
    type: 'custom',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${COLORS.gray}" stroke="${COLORS.gray}" stroke-width="2.5"><circle cx="12" cy="12" r="4"/></svg>`,
  },

  // --- Ranking (using Medal) ---
  ktb_gold: {
    type: 'lucide',
    lucideName: 'medal',
    color: COLORS.gold,
    fillType: 'opacity',
    fillOpacity: 0.15,
  },
  ktb_silver: {
    type: 'lucide',
    lucideName: 'medal',
    color: COLORS.silver,
    fillType: 'opacity',
    fillOpacity: 0.15,
  },
  ktb_bronze: {
    type: 'lucide',
    lucideName: 'medal',
    color: COLORS.bronze,
    fillType: 'opacity',
    fillOpacity: 0.15,
  },

  // --- Features ---
  ktb_mod: {
    type: 'lucide',
    lucideName: 'shield-alert',
    color: COLORS.purple,
    fillType: 'opacity',
    fillOpacity: 0.15,
  },
  ktb_stats: {
    type: 'lucide',
    lucideName: 'bar-chart-2',
    color: COLORS.blurple,
    fillType: 'none',
  },
  ktb_trophy: {
    type: 'lucide',
    lucideName: 'trophy',
    color: COLORS.gold,
    fillType: 'none',
  },
  ktb_profile: {
    type: 'lucide',
    lucideName: 'user',
    color: COLORS.blurple,
    fillType: 'none',
  },
  ktb_xp: {
    type: 'lucide',
    lucideName: 'sparkles',
    color: COLORS.yellow,
    fillType: 'opacity',
    fillOpacity: 0.15,
  },
  ktb_level: {
    type: 'lucide',
    lucideName: 'trending-up',
    color: COLORS.green,
    fillType: 'none',
  },
  ktb_msg: {
    type: 'lucide',
    lucideName: 'message-square',
    color: COLORS.blurple,
    fillType: 'none',
  },
  ktb_voice: {
    type: 'lucide',
    lucideName: 'mic',
    color: COLORS.blurple,
    fillType: 'none',
  },
  ktb_coins: {
    type: 'lucide',
    lucideName: 'coins',
    color: COLORS.yellow,
    fillType: 'none',
  },
  ktb_cal: {
    type: 'lucide',
    lucideName: 'calendar',
    color: COLORS.blurple,
    fillType: 'none',
  },
  ktb_clock: {
    type: 'lucide',
    lucideName: 'clock',
    color: COLORS.blurple,
    fillType: 'none',
  },
  ktb_ticket: {
    type: 'lucide',
    lucideName: 'ticket',
    color: COLORS.pink,
    fillType: 'none',
  },
  ktb_news: {
    type: 'lucide',
    lucideName: 'megaphone',
    color: COLORS.blurple,
    fillType: 'none',
  },
  ktb_settings: {
    type: 'lucide',
    lucideName: 'settings',
    color: COLORS.gray,
    fillType: 'none',
  },
  ktb_shield: {
    type: 'lucide',
    lucideName: 'shield',
    color: COLORS.blurple,
    fillType: 'none',
  },
  ktb_star: {
    type: 'lucide',
    lucideName: 'star',
    color: COLORS.yellow,
    fillType: 'opacity',
    fillOpacity: 0.15,
  },
  ktb_fire: {
    type: 'lucide',
    lucideName: 'flame',
    color: COLORS.red,
    fillType: 'none',
  },
  ktb_crown: {
    type: 'lucide',
    lucideName: 'crown',
    color: COLORS.gold,
    fillType: 'opacity',
    fillOpacity: 0.15,
  },
  ktb_link: {
    type: 'lucide',
    lucideName: 'link',
    color: COLORS.blurple,
    fillType: 'none',
  },
  ktb_lock: {
    type: 'lucide',
    lucideName: 'lock',
    color: COLORS.red,
    fillType: 'none',
  },
  ktb_unlock: {
    type: 'lucide',
    lucideName: 'unlock',
    color: COLORS.green,
    fillType: 'none',
  },
  ktb_ban: {
    type: 'lucide',
    lucideName: 'ban',
    color: COLORS.red,
    fillType: 'none',
  },
  ktb_mute: {
    type: 'lucide',
    lucideName: 'volume-x',
    color: COLORS.red,
    fillType: 'none',
  },
  ktb_kick: {
    type: 'lucide',
    lucideName: 'user-minus',
    color: COLORS.red,
    fillType: 'none',
  },

  // --- Platforms (Custom SVGs as brand icons are absent in this Lucide build) ---
  ktb_yt: {
    type: 'custom',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${COLORS.red}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17z" fill="${COLORS.red}" fill-opacity="0.15"/>
  <path d="m10 15 5-3-5-3z" fill="#FFFFFF" stroke="#FFFFFF"/>
</svg>`,
  },
  ktb_twitch: {
    type: 'custom',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${COLORS.purple}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 2H3v16h5v4l4-4h5l4-4V2zm-10 9H9.5V6H11v5zm4 0h-1.5V6H15v5z" />
</svg>`,
  },

  // --- Presence ---
  ktb_online: {
    type: 'lucide',
    lucideName: 'circle',
    color: COLORS.green,
    fillType: 'full',
  },
  ktb_idle: {
    type: 'lucide',
    lucideName: 'moon',
    color: COLORS.yellow,
    fillType: 'full',
  },
  ktb_dnd: {
    type: 'lucide',
    lucideName: 'circle-minus',
    color: COLORS.red,
    fillType: 'full',
  },
  ktb_offline: {
    type: 'lucide',
    lucideName: 'circle',
    color: COLORS.gray,
    fillType: 'none',
  },

  // --- Progress Bar (custom geometric SVGs) ---
  ktb_fl: {
    type: 'custom',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${COLORS.blurple}" stroke-width="2.5"><path d="M22 7H8c-2.8 0-5 2.2-5 5s2.2 5 5 5h14" fill="${COLORS.blurple}"/></svg>`,
  },
  ktb_fm: {
    type: 'custom',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${COLORS.blurple}" stroke-width="2.5"><rect x="0" y="7" width="24" height="10" fill="${COLORS.blurple}"/></svg>`,
  },
  ktb_fr: {
    type: 'custom',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${COLORS.blurple}" stroke-width="2.5"><path d="M2 7h14c2.8 0 5 2.2 5 5s-2.2 5-5 5H2" fill="${COLORS.blurple}"/></svg>`,
  },
  ktb_el: {
    type: 'custom',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${COLORS.darkGray}" stroke-width="2.5"><path d="M22 7H8c-2.8 0-5 2.2-5 5s2.2 5 5 5h14"/></svg>`,
  },
  ktb_em: {
    type: 'custom',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${COLORS.darkGray}" stroke-width="2.5"><rect x="0" y="7" width="24" height="10"/></svg>`,
  },
  ktb_er: {
    type: 'custom',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${COLORS.darkGray}" stroke-width="2.5"><path d="M2 7h14c2.8 0 5 2.2 5 5s-2.2 5-5 5H2"/></svg>`,
  },

  // --- Branding ---
  ktb_logo: {
    type: 'lucide',
    lucideName: 'globe',
    color: COLORS.blurple,
    fillType: 'opacity',
    fillOpacity: 0.15,
  },
};

// Retrieve SVG element definitions dynamically from the installed Lucide package
async function getIconNodes(name: string): Promise<IconNode[]> {
  const candidates = [
    name,
    name === 'circle-check' ? 'check-circle' : null,
    name === 'circle-x' ? 'x-circle' : null,
    name === 'triangle-alert' ? 'alert-triangle' : null,
    name === 'circle-minus' ? 'minus-circle' : null,
  ].filter(Boolean) as string[];

  let svelteContent = '';
  let resolvedPath = '';

  for (const cand of candidates) {
    const basePath = join(import.meta.dirname, '..', '..', '..', 'node_modules', 'lucide-svelte', 'dist', 'icons');
    const jsPath = join(basePath, `${cand}.js`);
    const sveltePath = join(basePath, `${cand}.svelte`);

    if (await Bun.file(jsPath).exists()) {
      const jsContent = await Bun.file(jsPath).text();
      const match = jsContent.match(/from\s+["']\.\/(.*\.svelte)["']/);
      if (match) {
        const realSveltePath = join(basePath, match[1]);
        if (await Bun.file(realSveltePath).exists()) {
          svelteContent = await Bun.file(realSveltePath).text();
          resolvedPath = realSveltePath;
          break;
        }
      }
    }

    if (await Bun.file(sveltePath).exists()) {
      svelteContent = await Bun.file(sveltePath).text();
      resolvedPath = sveltePath;
      break;
    }
  }

  if (!svelteContent) {
    throw new Error(`Could not find Lucide icon files for candidate names: ${candidates.join(', ')}`);
  }

  const match = svelteContent.match(/const\s+iconNode\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) {
    throw new Error(`Could not find iconNode in Svelte file: ${resolvedPath}`);
  }

  // Evaluate the static javascript array literal safely
  return eval(match[1]);
}

function buildSvgString(
  nodes: IconNode[],
  emojiName: string,
  color: string,
  fillType: 'none' | 'full' | 'opacity',
  fillOpacity?: number,
  strokeWidth: number = 2.5
): string {
  const childStrings = nodes.map((node, index) => {
    const [tag, attrs] = node;
    const newAttrs = { ...attrs };

    // YouTube logo customization: make standard play button white inside red background
    if (emojiName === 'ktb_yt' && index === 1) {
      newAttrs.fill = '#FFFFFF';
      newAttrs.stroke = '#FFFFFF';
    } 
    // DND customization: make horizontal dash white and thick
    else if (emojiName === 'ktb_dnd' && index === 1) {
      newAttrs.stroke = '#FFFFFF';
      newAttrs['stroke-width'] = 3;
    } 
    // Default styling rules based on fillType
    else {
      if (fillType === 'full') {
        newAttrs.fill = color;
      } else if (fillType === 'opacity') {
        if (index === 0) {
          newAttrs.fill = color;
          newAttrs['fill-opacity'] = fillOpacity ?? 0.15;
        } else {
          newAttrs.fill = 'none';
        }
      } else {
        newAttrs.fill = 'none';
      }
    }

    const attrStr = Object.entries(newAttrs)
      .map(([key, val]) => `${key}="${val}"`)
      .join(' ');

    return `<${tag} ${attrStr} />`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">\n  ${childStrings.join('\n  ')}\n</svg>`;
}

const outputDir = join(import.meta.dirname, '..', '..', 'dashboard', 'public', 'emojis-png');

// Ensure output directory exists
try {
  await mkdir(outputDir, { recursive: true });
  console.log(`Ensured output directory: ${outputDir}`);
} catch (e) {
  // Ignore
}

let count = 0;
for (const [name, config] of Object.entries(EMOJI_CONFIGS)) {
  try {
    let svgContent = '';

    if (config.type === 'custom') {
      svgContent = config.svg!;
    } else {
      const nodes = await getIconNodes(config.lucideName!);
      svgContent = buildSvgString(
        nodes,
        name,
        config.color!,
        config.fillType!,
        config.fillOpacity,
        config.strokeWidth ?? 2.5
      );
    }

    const canvas = createCanvas(128, 128);
    const ctx = canvas.getContext('2d');

    const svgBuffer = Buffer.from(svgContent);
    const img = await loadImage(svgBuffer);
    ctx.drawImage(img, 0, 0, 128, 128);

    const pngBuffer = await canvas.encode('png');
    const filePath = join(outputDir, `${name}.png`);
    await write(filePath, pngBuffer);
    console.log(`Generated PNG emoji: ${name}.png`);
    count++;
  } catch (err) {
    console.error(`Failed to generate emoji ${name}:`, err);
  }
}

console.log(`\nSuccess: Generated ${count} PNG custom emojis directly using Lucide assets.`);
