import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Client,
  type TextChannel,
} from 'discord.js';
import prisma from '../utils/db.js';
import { logger } from '../utils/logger.js';
import { COLORS, truncate } from '../utils/embeds.js';

export type DailyAlgoDispatchResult = {
  status: 'created' | 'resent' | 'exists';
  runId: string;
  problemTitle: string;
  dateKey: string;
};

type DailyAlgoRunMessageData = {
  id: string;
  challengeChannelId: string;
  validationChannelId: string | null;
  challengeMessageId: string | null;
  problem: {
    title: string;
    description: string;
    difficulty: string;
  };
};

export function getDailyAlgoButtonRow(runId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`daily-algo-submit:${runId}`)
      .setLabel('📝 Soumettre ma solution')
      .setStyle(ButtonStyle.Primary),
  );
}

export function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function formatDailyAlgoDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map((value) => Number(value));

  if (!year || !month || !day) {
    return dateKey;
  }

  return new Date(year, month - 1, day).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function buildDailyAlgoEmbed(params: {
  title: string;
  problemTitle: string;
  description: string;
  difficulty: string;
  validationChannelId: string | null;
  footerText?: string;
}) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle(params.title)
    .addFields({
      name: '📌 Problème',
      value: `**${truncate(params.problemTitle, 220)}**\n\n${truncate(params.description, 900)}`,
    })
    .addFields({
      name: '⚙️ Difficulté',
      value: `\`${truncate(params.difficulty, 32)}\``,
      inline: true,
    })
    .addFields({
      name: '📩 Salon des réponses',
      value: params.validationChannelId ? `<#${params.validationChannelId}>` : 'Salon configuré du Daily Algo',
      inline: true,
    })
    .setTimestamp()
    .setFooter({ text: params.footerText ?? 'Kotbo · Daily Algo' });

  return embed;
}

async function sendDailyAlgoRunMessage(client: Client, run: DailyAlgoRunMessageData) {
  const channel = await client.channels.fetch(run.challengeChannelId).catch(() => null) as TextChannel | null;

  if (!channel) {
    throw new Error('Le salon du Daily Algo est introuvable.');
  }

  const dateLabel = formatDailyAlgoDate(getLocalDateKey());
  const embed = buildDailyAlgoEmbed({
    title: `💻 Daily Algo du ${dateLabel}`,
    problemTitle: run.problem.title,
    description: run.problem.description,
    difficulty: run.problem.difficulty,
    validationChannelId: run.validationChannelId,
  });

  return channel.send({
    embeds: [embed],
    components: [getDailyAlgoButtonRow(run.id)],
  });
}

export function buildDailyAlgoValidationButtons(submissionId: string, disabled = false) {
  const approve = new ButtonBuilder()
    .setCustomId(`validate:approve:daily-algo:${submissionId}`)
    .setLabel('Valider')
    .setEmoji('✅')
    .setStyle(ButtonStyle.Success)
    .setDisabled(disabled);

  const reject = new ButtonBuilder()
    .setCustomId(`validate:reject:daily-algo:${submissionId}`)
    .setLabel('Rejeter')
    .setEmoji('❌')
    .setStyle(ButtonStyle.Danger)
    .setDisabled(disabled);

  return [new ActionRowBuilder<ButtonBuilder>().addComponents(approve, reject)];
}

export async function queueDailyAlgoSubmission(params: {
  client: Client;
  runId: string;
  authorId: string;
  authorName: string;
  solution: string;
}): Promise<void> {
  const run = await prisma.dailyAlgoRun.findUnique({
    where: { id: params.runId },
    include: {
      guild: true,
      problem: true,
    },
  });

  if (!run) {
    throw new Error('Le Daily Algo demandé est introuvable.');
  }

  if (run.summarySentAt) {
    throw new Error('Ce Daily Algo est déjà clôturé.');
  }

  const channelId = run.validationChannelId ?? run.guild.dailyAlgoValidationChannelId ?? run.challengeChannelId;
  const channel = await params.client.channels.fetch(channelId).catch(() => null) as TextChannel | null;

  if (!channel) {
    throw new Error('Le salon de validation Daily Algo est introuvable.');
  }

  const submission = await prisma.dailyAlgoSubmission.create({
    data: {
      runId: run.id,
      authorId: params.authorId,
      authorName: params.authorName,
      solution: params.solution,
    },
  });

  const embed = new EmbedBuilder()
    .setColor(COLORS.warning)
    .setTitle('🧪 Réponse Daily Algo à valider')
    .addFields(
      { name: 'Auteur', value: submission.authorName, inline: true },
      { name: 'Défi', value: truncate(run.problem.title, 256), inline: true },
      { name: 'Statut', value: 'En attente de validation', inline: true },
    )
    .setDescription(`\`\`\`\n${truncate(params.solution, 1800)}\n\`\`\``)
    .setTimestamp()
    .setFooter({ text: 'Kotbo · Daily Algo' });

  const message = await channel.send({
    embeds: [embed],
    components: buildDailyAlgoValidationButtons(submission.id),
  });

  await prisma.dailyAlgoSubmission.update({
    where: { id: submission.id },
    data: { validationMessageId: message.id },
  });

  logger.success('DailyAlgo', `Réponse de ${submission.authorName} envoyée en validation pour la guilde ${run.guildId}`);
}

export async function getPreviousDailyAlgoRun(guildId: string) {
  const todayKey = getLocalDateKey();

  return prisma.dailyAlgoRun.findFirst({
    where: {
      guildId,
      dateKey: {
        lt: todayKey,
      },
    },
    orderBy: {
      dateKey: 'desc',
    },
    select: {
      id: true,
      dateKey: true,
      createdAt: true,
      problem: {
        select: {
          title: true,
          description: true,
          difficulty: true,
        },
      },
    },
  });
}

export async function reviewDailyAlgoSubmission(params: {
  client: Client;
  submissionId: string;
  action: 'approve' | 'reject';
  moderatorId: string;
}): Promise<boolean> {
  const submission = await prisma.dailyAlgoSubmission.findUnique({
    where: { id: params.submissionId },
    include: {
      run: {
        include: {
          guild: true,
          problem: true,
        },
      },
    },
  });

  if (!submission) {
    return false;
  }

  if (submission.status !== 'PENDING') {
    return false;
  }

  const status = params.action === 'approve' ? 'APPROVED' : 'REJECTED';

  await prisma.dailyAlgoSubmission.update({
    where: { id: submission.id },
    data: {
      status,
      validatedAt: new Date(),
      validatedById: params.moderatorId,
    },
  });

  if (!submission.validationMessageId) {
    return true;
  }

  const channelId = submission.run.validationChannelId ?? submission.run.guild.dailyAlgoValidationChannelId ?? submission.run.challengeChannelId;
  const channel = await params.client.channels.fetch(channelId).catch(() => null) as TextChannel | null;
  if (!channel) {
    return true;
  }

  const message = await channel.messages.fetch(submission.validationMessageId).catch(() => null);
  if (!message) {
    return true;
  }

  const moderator = await params.client.users.fetch(params.moderatorId).catch(() => null);
  const titlePrefix = params.action === 'approve' ? '✅ Réponse validée' : '❌ Réponse rejetée';
  const footerLabel = moderator
    ? `${titlePrefix} par ${moderator.globalName ?? moderator.username}`
    : titlePrefix;

  const embed = EmbedBuilder.from(message.embeds[0] ?? new EmbedBuilder().setTitle('Réponse Daily Algo'))
    .setColor(params.action === 'approve' ? COLORS.success : COLORS.danger)
    .setFooter({ text: `Kotbo · ${footerLabel}` });

  await message.edit({
    embeds: [embed],
    components: buildDailyAlgoValidationButtons(submission.id, true),
  });

  return true;
}

export async function sendDailyAlgoSummaryForGuild(client: Client, guildId: string): Promise<void> {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const runs = await prisma.dailyAlgoRun.findMany({
    where: {
      guildId,
      createdAt: { gte: startOfDay },
      summarySentAt: null,
    },
    select: {
      id: true,
      challengeChannelId: true,
      validationChannelId: true,
    },
  });

  if (runs.length === 0) {
    return;
  }

  const submissions = await prisma.dailyAlgoSubmission.findMany({
    where: {
      runId: { in: runs.map((run) => run.id) },
      status: 'APPROVED',
    },
    orderBy: { validatedAt: 'asc' },
  });

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    return;
  }

  const channelId = runs[0]?.challengeChannelId ?? runs[0]?.validationChannelId ?? null;
  if (!channelId) {
    return;
  }

  const channel = await client.channels.fetch(channelId).catch(() => null) as TextChannel | null;
  if (!channel) {
    return;
  }

  const uniqueWinners = new Map<string, string>();
  for (const submission of submissions) {
    if (uniqueWinners.has(submission.authorId)) continue;

    const member = await guild.members.fetch(submission.authorId).catch(() => null);
    uniqueWinners.set(
      submission.authorId,
      member?.displayName ?? submission.authorName,
    );
  }

  const dayLabel = now.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const summaryLines = [...uniqueWinners.values()].map((name) => `• ${name}`);
  const title = `🏁 Bilan du Daily Algo du ${dayLabel}`;

  if (summaryLines.length === 0) {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.info)
          .setTitle(title)
          .setDescription('Aucune réponse validée aujourd\'hui.')
          .setTimestamp()
          .setFooter({ text: 'Kotbo · Daily Algo' }),
      ],
    });
  } else {
    const chunks = splitLines(summaryLines, 3500);
    for (const [index, chunk] of chunks.entries()) {
      const successCount = uniqueWinners.size;
      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.success)
            .setTitle(chunks.length > 1 ? `${title} (${index + 1}/${chunks.length})` : title)
            .setDescription(
              `${successCount} personne${successCount > 1 ? 's' : ''} ${successCount > 1 ? 'ont' : 'a'} validé le Daily Algo aujourd'hui.\n\n${chunk}`,
            )
            .setTimestamp()
            .setFooter({ text: 'Kotbo · Daily Algo' }),
        ],
      });
    }
  }

  await prisma.dailyAlgoRun.updateMany({
    where: {
      id: { in: runs.map((run) => run.id) },
      summarySentAt: null,
    },
    data: { summarySentAt: new Date() },
  });

  logger.success('DailyAlgo', `Bilan Daily Algo envoyé pour la guilde ${guildId}`);
}

export async function runDailyAlgoSummariesForAllGuilds(client: Client): Promise<void> {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const runs = await prisma.dailyAlgoRun.findMany({
    where: {
      createdAt: { gte: startOfDay },
      summarySentAt: null,
    },
    select: { guildId: true },
    distinct: ['guildId'],
  });

  for (const run of runs) {
    await sendDailyAlgoSummaryForGuild(client, run.guildId).catch((error) =>
      logger.error('DailyAlgo', `Erreur lors du bilan pour la guilde ${run.guildId}:`, error),
    );
  }
}

function splitLines(lines: string[], maxLength: number): string[] {
  const chunks: string[] = [];
  let current = '';

  for (const line of lines) {
    const next = current.length === 0 ? line : `${current}\n${line}`;
    if (next.length > maxLength) {
      if (current.length > 0) {
        chunks.push(current);
        current = line;
      } else {
        chunks.push(line.slice(0, maxLength));
        current = '';
      }
    } else {
      current = next;
    }
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

export async function sendDailyAlgo(client: Client, guildId: string): Promise<DailyAlgoDispatchResult> {
  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
  });

  if (!guild) {
    throw new Error('La guilde Daily Algo est introuvable.');
  }

  if (!guild.dailyAlgoEnabled) {
    throw new Error('Le Daily Algo n\'est pas activé pour ce serveur.');
  }

  const channelId = guild.dailyAlgoChannelId;
  if (!channelId) {
    throw new Error('Le salon du Daily Algo n\'est pas configuré.');
  }

  const dateKey = getLocalDateKey();
  const existingRun: any = await prisma.dailyAlgoRun.findUnique({
    where: {
      guildId_dateKey: {
        guildId,
        dateKey,
      },
    },
    select: {
      id: true,
      challengeChannelId: true,
      validationChannelId: true,
      challengeMessageId: true,
      problem: {
        select: {
          title: true,
          description: true,
          difficulty: true,
        },
      },
    },
  });

  if (existingRun?.challengeMessageId) {
    logger.info('DailyAlgo', `Daily Algo déjà publié pour ${guildId} le ${dateKey}`);
    return {
      status: 'exists',
      runId: existingRun.id,
      problemTitle: existingRun.problem.title,
      dateKey,
    };
  }

  let run: any = existingRun;

  if (!run) {
    const problemCandidates: any[] = await prisma.dailyAlgoProblem.findMany({
      where: {
        language: 'fr',
        usedAt: null,
      },
      orderBy: [
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
    });

    if (problemCandidates.length === 0) {
      throw new Error('Aucun Daily Algo disponible. Ajoute de nouveaux problèmes dans la base.');
    }

    for (const candidate of problemCandidates) {
      try {
        const createdRun: any = await prisma.$transaction(async (tx) => {
          const createdRun = await tx.dailyAlgoRun.create({
            data: {
              guildId: guild.id,
              dateKey,
              problemId: candidate.id,
              challengeChannelId: channelId,
              validationChannelId: guild.dailyAlgoValidationChannelId ?? null,
            },
            include: {
              problem: true,
            },
          });

          const reservedProblem: any = await tx.dailyAlgoProblem.updateMany({
            where: {
              id: candidate.id,
              usedAt: null,
            },
            data: {
              usedAt: new Date(),
            },
          });

          if (reservedProblem.count === 0) {
            throw new Error('Le problème Daily Algo a déjà été utilisé.');
          }

          return {
            id: createdRun.id,
            challengeChannelId: createdRun.challengeChannelId,
            validationChannelId: createdRun.validationChannelId,
            challengeMessageId: createdRun.challengeMessageId,
            problem: {
              title: createdRun.problem.title,
              description: createdRun.problem.description,
              difficulty: createdRun.problem.difficulty,
            },
          } as DailyAlgoRunMessageData;
        });

        run = createdRun;

        break;
      } catch (error) {
        logger.warn('DailyAlgo', `Impossible de réserver le problème ${candidate.id}, nouvel essai...`, error);

        const currentRun: any = await prisma.dailyAlgoRun.findUnique({
          where: {
            guildId_dateKey: {
              guildId,
              dateKey,
            },
          },
          select: {
            id: true,
            challengeChannelId: true,
            validationChannelId: true,
            challengeMessageId: true,
            problem: {
              select: {
                title: true,
                description: true,
                difficulty: true,
              },
            },
          },
        });
        if (currentRun) {
          run = currentRun;
          break;
        }
      }
    }

    if (!run) {
      throw new Error('Impossible de réserver un Daily Algo disponible.');
    }
  }

  if (!run.challengeMessageId) {
    const message = await sendDailyAlgoRunMessage(client, run);

    await prisma.dailyAlgoRun.update({
      where: { id: run.id },
      data: { challengeMessageId: message.id },
    });

    logger.success('DailyAlgo', `Daily Algo envoyé pour la guilde ${guildId}`);

    return {
      status: existingRun ? 'resent' : 'created',
      runId: run.id,
      problemTitle: run.problem.title,
      dateKey,
    };
  }

  return {
    status: 'exists',
    runId: run.id,
    problemTitle: run.problem.title,
    dateKey,
  };
}
