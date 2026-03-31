import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Client,
  type TextChannel,
  type User,
} from 'discord.js';
import prisma from '../utils/db.js';
import { logger } from '../utils/logger.js';
import {
  COLORS,
  truncate,
  categoryEmoji,
  buildNewsEmbed,
  buildYouTubeEmbed,
  getCategoryTheme,
} from '../utils/embeds.js';

export async function sendToValidationQueue(
  client: Client,
  itemId: string,
  type: 'rss' | 'youtube',
): Promise<void> {
  if (type === 'rss') {
    const item = await prisma.feedItem.findUnique({ where: { id: itemId }, include: { feed: { include: { guild: true } } } });
    if (!item?.feed?.guild?.configChannelId) {
      logger.warn('Notif', `Cannot queue RSS item "${item?.title}": configChannelId (validation channel) is not set for guild ${item?.feed?.guildId}`);
      return;
    }

    const channel = await client.channels.fetch(item.feed.guild.configChannelId).catch(() => null) as TextChannel | null;
    if (!channel) {
      logger.error('Notif', `Validation channel ${item.feed.guild.configChannelId} not found for guild ${item.feed.guildId}`);
      return;
    }

    const embed = buildNewsEmbed({
      title: item.titleTranslated ?? item.title,
      url: item.url,
      description: item.descriptionTranslated ?? item.description,
      feedName: item.feed.name,
      category: item.feed.category,
      publishedAt: item.publishedAt,
      imageUrl: item.imageUrl,
      author: item.author,
      translated: !!item.titleTranslated,
      isValidation: true,
      itemId: item.id,
    });

    const rows = buildValidationButtons(item.id, 'rss', item.feed.language);
    const msg = await channel.send({ embeds: [embed], components: rows });

    await prisma.feedItem.update({
      where: { id: item.id },
      data: { queueMessageId: msg.id },
    });
    logger.success('Notif', `Queued RSS item "${item.title}" for validation`);
  } else {
    const item = await prisma.youTubeItem.findUnique({ where: { id: itemId }, include: { guild: true } });
    if (!item?.guild?.configChannelId) {
      logger.warn('Notif', `Cannot queue YouTube item "${item?.title}": configChannelId (validation channel) is not set for guild ${item?.guildId}`);
      return;
    }

    const channel = await client.channels.fetch(item.guild.configChannelId).catch(() => null) as TextChannel | null;
    if (!channel) {
      logger.error('Notif', `Validation channel ${item.guild.configChannelId} not found for guild ${item.guildId}`);
      return;
    }

    const embed = buildYouTubeEmbed({
      title: item.title,
      videoId: item.videoId,
      description: item.description,
      channelName: item.channelName,
      publishedAt: item.publishedAt,
      thumbnailUrl: item.thumbnailUrl,
      isValidation: true,
    });

    const rows = buildValidationButtons(item.id, 'youtube');
    const msg = await channel.send({ embeds: [embed], components: rows });

    await prisma.youTubeItem.update({
      where: { id: item.id },
      data: { queueMessageId: msg.id },
    });
    logger.success('Notif', `Queued YouTube video "${item.title}" for validation`);
  }
}

function buildValidationButtons(itemId: string, type: 'rss' | 'youtube', language?: string | null) {
  const approve = new ButtonBuilder()
    .setCustomId(`validate:approve:${type}:${itemId}`)
    .setLabel('Valider')
    .setEmoji('✅')
    .setStyle(ButtonStyle.Success);

  const reject = new ButtonBuilder()
    .setCustomId(`validate:reject:${type}:${itemId}`)
    .setLabel('Rejeter')
    .setEmoji('❌')
    .setStyle(ButtonStyle.Danger);

  const translate = new ButtonBuilder()
    .setCustomId(`validate:translate:${type}:${itemId}`)
    .setLabel('Traduire')
    .setEmoji('🌐')
    .setStyle(ButtonStyle.Secondary);

  const pin = new ButtonBuilder()
    .setCustomId(`validate:pin:${type}:${itemId}`)
    .setLabel('Épingler')
    .setEmoji('📌')
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(approve, reject);
  
  const isFrench = language && language.toLowerCase().startsWith('fr');
  if (type === 'rss' && !isFrench) {
    row.addComponents(translate);
  }
  
  row.addComponents(pin);

  return [row];
}

export async function sendApprovedItem(
  client: Client,
  itemId: string,
  type: 'rss' | 'youtube' = 'rss',
): Promise<void> {
  if (type === 'rss') {
    const item = await prisma.feedItem.findUnique({ where: { id: itemId }, include: { feed: { include: { guild: true } } } });
    if (!item?.feed?.guild?.publicChannelId) {
      logger.warn('Notif', `Cannot publish RSS item "${item?.title}": publicChannelId is not set for guild ${item?.feed?.guildId}`);
      return;
    }

    const channel = await client.channels.fetch(item.feed.guild.publicChannelId).catch(() => null) as TextChannel | null;
    if (!channel) {
      logger.error('Notif', `Public channel ${item.feed.guild.publicChannelId} not found for guild ${item.feed.guildId}`);
      return;
    }

    const embed = buildNewsEmbed({
      title: item.titleTranslated ?? item.title,
      url: item.url,
      description: item.descriptionTranslated ?? item.description,
      feedName: item.feed.name,
      category: item.feed.category,
      publishedAt: item.publishedAt,
      imageUrl: item.imageUrl,
      author: item.author,
      translated: !!item.titleTranslated,
    });

    const subscribeBtn = new ButtonBuilder()
      .setCustomId(`subscribe:feed:${item.feed.id}`)
      .setLabel('S\'abonner')
      .setEmoji('📬')
      .setStyle(ButtonStyle.Secondary);

    const pinBtn = new ButtonBuilder()
      .setCustomId(`public:pin:rss:${itemId}`)
      .setLabel(item.pinned ? 'Désépingler' : 'Épingler')
      .setEmoji('📌')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(subscribeBtn, pinBtn);
    const msg = await channel.send({ embeds: [embed], components: [row] });

    if (item.pinned) {
      await msg.pin().catch(() => null);
    }

    await prisma.feedItem.update({
      where: { id: item.id },
      data: { status: 'APPROVED', publicMessageId: msg.id },
    });

    await sendDMsToSubscribers(client, item.feed.id, embed);

    const guild = await client.guilds.fetch(item.feed.guildId).catch(() => null);
    if (guild && item.feed.roleId) {
      const subs = await prisma.userFeedSub.findMany({ where: { feedId: item.feed.id } });
      for (const sub of subs) {
        const member = await guild.members.fetch(sub.userId).catch(() => null);
        if (member && item.feed.roleId) {
          await member.roles.add(item.feed.roleId).catch(() => null);
        }
      }
    }
  } else {
    const item = await prisma.youTubeItem.findUnique({ where: { id: itemId }, include: { guild: true } });
    if (!item) return;

    const channelId = item.guild.youtubeChannelId ?? item.guild.nathanChannelId ?? item.guild.publicChannelId;
    if (!channelId) {
      logger.warn('Notif', `Cannot publish YouTube item "${item.title}": no destination channel set for guild ${item.guildId}`);
      return;
    }

    const channel = await client.channels.fetch(channelId).catch(() => null) as TextChannel | null;
    if (!channel) {
      logger.error('Notif', `Destination channel ${channelId} not found for YouTube item in guild ${item.guildId}`);
      return;
    }

    const embed = buildYouTubeEmbed({
      title: item.title,
      videoId: item.videoId,
      description: item.description,
      channelName: item.channelName,
      publishedAt: item.publishedAt,
      thumbnailUrl: item.thumbnailUrl,
    });

    const watchBtn = new ButtonBuilder()
      .setLabel('Regarder')
      .setEmoji('▶️')
      .setStyle(ButtonStyle.Link)
      .setURL(`https://www.youtube.com/watch?v=${item.videoId}`);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(watchBtn);
    const mentionRoleId = item.isShort ? (item.guild as any).youtubeShortRoleId : (item.guild as any).youtubeVideoRoleId;
    const content = mentionRoleId ? `<@&${mentionRoleId}>` : '';

    const msg = await channel.send({ content, embeds: [embed], components: [row] });

    await prisma.youTubeItem.update({
      where: { id: item.id },
      data: { status: 'APPROVED', publicMessageId: msg.id },
    });
  }
}

async function sendDMsToSubscribers(
  client: Client,
  feedId: string,
  newsEmbed: EmbedBuilder,
): Promise<void> {
  const subs = await prisma.userFeedSub.findMany({ where: { feedId } });
  for (const sub of subs) {
    try {
      const user = await client.users.fetch(sub.userId);
      await user.send({ embeds: [newsEmbed] });
    } catch (e) {
      logger.error('Notification', 'Failed to send DM to subscriber:', e);
    }
  }
}

export async function sendDMSubscribePanel(
  user: User,
  guildId: string,
): Promise<void> {
  const feeds = await prisma.feed.findMany({
    where: { guildId, enabled: true },
    orderBy: { category: 'asc' },
  });

  if (feeds.length === 0) {
    await user.send({ embeds: [new EmbedBuilder().setColor(COLORS.warning).setDescription('❌ Aucun flux disponible pour ce serveur.')] });
    return;
  }

  const userSubs = await prisma.userFeedSub.findMany({
    where: { userId: user.id, feedId: { in: feeds.map((f) => f.id) } },
  });
  const subIds = new Set(userSubs.map((s) => s.feedId));

  const grouped = new Map<string, typeof feeds>();
  for (const feed of feeds) {
    const cat = feed.category;
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(feed);
  }

  let description = '**Choisissez les flux dont vous voulez recevoir les news en DM.**\n\n';
  for (const [cat, catFeeds] of grouped) {
    const theme = getCategoryTheme(cat);
    description += `${theme.emoji} **${cat}**\n`;
    for (const f of catFeeds) {
      const status = subIds.has(f.id) ? '🔔' : '🔕';
      description += `${status} ${f.name}\n`;
    }
    description += '\n';
  }

  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle('📬  Gestion de vos abonnements')
    .setDescription(description)
    .setFooter({ text: 'Cliquez sur un bouton ci-dessous pour vous abonner/désabonner.' })
    .setTimestamp();

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  const chunks = chunkArray(feeds, 5);
  for (const chunk of chunks.slice(0, 5)) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const feed of chunk) {
      const subscribed = subIds.has(feed.id);
      const theme = getCategoryTheme(feed.category);
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`dm:toggle:${feed.id}`)
          .setLabel(truncate(feed.name, 40))
          .setStyle(subscribed ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setEmoji(subscribed ? '🔔' : theme.emoji),
      );
    }
    rows.push(row);
  }

  await user.send({ embeds: [embed], components: rows });
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size),
  );
}
