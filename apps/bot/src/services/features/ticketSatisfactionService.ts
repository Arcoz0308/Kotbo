import prisma, { prismaRead } from '../../utils/db.js';
import { logger } from '../../utils/logger.js';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Client,
  type User,
} from 'discord.js';
import { COLORS } from '../../utils/embeds.js';

export async function sendSatisfactionSurvey(client: Client, guildId: string, ticketId: string, userId: string, staffId?: string): Promise<void> {
  try {
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) return;

    const existing = await prismaRead.ticketSatisfaction.findUnique({
      where: { guildId_ticketId_userId: { guildId, ticketId, userId } },
    });
    if (existing) return;

    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle('📋 Votre avis compte !')
      .setDescription('Votre ticket vient d\'être résolu. Comment évaluez-vous la qualité du support reçu ?')
      .setFooter({ text: `Kotbo • Ticket #${ticketId.slice(-6)}` })
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`satisfaction:${guildId}:${ticketId}:1`).setEmoji('😡').setLabel('1').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`satisfaction:${guildId}:${ticketId}:2`).setEmoji('😕').setLabel('2').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`satisfaction:${guildId}:${ticketId}:3`).setEmoji('😐').setLabel('3').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`satisfaction:${guildId}:${ticketId}:4`).setEmoji('🙂').setLabel('4').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`satisfaction:${guildId}:${ticketId}:5`).setEmoji('🤩').setLabel('5').setStyle(ButtonStyle.Success),
    );

    await user.send({ embeds: [embed], components: [row], allowedMentions: { parse: [] } }).catch(() => {
      logger.debug('TicketSatisfaction', `Impossible d'envoyer le sondage à ${userId} (DM fermés)`);
    });
  } catch (error) {
    logger.error('TicketSatisfaction', 'Erreur envoi sondage:', error);
  }
}

export async function recordSatisfaction(guildId: string, ticketId: string, userId: string, rating: number, staffId?: string): Promise<boolean> {
  try {
    await prisma.ticketSatisfaction.upsert({
      where: { guildId_ticketId_userId: { guildId, ticketId, userId } },
      create: { guildId, ticketId, userId, staffId, rating },
      update: { rating },
    });
    return true;
  } catch (error) {
    logger.error('TicketSatisfaction', 'Erreur enregistrement:', error);
    return false;
  }
}

export async function getStaffSatisfactionStats(guildId: string, staffId?: string) {
  const where: any = { guildId };
  if (staffId) where.staffId = staffId;

  const [stats, recent] = await Promise.all([
    prismaRead.ticketSatisfaction.aggregate({
      where,
      _avg: { rating: true },
      _count: { rating: true },
    }),
    prismaRead.ticketSatisfaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { rating: true, staffId: true, userId: true, comment: true, createdAt: true, ticketId: true },
    }),
  ]);

  const distribution = await prismaRead.ticketSatisfaction.groupBy({
    by: ['rating'],
    where,
    _count: { rating: true },
    orderBy: { rating: 'asc' },
  });

  return {
    averageRating: stats._avg.rating ?? 0,
    totalResponses: stats._count.rating,
    distribution: distribution.map((d) => ({ rating: d.rating, count: d._count.rating })),
    recent,
  };
}

export async function getSatisfactionDashboardData(guildId: string) {
  const [global, byStaff] = await Promise.all([
    getStaffSatisfactionStats(guildId),
    prismaRead.ticketSatisfaction.groupBy({
      by: ['staffId'],
      where: { guildId, staffId: { not: null } },
      _avg: { rating: true },
      _count: { rating: true },
      orderBy: { _avg: { rating: 'desc' } },
    }),
  ]);

  return {
    global,
    byStaff: byStaff.map((s) => ({
      staffId: s.staffId!,
      averageRating: s._avg.rating ?? 0,
      totalResponses: s._count.rating,
    })),
  };
}
