import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Client,
  type TextChannel,
} from 'discord.js';
import { Prisma } from '@prisma/client';
import prisma from '../utils/db.js';
import { logger } from '../utils/logger.js';
import { COLORS, truncate } from '../utils/embeds.js';

// ── Types ──────────────────────────────────────────────────────────────────────

export type DailyAlgoDispatchResult = {
  status: 'created' | 'resent' | 'exists';
  runId: string;
  problemTitle: string;
  dateKey: string;
};

const dailyAlgoRunDispatchSelect = {
  id: true,
  challengeChannelId: true,
  validationChannelId: true,
  challengeMessageId: true,
  leaderboardMessageId: true,
  problem: {
    select: {
      title: true,
      description: true,
      difficulty: true,
    },
  },
} as const;

type DailyAlgoRunMessageData = {
  id: string;
  challengeChannelId: string;
  validationChannelId: string | null;
  challengeMessageId: string | null;
  leaderboardMessageId: string | null;
  problem: {
    title: string;
    description: string;
    difficulty: string;
  };
};

type DailyAlgoRunDispatchPayload = Prisma.DailyAlgoRunGetPayload<{
  select: typeof dailyAlgoRunDispatchSelect;
}>;

function toDailyAlgoRunMessageData(run: DailyAlgoRunDispatchPayload): DailyAlgoRunMessageData {
  return {
    id: run.id,
    challengeChannelId: run.challengeChannelId,
    validationChannelId: run.validationChannelId,
    challengeMessageId: run.challengeMessageId,
    leaderboardMessageId: run.leaderboardMessageId,
    problem: {
      title: run.problem.title,
      description: run.problem.description,
      difficulty: run.problem.difficulty,
    },
  };
}

// ── Speed Bonus Config ─────────────────────────────────────────────────────────

const SPEED_BONUS: Record<number, number> = {
  1: 3,
  2: 2,
  3: 1,
};

function getSpeedBonus(rank: number): number {
  return SPEED_BONUS[rank] ?? 0;
}

// ── Difficulty Emoji ───────────────────────────────────────────────────────────

function difficultyEmoji(difficulty: string): string {
  const d = difficulty.toLowerCase();
  if (d === 'facile') return '🟢';
  if (d === 'moyen') return '🟡';
  if (d === 'difficile') return '🔴';
  return '⚪';
}

// ── Date Utilities ─────────────────────────────────────────────────────────────

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

// ── Button Rows ────────────────────────────────────────────────────────────────

export function getDailyAlgoButtonRow(runId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`daily-algo-submit:${runId}`)
      .setLabel('📝 Soumettre ma solution')
      .setStyle(ButtonStyle.Primary),
  );
}

export function buildDailyAlgoValidationButtons(submissionId: string, disabled = false) {
  const rate = new ButtonBuilder()
    .setCustomId(`validate:rate:daily-algo:${submissionId}`)
    .setLabel('📝 Noter')
    .setStyle(ButtonStyle.Success)
    .setDisabled(disabled);

  const reject = new ButtonBuilder()
    .setCustomId(`validate:reject:daily-algo:${submissionId}`)
    .setLabel('Rejeter')
    .setEmoji('❌')
    .setStyle(ButtonStyle.Danger)
    .setDisabled(disabled);

  return [new ActionRowBuilder<ButtonBuilder>().addComponents(rate, reject)];
}

// ── Embed Builders ─────────────────────────────────────────────────────────────

function buildDailyAlgoChallengeEmbed(params: {
  title: string;
  problemTitle: string;
  description: string;
  difficulty: string;
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
      value: `${difficultyEmoji(params.difficulty)} \`${truncate(params.difficulty, 32)}\``,
      inline: true,
    })
    .addFields({
      name: '⏱️ Bonus rapidité',
      value: '🥇 +3 · 🥈 +2 · 🥉 +1',
      inline: true,
    })
    .setTimestamp()
    .setFooter({ text: params.footerText ?? 'Kotbo · Daily Algo' });

  return embed;
}

// ── Send Challenge Message ─────────────────────────────────────────────────────

async function sendDailyAlgoRunMessage(client: Client, run: DailyAlgoRunMessageData) {
  const channel = await client.channels.fetch(run.challengeChannelId).catch(() => null) as TextChannel | null;

  if (!channel) {
    throw new Error('Le salon du Daily Algo est introuvable.');
  }

  const dateLabel = formatDailyAlgoDate(getLocalDateKey());
  const embed = buildDailyAlgoChallengeEmbed({
    title: `💻 Daily Algo du ${dateLabel}`,
    problemTitle: run.problem.title,
    description: run.problem.description,
    difficulty: run.problem.difficulty,
  });

  return channel.send({
    embeds: [embed],
    components: [getDailyAlgoButtonRow(run.id)],
  });
}

// ── Leaderboard Embed ──────────────────────────────────────────────────────────

function formatScoreBar(score: number): string {
  const filled = '█'.repeat(score);
  const empty = '░'.repeat(5 - score);
  return `${filled}${empty} ${score}/5`;
}

function formatRankMedal(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `#${rank}`;
}

type LeaderboardSubmission = {
  id: string;
  authorId: string;
  authorName: string;
  status: string;
  submittedAt: Date;
  speedRank: number | null;
  speedBonusPoints: number | null;
  scoreCorrectness: number | null;
  scoreComments: number | null;
  scoreCompactness: number | null;
  scoreOptimization: number | null;
  scoreReadability: number | null;
  scoreFinal: number | null;
};

function buildLeaderboardEmbed(submissions: LeaderboardSubmission[], runCreatedAt: Date): EmbedBuilder {
  const approved = submissions
    .filter((s) => s.status === 'APPROVED' && s.scoreFinal !== null)
    .sort((a, b) => {
      const scoreA = (a.scoreFinal ?? 0) + (a.speedBonusPoints ?? 0);
      const scoreB = (b.scoreFinal ?? 0) + (b.speedBonusPoints ?? 0);
      if (scoreB !== scoreA) return scoreB - scoreA;
      return (a.speedRank ?? 999) - (b.speedRank ?? 999);
    });

  const pending = submissions.filter((s) => s.status === 'PENDING');
  const rejected = submissions.filter((s) => s.status === 'REJECTED');

  const embed = new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle('📊 Classement du Daily Algo')
    .setTimestamp()
    .setFooter({ text: 'Kotbo · Daily Algo · Classement en direct' });

  if (submissions.length === 0) {
    embed.setDescription('*Aucune participation pour le moment. Clique sur le bouton ci-dessus pour soumettre ta solution !*');
    return embed;
  }

  const lines: string[] = [];

  // ── Ranked participants ──
  if (approved.length > 0) {
    lines.push('**🏆 Classés**\n');
    for (let i = 0; i < approved.length; i++) {
      const s = approved[i]!;
      const totalScore = (s.scoreFinal ?? 0) + (s.speedBonusPoints ?? 0);
      const medal = formatRankMedal(i + 1);
      const speedTag = s.speedBonusPoints && s.speedBonusPoints > 0
        ? ` ⚡+${s.speedBonusPoints}`
        : '';

      lines.push(`${medal} **${s.authorName}** — **${totalScore.toFixed(1)}** pts${speedTag}`);
      lines.push(`┊ ✅ ${formatScoreBar(s.scoreCorrectness ?? 0)} · 💬 ${formatScoreBar(s.scoreComments ?? 0)}`);
      lines.push(`┊ 📦 ${formatScoreBar(s.scoreCompactness ?? 0)} · ⚡ ${formatScoreBar(s.scoreOptimization ?? 0)}`);
      lines.push(`┊ 🧹 ${formatScoreBar(s.scoreReadability ?? 0)}`);
      lines.push('');
    }
  }

  // ── Pending participants ──
  if (pending.length > 0) {
    lines.push('**⏳ En attente de classement**\n');
    for (const s of pending) {
      const elapsed = timeDiff(runCreatedAt, s.submittedAt);
      const speedLabel = s.speedRank ? ` · ${formatRankMedal(s.speedRank)} arrivé` : '';
      lines.push(`⏳ **${s.authorName}** — soumis après ${elapsed}${speedLabel}`);
    }
    lines.push('');
  }

  // ── Rejected participants ──
  if (rejected.length > 0) {
    lines.push('**❌ Non validés**\n');
    for (const s of rejected) {
      lines.push(`~~${s.authorName}~~`);
    }
  }

  embed.setDescription(truncate(lines.join('\n'), 4000));
  return embed;
}

function timeDiff(from: Date, to: Date): string {
  const diffMs = to.getTime() - from.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}min`;
  const diffH = Math.floor(diffMin / 60);
  const remainMin = diffMin % 60;
  return `${diffH}h${remainMin > 0 ? `${remainMin}min` : ''}`;
}

// ── Update Leaderboard ─────────────────────────────────────────────────────────

export async function updateDailyAlgoLeaderboard(client: Client, runId: string): Promise<void> {
  const run = await prisma.dailyAlgoRun.findUnique({
    where: { id: runId },
    include: {
      submissions: {
        orderBy: { submittedAt: 'asc' },
      },
    },
  });

  if (!run) return;

  const channel = await client.channels.fetch(run.challengeChannelId).catch(() => null) as TextChannel | null;
  if (!channel) return;

  const embed = buildLeaderboardEmbed(run.submissions, run.createdAt);

  if (run.leaderboardMessageId) {
    const message = await channel.messages.fetch(run.leaderboardMessageId).catch(() => null);
    if (message) {
      await message.edit({ embeds: [embed] });
      return;
    }
  }

  // No existing leaderboard message or it was deleted → send new one
  const newMessage = await channel.send({ embeds: [embed] });
  await prisma.dailyAlgoRun.update({
    where: { id: runId },
    data: { leaderboardMessageId: newMessage.id },
  });
}

// ── Queue Submission ───────────────────────────────────────────────────────────

export async function queueDailyAlgoSubmission(params: {
  client: Client;
  runId: string;
  authorId: string;
  authorName: string;
  solution: string;
}): Promise<{ speedRank: number }> {
  const run = await prisma.dailyAlgoRun.findUnique({
    where: { id: params.runId },
    include: {
      guild: true,
      problem: true,
      submissions: {
        orderBy: { submittedAt: 'asc' },
      },
    },
  });

  if (!run) {
    throw new Error('Le Daily Algo demandé est introuvable.');
  }

  if (run.summarySentAt) {
    throw new Error('Ce Daily Algo est déjà clôturé.');
  }

  // Check double submission
  const alreadySubmitted = run.submissions.find((s) => s.authorId === params.authorId);
  if (alreadySubmitted) {
    throw new Error('Tu as déjà soumis une solution pour ce Daily Algo !');
  }

  // Calculate speed rank
  const currentCount = run.submissions.length;
  const speedRank = currentCount + 1;
  const speedBonusPoints = getSpeedBonus(speedRank);

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
      submittedAt: new Date(),
      speedRank,
      speedBonusPoints,
    },
  });

  // Send validation embed to staff channel
  const elapsed = timeDiff(run.createdAt, submission.submittedAt);
  const embed = new EmbedBuilder()
    .setColor(COLORS.warning)
    .setTitle('🧪 Réponse Daily Algo à valider')
    .addFields(
      { name: 'Auteur', value: submission.authorName, inline: true },
      { name: 'Défi', value: truncate(run.problem.title, 256), inline: true },
      { name: 'Rapidité', value: `${formatRankMedal(speedRank)} (${elapsed}) +${speedBonusPoints}pts`, inline: true },
    )
    .setDescription(`\`\`\`\n${truncate(params.solution, 1800)}\n\`\`\``)
    .setTimestamp()
    .setFooter({ text: 'Kotbo · Daily Algo · En attente de notation' });

  const message = await channel.send({
    embeds: [embed],
    components: buildDailyAlgoValidationButtons(submission.id),
  });

  await prisma.dailyAlgoSubmission.update({
    where: { id: submission.id },
    data: { validationMessageId: message.id },
  });

  // Update leaderboard in challenge channel
  await updateDailyAlgoLeaderboard(params.client, run.id);

  logger.success('DailyAlgo', `Réponse de ${submission.authorName} (${formatRankMedal(speedRank)}, +${speedBonusPoints}pts) envoyée en validation pour la guilde ${run.guildId}`);

  return { speedRank };
}

// ── Get Previous Run ───────────────────────────────────────────────────────────

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

// ── Review Submission (with scoring) ───────────────────────────────────────────

export async function reviewDailyAlgoSubmission(params: {
  client: Client;
  submissionId: string;
  action: 'approve' | 'reject';
  moderatorId: string;
  scores?: {
    correctness: number;
    comments: number;
    compactness: number;
    optimization: number;
    readability: number;
  };
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

  const updateData: Record<string, unknown> = {
    status,
    validatedAt: new Date(),
    validatedById: params.moderatorId,
  };

  if (params.action === 'approve' && params.scores) {
    const { correctness, comments, compactness, optimization, readability } = params.scores;
    const scoreFinal = (correctness + comments + compactness + optimization + readability) / 5;

    updateData.scoreCorrectness = correctness;
    updateData.scoreComments = comments;
    updateData.scoreCompactness = compactness;
    updateData.scoreOptimization = optimization;
    updateData.scoreReadability = readability;
    updateData.scoreFinal = Math.round(scoreFinal * 10) / 10;
  }

  await prisma.dailyAlgoSubmission.update({
    where: { id: submission.id },
    data: updateData,
  });

  // Update validation message in staff channel
  if (submission.validationMessageId) {
    const channelId = submission.run.validationChannelId ?? submission.run.guild.dailyAlgoValidationChannelId ?? submission.run.challengeChannelId;
    const channel = await params.client.channels.fetch(channelId).catch(() => null) as TextChannel | null;
    if (channel) {
      const message = await channel.messages.fetch(submission.validationMessageId).catch(() => null);
      if (message) {
        const moderator = await params.client.users.fetch(params.moderatorId).catch(() => null);

        let footerLabel: string;
        if (params.action === 'approve' && params.scores) {
          const scoreFinal = (params.scores.correctness + params.scores.comments + params.scores.compactness + params.scores.optimization + params.scores.readability) / 5;
          const totalScore = Math.round(scoreFinal * 10) / 10 + (submission.speedBonusPoints ?? 0);
          footerLabel = moderator
            ? `✅ Noté ${totalScore.toFixed(1)}pts par ${moderator.globalName ?? moderator.username}`
            : `✅ Noté ${totalScore.toFixed(1)}pts`;
        } else {
          footerLabel = moderator
            ? `❌ Rejeté par ${moderator.globalName ?? moderator.username}`
            : '❌ Rejeté';
        }

        const embed = EmbedBuilder.from(message.embeds[0] ?? new EmbedBuilder().setTitle('Réponse Daily Algo'))
          .setColor(params.action === 'approve' ? COLORS.success : COLORS.danger)
          .setFooter({ text: `Kotbo · ${footerLabel}` });

        await message.edit({
          embeds: [embed],
          components: buildDailyAlgoValidationButtons(submission.id, true),
        });
      }
    }
  }

  // Update leaderboard in challenge channel
  await updateDailyAlgoLeaderboard(params.client, submission.runId);

  return true;
}

// ── Summary (End of Day) ───────────────────────────────────────────────────────

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
      createdAt: true,
      problem: {
        select: { title: true },
      },
      submissions: {
        orderBy: { submittedAt: 'asc' },
      },
    },
  });

  if (runs.length === 0) {
    return;
  }

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

  const dayLabel = now.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  // Aggregate all approved submissions across runs
  const allApproved = runs.flatMap((run) =>
    run.submissions
      .filter((s) => s.status === 'APPROVED' && s.scoreFinal !== null)
      .map((s) => ({
        ...s,
        problemTitle: run.problem.title,
      })),
  );

  const allSubmissions = runs.flatMap((run) => run.submissions);
  const totalParticipants = new Set(allSubmissions.map((s) => s.authorId)).size;
  const approvedCount = new Set(allApproved.map((s) => s.authorId)).size;

  // Sort by total score desc
  const ranked = allApproved.sort((a, b) => {
    const scoreA = (a.scoreFinal ?? 0) + (a.speedBonusPoints ?? 0);
    const scoreB = (b.scoreFinal ?? 0) + (b.speedBonusPoints ?? 0);
    if (scoreB !== scoreA) return scoreB - scoreA;
    return (a.speedRank ?? 999) - (b.speedRank ?? 999);
  });

  // Deduplicate by author (keep best score)
  const seen = new Set<string>();
  const uniqueRanked = ranked.filter((s) => {
    if (seen.has(s.authorId)) return false;
    seen.add(s.authorId);
    return true;
  });

  const title = `🏁 Bilan du Daily Algo du ${dayLabel}`;

  if (uniqueRanked.length === 0) {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.info)
          .setTitle(title)
          .setDescription(`Aucune réponse validée aujourd'hui sur **${totalParticipants}** participant${totalParticipants > 1 ? 's' : ''}.`)
          .setTimestamp()
          .setFooter({ text: 'Kotbo · Daily Algo' }),
      ],
    });
  } else {
    const lines: string[] = [];
    lines.push(`**${approvedCount}** classé${approvedCount > 1 ? 's' : ''} sur **${totalParticipants}** participant${totalParticipants > 1 ? 's' : ''}\n`);

    for (let i = 0; i < uniqueRanked.length; i++) {
      const s = uniqueRanked[i]!;
      const totalScore = (s.scoreFinal ?? 0) + (s.speedBonusPoints ?? 0);
      const medal = formatRankMedal(i + 1);
      const speedTag = s.speedBonusPoints && s.speedBonusPoints > 0 ? ` ⚡+${s.speedBonusPoints}` : '';

      // Resolve display name
      const member = await guild.members.fetch(s.authorId).catch(() => null);
      const displayName = member?.displayName ?? s.authorName;

      lines.push(`${medal} **${displayName}** — **${totalScore.toFixed(1)}** pts${speedTag}`);
      lines.push(`┊ ✅ ${s.scoreCorrectness}/5 · 💬 ${s.scoreComments}/5 · 📦 ${s.scoreCompactness}/5 · ⚡ ${s.scoreOptimization}/5 · 🧹 ${s.scoreReadability}/5`);
      lines.push('');
    }

    const chunks = splitLines(lines, 3500);
    for (const [index, chunk] of chunks.entries()) {
      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.success)
            .setTitle(chunks.length > 1 ? `${title} (${index + 1}/${chunks.length})` : title)
            .setDescription(chunk)
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

// ── Summary Cron ───────────────────────────────────────────────────────────────

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

// ── splitLines utility ─────────────────────────────────────────────────────────

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

// ── Send Daily Algo (dispatch) ─────────────────────────────────────────────────

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
  const existingRunRaw = await prisma.dailyAlgoRun.findFirst({
    where: {
      guildId,
      dateKey,
    },
    select: dailyAlgoRunDispatchSelect,
  });

  const existingRun: DailyAlgoRunMessageData | null = existingRunRaw
    ? toDailyAlgoRunMessageData(existingRunRaw)
    : null;

  if (existingRun?.challengeMessageId) {
    logger.info('DailyAlgo', `Daily Algo déjà publié pour ${guildId} le ${dateKey}`);
    return {
      status: 'exists',
      runId: existingRun.id,
      problemTitle: existingRun.problem.title,
      dateKey,
    };
  }

  let run = existingRun;

  if (!run) {
    const problemCandidates = await prisma.dailyAlgoProblem.findMany({
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
        const createdRunRaw = await prisma.$transaction(async (tx) => {
          const createdRun = await tx.dailyAlgoRun.create({
            data: {
              guildId: guild.id,
              dateKey,
              problemId: candidate.id,
              challengeChannelId: channelId,
              validationChannelId: guild.dailyAlgoValidationChannelId ?? null,
            },
            select: dailyAlgoRunDispatchSelect,
          });

          const reservedProblem = await tx.dailyAlgoProblem.updateMany({
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

          return createdRun;
        });

        const createdRun = toDailyAlgoRunMessageData(createdRunRaw);

        run = createdRun;

        break;
      } catch (error) {
        logger.warn('DailyAlgo', `Impossible de réserver le problème ${candidate.id}, nouvel essai...`, error);

        const currentRunRaw = await prisma.dailyAlgoRun.findFirst({
          where: {
            guildId,
            dateKey,
          },
          select: dailyAlgoRunDispatchSelect,
        });

        const currentRun: DailyAlgoRunMessageData | null = currentRunRaw
          ? toDailyAlgoRunMessageData(currentRunRaw)
          : null;
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
