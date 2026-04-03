import {
  EmbedBuilder,
  type ColorResolvable,
  type APIEmbedField,
} from 'discord.js';

export interface CategoryTheme {
  emoji: string;
  color: ColorResolvable;
  label: string;
  icon: string;
}

const FRANCE_THEME: CategoryTheme = {
  emoji: '🇫🇷',
  color: 0x3a86ff,  // bleu
  label: 'Actualité Tech Générale (France)',
  icon: '🔵 Actualité Tech Générale (France)',
};

const INTERNATIONAL_THEME: CategoryTheme = {
  emoji: '🌐',
  color: 0x8338ec,  // violet
  label: 'Références Internationales (Anglais)',
  icon: '🟣 Références Internationales (Anglais)',
};

const CYBER_THEME: CategoryTheme = {
  emoji: '🛡️',
  color: 0x06d6a0,  // turquoise
  label: 'Cybersécurité & Open Source',
  icon: '🟢 Cybersécurité & Open Source',
};

const AI_DEV_THEME: CategoryTheme = {
  emoji: '🧠',
  color: 0xffbe0b,  // ambre
  label: 'Intelligence Artificielle & Dev',
  icon: '🟡 Intelligence Artificielle & Dev',
};

const HARDWARE_THEME: CategoryTheme = {
  emoji: '🎮',
  color: 0xff006e,  // Rose
  label: 'Hardware & Gaming',
  icon: '🔴 Hardware & Gaming',
};

const CATEGORY_THEMES: Record<string, CategoryTheme> = {
  'Actualité Tech Générale (France)': FRANCE_THEME,
  'Tech FR': FRANCE_THEME,
  'Références Internationales (Anglais)': INTERNATIONAL_THEME,
  'Tech EN': INTERNATIONAL_THEME,
  'Cybersécurité & Open Source': CYBER_THEME,
  'Cybersécurité': CYBER_THEME,
  'Intelligence Artificielle & Dev': AI_DEV_THEME,
  'IA & Dev': AI_DEV_THEME,
  'Hardware & Gaming': HARDWARE_THEME,
  'YouTube': {
    emoji: '▶️',
    color: 0xff0000,  // Rouge YouTube
    label: 'YouTube',
    icon: '🔴 YouTube',
  },
  'Général': {
    emoji: '📰',
    color: 0x5865f2,  // Discord blurple
    label: 'Général',
    icon: '🔵 Général',
  },
};

const DEFAULT_THEME: CategoryTheme = {
  emoji: '📰',
  color: 0x5865f2,
  label: 'Actualités',
  icon: '📰 Actualités',
};

export function getCategoryTheme(category: string): CategoryTheme {
  return CATEGORY_THEMES[category] ?? DEFAULT_THEME;
}

export const COLORS = {
  primary: 0x5865f2 as ColorResolvable,
  success: 0x57f287 as ColorResolvable,
  danger: 0xed4245 as ColorResolvable,
  warning: 0xfee75c as ColorResolvable,
  info: 0x5865f2 as ColorResolvable,
  dark: 0x2b2d31 as ColorResolvable,
  youtube: 0xff0000 as ColorResolvable,
};

export function baseEmbed(color: ColorResolvable = COLORS.primary) {
  return new EmbedBuilder()
    .setColor(color)
    .setTimestamp()
    .setFooter({ text: 'Kotbo · Bot d’actualité' });
}

export function successEmbed(title: string, description?: string) {
  return baseEmbed(COLORS.success).setTitle(`✅ ${title}`).setDescription(description ?? null);
}

export function errorEmbed(title: string, description?: string) {
  return baseEmbed(COLORS.danger).setTitle(`❌ ${title}`).setDescription(description ?? null);
}

export function infoEmbed(title: string, description?: string, fields?: APIEmbedField[]) {
  const e = baseEmbed(COLORS.info).setTitle(`ℹ️ ${title}`);
  if (description) e.setDescription(description);
  if (fields?.length) e.addFields(fields);
  return e;
}

export interface NewsEmbedOptions {
  title: string;
  url: string;
  description?: string | null;
  feedName: string;
  category: string;
  publishedAt: Date;
  imageUrl?: string | null;
  author?: string | null;
  translated?: boolean;
  isValidation?: boolean;
  itemId?: string;
}

export function buildNewsEmbed(opts: NewsEmbedOptions): EmbedBuilder {
  const theme = getCategoryTheme(opts.category);

  const embed = new EmbedBuilder()
    .setColor(theme.color)
    .setTitle(`${theme.emoji}  ${truncate(opts.title, 250)}`)
    .setURL(opts.url)
    .setTimestamp();

  const descParts: string[] = [];
  if (opts.description) {
    descParts.push(`┃ ${truncate(opts.description, opts.isValidation ? 300 : 450)}`);
  }
  if (opts.translated) {
    descParts.push('\n> 🌍 *Traduit automatiquement*');
  }
  if (descParts.length > 0) {
    embed.setDescription(descParts.join('\n'));
  }

  const fields: APIEmbedField[] = [
    { name: '📡 Source', value: `\`${opts.feedName}\``, inline: true },
    { name: `${theme.emoji} Catégorie`, value: theme.label, inline: true },
    { name: '🕐 Publié', value: `<t:${Math.floor(opts.publishedAt.getTime() / 1000)}:R>`, inline: true },
  ];
  embed.addFields(fields);

  if (opts.imageUrl) embed.setImage(opts.imageUrl);

  if (opts.author) embed.setAuthor({ name: opts.author });

  if (opts.isValidation) {
    embed.setFooter({ text: `${theme.icon}  ·  ID: ${opts.itemId ?? '—'}` });
  } else {
    embed.setFooter({ text: `${theme.icon}  ·  Kotbo News` });
  }

  return embed;
}

export interface YouTubeEmbedOptions {
  title: string;
  videoId: string;
  description?: string | null;
  channelName: string;
  publishedAt: Date;
  thumbnailUrl?: string | null;
  isValidation?: boolean;
}

export function buildYouTubeEmbed(opts: YouTubeEmbedOptions): EmbedBuilder {
  const theme = getCategoryTheme('YouTube');

  const embed = new EmbedBuilder()
    .setColor(theme.color)
    .setTitle(`▶️  ${truncate(opts.title, 250)}`)
    .setURL(`https://www.youtube.com/watch?v=${opts.videoId}`)
    .setTimestamp();

  if (opts.description) {
    embed.setDescription(`┃ ${truncate(opts.description, opts.isValidation ? 300 : 400)}`);
  }

  embed.addFields(
    { name: '🎬 Chaîne', value: `\`${opts.channelName}\``, inline: true },
    { name: '🕐 Publié', value: `<t:${Math.floor(opts.publishedAt.getTime() / 1000)}:R>`, inline: true },
  );

  if (opts.thumbnailUrl) embed.setImage(opts.thumbnailUrl);

  embed.setFooter({
    text: opts.isValidation
      ? `🔴 YouTube  ·  ID vidéo : ${opts.videoId}`
      : '🔴 YouTube  ·  Kotbo',
  });

  return embed;
}

export function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max - 3) + '...' : str;
}

export function categoryEmoji(category: string): string {
  return getCategoryTheme(category).emoji;
}

export function feedStatusEmoji(enabled: boolean) {
  return enabled ? '🟢' : '🔴';
}
