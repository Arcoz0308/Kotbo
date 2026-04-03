import { EmbedBuilder, type Client, type TextChannel } from 'discord.js';
import prisma from '../utils/db.js';
import { logger } from '../utils/logger.js';
import { COLORS, truncate, categoryEmoji } from '../utils/embeds.js';
import { getDailyAlgoButtonRow } from './dailyAlgoService.js';

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
    logger.info('Digest', `Aucun article pour la guilde ${guildId}, envoi ignoré.`);
    return;
  }

  const digestTypeStr = guild.digestFrequency === 'WEEKLY' ? 'hebdomadaire' : 'quotidien';

  // Group by category
  const byCategory = new Map<string, typeof items>();
  for (const item of items) {
    const cat = item.feed.category;
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(item);
  }

  const categoryChunks = chunkEntries(Array.from(byCategory.entries()), 25);
  const embeds = categoryChunks.map((chunk, index) => {
    const embed = new EmbedBuilder()
      .setColor(COLORS.info)
      .setTitle(
        `📰 Digest ${digestTypeStr} du ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}` +
        (categoryChunks.length > 1 ? ` (${index + 1}/${categoryChunks.length})` : '')
      )
      .setDescription(`**${items.length} article${items.length > 1 ? 's' : ''}** validé${items.length > 1 ? 's' : ''} ${guild.digestFrequency === 'WEEKLY' ? 'cette semaine' : 'aujourd\'hui'}`)
      .setTimestamp()
      .setFooter({ text: `Kotbo News · Digest ${digestTypeStr}` });

    for (const [category, catItems] of chunk) {
      const lines = catItems
        .map((i) => `• [${truncate(i.titleTranslated ?? i.title, 80)}](${i.url})`)
        .join('\n');
      embed.addFields({
        name: `${categoryEmoji(category)} ${category}`,
        value: truncate(lines, 1024),
      });
    }

    return embed;
  });

  const mention = guild.digestRoleId ? `<@&${guild.digestRoleId}>` : null;
  const customText = guild.digestCustomText ? guild.digestCustomText : null;
  
  const contentParts = [mention, customText].filter(Boolean);
  const content = contentParts.length > 0 ? contentParts.join('\n\n') : undefined;

  for (let index = 0; index < embeds.length; index += 10) {
    const batch = embeds.slice(index, index + 10);
    await channel.send({
      content: index === 0 ? content : undefined,
      embeds: batch,
    });
  }
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
  return '08:00';
}

function chunkEntries<T>(entries: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < entries.length; index += size) {
    chunks.push(entries.slice(index, index + size));
  }
  return chunks;
}

export async function sendDailyAlgo(client: Client, guildId: string): Promise<void> {
  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
  });

  if (!guild || !guild.dailyAlgoEnabled) return;

  const channelId = guild.dailyAlgoChannelId;
  if (!channelId) return;

  const channel = await client.channels.fetch(channelId).catch(() => null) as TextChannel | null;
  if (!channel) return;

  const problems = await prisma.dailyAlgoProblem.findMany({
    where: { language: 'fr' },
  });

  if (problems.length === 0) {
    logger.warn('DailyAlgo', `Aucun problème trouvé pour la guilde ${guildId}.`);
    return;
  }

  const randomIndex = Math.floor(Math.random() * problems.length);
  const problem = problems[randomIndex]!;

  const run = await prisma.dailyAlgoRun.create({
    data: {
      guildId: guild.id,
      problemId: problem.id,
      challengeChannelId: channel.id,
      validationChannelId: guild.dailyAlgoValidationChannelId ?? null,
    },
  });

  const today = new Date().toLocaleDateString('fr-FR', { 
    day: '2-digit', 
    month: 'long', 
    year: 'numeric' 
  });

  const embed = new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle(`💻 Daily Algo du ${today}`)
    .addFields({
      name: '📌 Problème',
      value: `**${truncate(problem.title, 220)}**\n\n${truncate(problem.description, 900)}`,
    })
    .addFields({
      name: '⚙️ Difficulté',
      value: `\`${truncate(problem.difficulty, 32)}\``,
      inline: true,
    })
    .addFields({
      name: '📩 Salon des réponses',
      value: run.validationChannelId ? `<#${run.validationChannelId}>` : `<#${channel.id}>`,
      inline: true,
    })
    .setDescription('Clique sur le bouton ci-dessous pour soumettre ta solution. Un modérateur pourra ensuite la valider ou la rejeter.')
    .setTimestamp()
    .setFooter({ text: 'Kotbo · Daily Algo' });

  const row = getDailyAlgoButtonRow(run.id);

  const message = await channel.send({ embeds: [embed], components: [row] });

  await prisma.dailyAlgoRun.update({
    where: { id: run.id },
    data: { challengeMessageId: message.id },
  });

  logger.success('DailyAlgo', `Daily Algo envoyé pour la guilde ${guildId}`);
}

export async function runDailyAlgoForAllGuilds(client: Client): Promise<void> {
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const allGuilds = await prisma.guild.findMany({
    where: { dailyAlgoEnabled: true },
  });

  logger.debug('DailyAlgo', `${allGuilds.length} guilds avec daily algo activé`);

  const matchingGuilds = allGuilds.filter((guild) => {
    const normalizedTime = normalizeTime(guild.dailyAlgoTime);
    return normalizedTime === currentTime;
  });

  if (matchingGuilds.length > 0) {
    logger.info('DailyAlgo', `${matchingGuilds.length} guild(s) à ${currentTime}`);
  }

  for (const guild of matchingGuilds) {
    await sendDailyAlgo(client, guild.id).catch((e) =>
      logger.error('DailyAlgo', `Error for guild ${guild.id}:`, e),
    );
  }
}
