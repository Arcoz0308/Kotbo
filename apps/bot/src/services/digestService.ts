import { EmbedBuilder, type Client, type TextChannel } from 'discord.js';
import prisma from '../utils/db.js';
import { logger } from '../utils/logger.js';
import { COLORS, truncate, categoryEmoji } from '../utils/embeds.js';
import { getDailyAlgoButtonRow } from '../handlers/dailyAlgoHandler.js';

export async function sendDigest(client: Client, guildId: string): Promise<void> {
  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    include: { feeds: { where: { enabled: true } } },
  });
  if (!guild || !guild.digestEnabled) return;

  const channelId = guild.digestChannelId ?? guild.publicChannelId;
  if (!channelId) return;

  const channel = await client.channels.fetch(channelId).catch(() => null) as TextChannel | null;
  if (!channel) return;

  const since = new Date();
  since.setHours(0, 0, 0, 0);

  if (guild.digestFrequency === 'WEEKLY') {
    since.setDate(since.getDate() - 7);
  }

  const feedIds = guild.feeds.map((f) => f.id);
  const items = await prisma.feedItem.findMany({
    where: {
      feedId: { in: feedIds },
      status: 'APPROVED',
      createdAt: { gte: since },
    },
    include: { feed: true },
    orderBy: { publishedAt: 'desc' },
    take: guild.digestCount,
  });

  if (items.length === 0) {
    logger.info('Digest', `No items for guild ${guildId}, skipping`);
    return;
  }

  // Group by category
  const byCategory = new Map<string, typeof items>();
  for (const item of items) {
    const cat = item.feed.category;
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(item);
  }

  const digestTypeStr = guild.digestFrequency === 'WEEKLY' ? 'hebdomadaire' : 'quotidien';
  const embed = new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle(`📰 Digest ${digestTypeStr} du ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`)
    .setDescription(`**${items.length} article${items.length > 1 ? 's' : ''}** validé${items.length > 1 ? 's' : ''} ${guild.digestFrequency === 'WEEKLY' ? 'cette semaine' : 'aujourd\'hui'}`)
    .setTimestamp()
    .setFooter({ text: `Kotbo News · Digest ${digestTypeStr}` });

  for (const [category, catItems] of byCategory) {
    const lines = catItems
      .map((i) => `• [${truncate(i.titleTranslated ?? i.title, 80)}](${i.url})`)
      .join('\n');
    embed.addFields({
      name: `${categoryEmoji(category)} ${category}`,
      value: truncate(lines, 1024),
    });
  }

  const mention = guild.digestRoleId ? `<@&${guild.digestRoleId}>` : null;
  const customText = guild.digestCustomText ? guild.digestCustomText : null;
  
  const contentParts = [mention, customText].filter(Boolean);
  const content = contentParts.length > 0 ? contentParts.join('\n\n') : undefined;

  await channel.send({ content, embeds: [embed] });
  logger.success('Digest', `Sent ${digestTypeStr} digest for guild ${guildId} (${items.length} items)`);
}

export async function runDigestForAllGuilds(client: Client): Promise<void> {
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const currentDay = now.getDay(); // 0 = Sunday

  const allGuilds = await prisma.guild.findMany({
    where: { digestEnabled: true },
  });

  logger.debug('Digest', `${allGuilds.length} guilds avec digest activé`);

  const matchingGuilds = allGuilds.filter((guild) => {
    const normalizedTime = normalizeTime(guild.digestTime);
    return normalizedTime === currentTime;
  });

  if (matchingGuilds.length > 0) {
    logger.info('Digest', `${matchingGuilds.length} guild(s) à ${currentTime}`);
  }

  for (const guild of matchingGuilds) {
    // Si c'est un digest hebdomadaire, on ne l'envoie que le dimanche (0)
    if (guild.digestFrequency === 'WEEKLY' && currentDay !== 0) {
      logger.debug('Digest', `Guild ${guild.id}: digest hebdomadaire, skipped (pas dimanche, today=${currentDay})`);
      continue;
    }
    await sendDigest(client, guild.id).catch((e) =>
      logger.error('Digest', `Error for guild ${guild.id}:`, e),
    );
  }
}

function normalizeTime(time: string): string {
  if (/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
    return time;
  }
  
  if (/^[0-9]:[0-5][0-9]$/.test(time)) {
    return '0' + time;
  }
  
  logger.warn('Digest', `Format d'heure invalide: "${time}", utilisant la valeur par défaut "08:00"`);
 

export async function sendDailyAlgo(client: Client, guildId: string): Promise<void> {
  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
  });

  if (!guild || !guild.dailyAlgoEnabled) return;

  const channelId = guild.dailyAlgoChannelId;
  if (!channelId) return;

  const channel = await client.channels.fetch(channelId).catch(() => null) as TextChannel | null;
  if (!channel) return;

  const today = new Date().toLocaleDateString('fr-FR', { 
    day: '2-digit', 
    month: 'long', 
    year: 'numeric' 
  });

  const embed = new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle(`💻 Daily Algo du ${today}`)
    .setDescription('Trouve la solution à ce problème algorithmique quotidien !\n\nClique sur le bouton ci-dessous pour soumettre ta solution.')
    .setTimestamp()
    .setFooter({ text: 'Kotbo · Daily Algo' });

  const row = getDailyAlgoButtonRow();

  await channel.send({ embeds: [embed], components: [row] });
  logger.success('DailyAlgo', `Sent daily algo for guild ${guildId}`);
} return '08:00';
}
