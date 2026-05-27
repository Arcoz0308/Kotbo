import {
  EmbedBuilder,
  type ColorResolvable,
  type APIEmbedField,
} from 'discord.js';

export const COLORS = {
  primary: 0x5865f2 as ColorResolvable,
  success: 0x57f287 as ColorResolvable,
  danger: 0xed4245 as ColorResolvable,
  warning: 0xfee75c as ColorResolvable,
  info: 0x5865f2 as ColorResolvable,
  dark: 0x2b2d31 as ColorResolvable,
};

export function baseEmbed(color: ColorResolvable = COLORS.primary) {
  return new EmbedBuilder()
    .setColor(color)
    .setTimestamp()
    .setFooter({ text: 'Kotbo' });
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

export function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max - 3) + '...' : str;
}

export function getCategoryTheme(category: string) {
  const c = category?.toLowerCase() || '';
  if (c.includes('youtube')) return { label: 'YouTube', color: 0xff0000 as ColorResolvable };
  if (c.includes('twitch')) return { label: 'Twitch', color: 0x9146ff as ColorResolvable };
  return { label: 'Actualités', color: COLORS.primary };
}

export function categoryEmoji(category: string) {
  const c = category?.toLowerCase() || '';
  if (c.includes('youtube')) return '▶️';
  if (c.includes('twitch')) return '🟪';
  return '📰';
}

export function feedStatusEmoji(status: boolean) {
  return status ? '🟢' : '🔴';
}

export function buildYouTubeEmbed(params: {
  title: string;
  videoId: string;
  channelName: string;
  publishedAt: Date;
}) {
  return baseEmbed(0xff0000)
    .setTitle(truncate(params.title, 256))
    .setURL(`https://www.youtube.com/watch?v=${params.videoId}`)
    .setAuthor({ name: params.channelName })
    .setTimestamp(params.publishedAt);
}

export function buildTwitchEmbed(params: {
  title: string;
  streamerName: string;
  gameName?: string;
  viewerCount?: number;
  thumbnailUrl?: string;
  isOffline?: boolean;
}) {
  const embed = baseEmbed(0x9146ff)
    .setTitle(truncate(params.title, 256))
    .setURL(`https://twitch.tv/${params.streamerName}`)
    .setAuthor({ name: params.streamerName });

  if (params.gameName) {
    embed.addFields({ name: 'Jeu', value: params.gameName, inline: true });
  }
  if (params.viewerCount !== undefined) {
    embed.addFields({ name: 'Spectateurs', value: params.viewerCount.toLocaleString(), inline: true });
  }
  if (params.thumbnailUrl) {
    const formattedUrl = params.thumbnailUrl
      .replace('{width}', '1280')
      .replace('{height}', '720');
    embed.setImage(formattedUrl);
  }
  if (params.isOffline) {
    embed.setDescription('Le stream est maintenant hors ligne.');
  } else {
    embed.setDescription(`🔴 ${params.streamerName} est en live !`);
  }

  return embed;
}

export function buildNewsEmbed(params: {
  title: string;
  url: string;
  description: string;
  feedName: string;
  category: string;
  publishedAt: Date;
  isValidation?: boolean;
  itemId?: string;
}) {
  const theme = getCategoryTheme(params.category);
  const embed = baseEmbed(theme.color)
    .setTitle(truncate(params.title, 256))
    .setURL(params.url)
    .setDescription(truncate(params.description, 2048))
    .setAuthor({ name: params.feedName })
    .setTimestamp(params.publishedAt);

  embed.addFields(
    { name: 'Catégorie', value: params.category, inline: true },
    { name: 'Source', value: params.feedName, inline: true }
  );

  if (params.itemId) {
    embed.setFooter({ text: `Kotbo • ID: ${params.itemId}` });
  }

  return embed;
}




