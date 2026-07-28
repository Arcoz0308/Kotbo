import prisma, { prismaRead } from '../../utils/db.js';
import type { Prisma } from '@prisma/client';
import { logger } from '../../utils/logger.js';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Client,
} from 'discord.js';
import { COLORS } from '../../utils/embeds.js';

type SatisfactionPerson = {
  userId: string;
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
};

type SatisfactionReview = {
  rating: number;
  staffId: string | null;
  userId: string;
  comment: string | null;
  createdAt: Date;
  ticketId: string;
};

type StaffSatisfactionRow = {
  staffId: string | null;
  _avg: { rating: number | null };
  _count: { rating: number };
};

function bestDisplayName(profile: {
  userId: string;
  displayName?: string | null;
  globalName?: string | null;
  username?: string | null;
  userTag?: string | null;
}): string {
  return profile.displayName || profile.globalName || profile.username || profile.userTag || `Utilisateur ${profile.userId}`;
}

async function resolveSatisfactionPeople(
  guildId: string,
  userIds: string[],
  client?: Client,
): Promise<Map<string, SatisfactionPerson>> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const people = new Map<string, SatisfactionPerson>();
  if (uniqueIds.length === 0) return people;

  const [profiles, staffMembers] = await Promise.all([
    prismaRead.memberProfile.findMany({
      where: { guildId, userId: { in: uniqueIds } },
      select: {
        userId: true,
        userTag: true,
        username: true,
        globalName: true,
        displayName: true,
        avatarUrl: true,
      },
    }),
    prismaRead.staffMember.findMany({
      where: { guildId, userId: { in: uniqueIds } },
      select: {
        userId: true,
        userTag: true,
        username: true,
        displayName: true,
        avatarUrl: true,
      },
    }),
  ]);

  for (const staff of staffMembers) {
    people.set(staff.userId, {
      userId: staff.userId,
      username: staff.username ?? staff.userTag ?? null,
      displayName: bestDisplayName(staff),
      avatarUrl: staff.avatarUrl ?? null,
    });
  }

  for (const profile of profiles) {
    people.set(profile.userId, {
      userId: profile.userId,
      username: profile.username ?? profile.userTag ?? null,
      displayName: bestDisplayName(profile),
      avatarUrl: profile.avatarUrl ?? null,
    });
  }

  if (client) {
    const missingIds = uniqueIds.filter((userId) => !people.get(userId)?.avatarUrl || !people.get(userId)?.displayName);
    await Promise.all(missingIds.map(async (userId) => {
      const discordUser = await client.users.fetch(userId).catch(() => null);
      if (!discordUser) return;
      const existing = people.get(userId);
      const discordDisplayName = discordUser.globalName ?? discordUser.username;
      const existingDisplayName = existing?.displayName;
      people.set(userId, {
        userId,
        username: existing?.username ?? discordUser.username,
        displayName: existingDisplayName && !existingDisplayName.startsWith('Utilisateur ')
          ? existingDisplayName
          : discordDisplayName,
        avatarUrl: existing?.avatarUrl ?? discordUser.displayAvatarURL(),
      });
    }));
  }

  for (const userId of uniqueIds) {
    if (!people.has(userId)) {
      people.set(userId, {
        userId,
        username: null,
        displayName: `Utilisateur ${userId}`,
        avatarUrl: null,
      });
    }
  }

  return people;
}

export async function sendSatisfactionSurvey(client: Client, guildId: string, ticketId: string, userId: string, _staffId?: string): Promise<void> {
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

export async function getStaffSatisfactionStats(guildId: string, staffId?: string, client?: Client) {
  const where: Prisma.TicketSatisfactionWhereInput = { guildId };
  if (staffId) where.staffId = staffId;

  const [stats, recentRaw] = await Promise.all([
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
  const recent = recentRaw as SatisfactionReview[];

  const distribution = await prismaRead.ticketSatisfaction.groupBy({
    by: ['rating'],
    where,
    _count: { rating: true },
    orderBy: { rating: 'asc' },
  });

  const people = await resolveSatisfactionPeople(
    guildId,
    recent.flatMap((review) => [review.userId, review.staffId].filter((id): id is string => Boolean(id))),
    client,
  );

  return {
    averageRating: stats._avg.rating ?? 0,
    totalResponses: stats._count.rating,
    distribution: distribution.map((d) => ({ rating: d.rating, count: d._count.rating })),
    recent: recent.map((review) => ({
      ...review,
      user: people.get(review.userId) ?? null,
      staff: review.staffId ? people.get(review.staffId) ?? null : null,
    })),
  };
}

export async function getSatisfactionDashboardData(guildId: string, client?: Client) {
  const [global, byStaffRaw] = await Promise.all([
    getStaffSatisfactionStats(guildId, undefined, client),
    prismaRead.ticketSatisfaction.groupBy({
      by: ['staffId'],
      where: { guildId, staffId: { not: null } },
      _avg: { rating: true },
      _count: { rating: true },
      orderBy: { _avg: { rating: 'desc' } },
    }),
  ]);
  const byStaff = byStaffRaw as StaffSatisfactionRow[];

  const staffPeople = await resolveSatisfactionPeople(
    guildId,
    byStaff.map((s) => s.staffId).filter((staffId): staffId is string => Boolean(staffId)),
    client,
  );

  return {
    global,
    byStaff: byStaff.map((s) => ({
      staffId: s.staffId!,
      staff: staffPeople.get(s.staffId!) ?? null,
      averageRating: s._avg.rating ?? 0,
      totalResponses: s._count.rating,
    })),
  };
}
