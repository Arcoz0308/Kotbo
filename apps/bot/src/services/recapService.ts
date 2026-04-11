import { type Client, type TextChannel, AttachmentBuilder } from 'discord.js';
import prisma from '../utils/db.js';
import { logger } from '../utils/logger.js';
import { generateWeeklyRecapImage } from './imageService.js';

/**
 * Récupère les 5 meilleurs articles de la semaine pour une guilde donnée
 * basés sur le score d'intérêt (interestScore)
 */
export async function getWeeklyTopItems(guildId: string, limit = 5) {
  const since = new Date();
  since.setDate(since.getDate() - 7);

  // On récupère les flux de la guilde
  const feeds = await prisma.feed.findMany({
    where: { guildId },
    select: { id: true }
  });

  const feedIds = feeds.map(f => f.id);

  return prisma.feedItem.findMany({
    where: {
      feedId: { in: feedIds },
      status: 'APPROVED',
      createdAt: { gte: since },
      interestScore: { not: null }
    },
    orderBy: [
      { interestScore: 'desc' },
      { publishedAt: 'desc' }
    ],
    take: limit,
    include: { feed: true }
  });
}

/**
 * Génère et envoie le recap hebdomadaire pour une guilde
 */
export async function sendWeeklyRecap(client: Client, guildId: string) {
  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
  });

  if (!guild || !guild.publicChannelId) {
    logger.warn('Recap', `Recap annulé pour ${guildId} : salon public non configuré.`);
    return;
  }

  const topItems = await getWeeklyTopItems(guildId);
  
  if (topItems.length < 3) {
    logger.info('Recap', `Pas assez d'articles (${topItems.length}) pour envoyer un recap à ${guildId}.`);
    return;
  }

  try {
    const imageBuffer = await generateWeeklyRecapImage(guildId, topItems);
    const attachment = new AttachmentBuilder(imageBuffer, { name: `recap-weekly-${Date.now()}.png` });

    const channel = await client.channels.fetch(guild.publicChannelId).catch(() => null) as TextChannel | null;
    if (!channel) return;

    await channel.send({
      content: '🌟 **Le Recap Hebdomadaire Kotbo est là !** 🌟\nVoici les actus tech qui ont marqué la communauté cette semaine.',
      files: [attachment]
    });

    logger.success('Recap', `Recap hebdomadaire envoyé pour la guilde ${guildId}`);
  } catch (error) {
    logger.error('Recap', `Erreur lors de la génération/envoi du recap pour ${guildId}:`, error);
  }
}

/**
 * Lance le recap pour toutes les guildes éligibles
 */
export async function runWeeklyRecapForAllGuilds(client: Client) {
  const guilds = await prisma.guild.findMany({
    where: { publicChannelId: { not: null } }
  });

  logger.info('Recap', `Démarrage des recaps pour ${guilds.length} guildes...`);

  for (const guild of guilds) {
    await sendWeeklyRecap(client, guild.id);
  }
}
