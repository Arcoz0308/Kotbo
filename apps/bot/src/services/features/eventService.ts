import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  type Client,
  type TextChannel,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import prisma from '../../utils/db.js';
import { logger } from '../../utils/logger.js';
import { COLORS, truncate } from '../../utils/embeds.js';

export type EventQuizConfig = {
  themeColor?: string;
};

export async function getEvents(guildId: string) {
  return prisma.event.findMany({
    where: { guildId },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: {
          questions: true,
          ctfChallenges: true,
          participants: true,
        },
      },
    },
  });
}

export async function getEvent(eventId: string) {
  return prisma.event.findUnique({
    where: { id: eventId },
    include: {
      questions: {
        orderBy: { sortOrder: 'asc' },
      },
      ctfChallenges: {
        orderBy: { sortOrder: 'asc' },
      },
      participants: {
        orderBy: [
          { score: 'desc' },
          { lastSolveAt: 'asc' }
        ] as any,
        include: {
          profile: true,
        },
      },
    },
  });
}

export async function createEvent(guildId: string, data: { title: string; description?: string; type: 'QUIZ' | 'CTF'; channelId?: string }) {
  return prisma.event.create({
    data: {
      guildId,
      title: data.title,
      description: data.description,
      type: data.type as any,
      channelId: data.channelId,
    },
  });
}

export async function publishEvent(client: Client, eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { questions: true, ctfChallenges: true },
  });

  if (!event) throw new Error('Événement introuvable');

  // @ts-expect-error - CUSTOM type not yet in generated Prisma client
  if (event.type === 'CUSTOM') {
    return publishCustomEventAnnouncement(client, eventId);
  }

  if (!event.channelId) throw new Error('Salon introuvable');

  const channel = (await client.channels.fetch(event.channelId).catch(() => null)) as TextChannel | null;
  if (!channel) throw new Error('Salon Discord introuvable');

  if (event.type === 'CTF') {
    const embed = new EmbedBuilder()
      .setTitle(`ðŸš© Capture The Flag : ${event.title}`)
      .setDescription(event.description || 'Le CTF a commencÃ© ! Trouvez les flags et soumettez-les.')
      .setColor(COLORS.info)
      .setTimestamp();

    const submitBtn = new ButtonBuilder()
      .setCustomId(`event-ctf-submit-flag-btn:${event.id}`)
      .setLabel('ðŸš© Soumettre un Flag')
      .setStyle(ButtonStyle.Primary);

    const progressBtn = new ButtonBuilder()
      .setCustomId(`event-ctf-progress-btn:${event.id}`)
      .setLabel('ðŸŽ¯ Ma Progression')
      .setStyle(ButtonStyle.Secondary);

    const lbBtn = new ButtonBuilder()
      .setCustomId(`event-ctf-leaderboard-btn:${event.id}`)
      .setLabel('ðŸ“Š Classement')
      .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(submitBtn, progressBtn, lbBtn);
    const message = await channel.send({ embeds: [embed], components: [row] });

    return prisma.event.update({
      where: { id: eventId },
      data: {
        status: 'ONGOING',
        messageId: message.id,
      },
    });
  }

  const embed = new EmbedBuilder()
    .setTitle(`ðŸŽ‰ Ã‰vÃ©nement : ${event.title}`)
    .setDescription(event.description || 'Un nouvel Ã©vÃ©nement commence ! PrÃ©parez-vous.')
    .setColor(COLORS.info)
    .addFields({ name: 'Statut', value: 'âŒ› En attente du lancement...', inline: true })
    .setTimestamp();

  const message = await channel.send({ embeds: [embed] });

  return prisma.event.update({
    where: { id: eventId },
    data: {
      status: 'PUBLISHED',
      messageId: message.id,
    },
  });
}

export async function nextQuestion(client: Client, eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      questions: {
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  if (!event || !event.messageId || !event.channelId) throw new Error('Ã‰vÃ©nement non publiÃ©');

  // Trouver la question en cours ou la suivante
  const currentQuestion = event.questions.find((q) => q.status === 'ONGOING');
  const nextQuestion = event.questions.find((q) => q.status === 'DRAFT');

  if (currentQuestion) {
    // ClÃ´turer la question actuelle
    await prisma.eventQuizQuestion.update({
      where: { id: currentQuestion.id },
      data: { status: 'COMPLETED', endTime: new Date() },
    });
  }

  if (!nextQuestion) {
    // Plus de questions, terminer l'Ã©vent
    return finishEvent(client, eventId);
  }

  // Lancer la question suivante
  await prisma.eventQuizQuestion.update({
    where: { id: nextQuestion.id },
    data: { status: 'ONGOING', startTime: new Date() },
  });

  await prisma.event.update({
    where: { id: eventId },
    data: { status: 'ONGOING' },
  });

  const channel = (await client.channels.fetch(event.channelId).catch(() => null)) as TextChannel | null;
  if (!channel) throw new Error('Salon Discord introuvable');

  const message = await channel.messages.fetch(event.messageId).catch(() => null);
  if (!message) throw new Error('Message principal introuvable');

  const totalQuestions = event.questions.length;
  const currentIdx = event.questions.findIndex(q => q.id === nextQuestion.id) + 1;

  const embed = new EmbedBuilder()
    .setTitle(`â�“ Question ${currentIdx}/${totalQuestions} : ${nextQuestion.text}`)
    .setDescription('Choisissez la bonne rÃ©ponse ci-dessous !')
    .setColor(COLORS.info)
    .setTimestamp();

  if (currentQuestion) {
    const prevAnswer = (currentQuestion.options as string[])[currentQuestion.correctOptionIndex];
    embed.addFields({ 
      name: 'âœ… DerniÃ¨re rÃ©ponse', 
      value: `La bonne rÃ©ponse Ã  la question prÃ©cÃ©dente Ã©tait : **${prevAnswer}**` 
    });
  }

  if (nextQuestion.imageUrl) embed.setImage(nextQuestion.imageUrl);

  const options = nextQuestion.options as string[];
  const components: any[] = [];

  if (options.length <= 5) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    options.forEach((opt, idx) => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`event-quiz-answer:${nextQuestion.id}:${idx}`)
          .setLabel(truncate(opt, 80))
          .setStyle(ButtonStyle.Primary),
      );
    });
    components.push(row);
  } else {
    const row = new ActionRowBuilder<StringSelectMenuBuilder>();
    const select = new StringSelectMenuBuilder()
      .setCustomId(`event-quiz-select:${nextQuestion.id}`)
      .setPlaceholder('Choisissez votre rÃ©ponse...');

    options.forEach((opt, idx) => {
      select.addOptions({
        label: truncate(opt, 100),
        value: idx.toString(),
      });
    });
    row.addComponents(select);
    components.push(row);
  }

  await message.edit({ embeds: [embed], components });

  return { status: 'next_question_launched', questionId: nextQuestion.id };
}

export async function prevQuestion(client: Client, eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      questions: {
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  if (!event || !event.messageId || !event.channelId) throw new Error('Ã‰vÃ©nement non publiÃ©');

  const currentQuestion = event.questions.find((q) => q.status === 'ONGOING');
  const completedQuestions = event.questions.filter((q) => q.status === 'COMPLETED');
  const prevQuestion = completedQuestions[completedQuestions.length - 1];

  if (!prevQuestion) throw new Error('Pas de question prÃ©cÃ©dente');

  // Reset current ONGOING to DRAFT
  if (currentQuestion) {
    await prisma.eventQuizQuestion.update({
      where: { id: currentQuestion.id },
      data: { status: 'DRAFT', startTime: null, endTime: null },
    });
  }

  // Set COMPLETED to ONGOING
  await prisma.eventQuizQuestion.update({
    where: { id: prevQuestion.id },
    data: { status: 'ONGOING', endTime: null },
  });

  const channel = (await client.channels.fetch(event.channelId).catch(() => null)) as TextChannel | null;
  if (!channel) throw new Error('Salon Discord introuvable');

  const message = await channel.messages.fetch(event.messageId).catch(() => null);
  if (!message) throw new Error('Message principal introuvable');

  const totalQuestions = event.questions.length;
  const currentIdx = event.questions.findIndex(q => q.id === prevQuestion.id) + 1;

  const embed = new EmbedBuilder()
    .setTitle(`â�“ Question ${currentIdx}/${totalQuestions} : ${prevQuestion.text}`)
    .setDescription('Choisissez la bonne rÃ©ponse ci-dessous !')
    .setColor(COLORS.info)
    .setTimestamp();

  const questionBeforePrev = event.questions[currentIdx - 2];
  if (questionBeforePrev) {
    const prevAnswer = (questionBeforePrev.options as string[])[questionBeforePrev.correctOptionIndex];
    embed.addFields({ 
      name: 'âœ… DerniÃ¨re rÃ©ponse', 
      value: `La bonne rÃ©ponse Ã  la question prÃ©cÃ©dente Ã©tait : **${prevAnswer}**` 
    });
  }

  if (prevQuestion.imageUrl) embed.setImage(prevQuestion.imageUrl);

  const options = prevQuestion.options as string[];
  const components: any[] = [];

  if (options.length <= 5) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    options.forEach((opt, idx) => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`event-quiz-answer:${prevQuestion.id}:${idx}`)
          .setLabel(truncate(opt, 80))
          .setStyle(ButtonStyle.Primary),
      );
    });
    components.push(row);
  } else {
    const select = new StringSelectMenuBuilder()
      .setCustomId(`event-quiz-select:${prevQuestion.id}`)
      .setPlaceholder('Choisissez votre rÃ©ponse...')
      .addOptions(
        options.map((opt, idx) => ({
          label: truncate(opt, 100),
          value: idx.toString(),
        })),
      );
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  }

  await message.edit({ embeds: [embed], components });
  return { status: 'ongoing', questionId: prevQuestion.id };
}

export async function handleQuizInteraction(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  questionId: string,
  optionIndex: number,
) {
  const question = await prisma.eventQuizQuestion.findUnique({
    where: { id: questionId },
    include: { event: true },
  });

  if (!question || question.status !== 'ONGOING') {
    return interaction.reply({ content: 'Cette question est terminÃ©e ou invalide.', ephemeral: true });
  }

  // S'assurer que le profil membre existe (nÃ©cessaire pour la relation EventParticipant -> MemberProfile)
  await prisma.memberProfile.upsert({
    where: {
      guildId_userId: {
        guildId: interaction.guildId!,
        userId: interaction.user.id,
      },
    },
    create: {
      guildId: interaction.guildId!,
      userId: interaction.user.id,
      userTag: interaction.user.tag,
      username: interaction.user.username,
      displayName: (interaction.member as any)?.displayName || interaction.user.username,
      avatarUrl: interaction.user.displayAvatarURL(),
    },
    update: {
      userTag: interaction.user.tag,
      username: interaction.user.username,
      displayName: (interaction.member as any)?.displayName || interaction.user.username,
      avatarUrl: interaction.user.displayAvatarURL(),
    },
  });

  // CrÃ©er ou rÃ©cupÃ©rer le participant
  const participant = await prisma.eventParticipant.upsert({
    where: {
      eventId_userId: {
        eventId: question.eventId,
        userId: interaction.user.id,
      },
    },
    create: {
      eventId: question.eventId,
      userId: interaction.user.id,
      guildId: interaction.guildId!,
      userTag: interaction.user.tag,
      username: interaction.user.username,
    },
    update: {
      userTag: interaction.user.tag,
      username: interaction.user.username,
    },
  });

  const isCorrect = optionIndex === question.correctOptionIndex;
  const responseTimeMs = question.startTime ? Date.now() - question.startTime.getTime() : null;

  await prisma.eventQuizResponse.upsert({
    where: {
      questionId_participantId: {
        questionId: question.id,
        participantId: participant.id,
      },
    },
    create: {
      questionId: question.id,
      participantId: participant.id,
      optionIndex,
      isCorrect,
      responseTimeMs,
    },
    update: {
      optionIndex,
      isCorrect,
      responseTimeMs,
    },
  });

  // Mettre Ã  jour le score global du participant
  const allResponses = await prisma.eventQuizResponse.findMany({
    where: { participantId: participant.id },
  });

  const newScore = allResponses.filter((r) => r.isCorrect).length;

  await prisma.eventParticipant.update({
    where: { id: participant.id },
    data: { score: newScore },
  });

  return interaction.reply({
    content: `Ta rÃ©ponse a Ã©tÃ© enregistrÃ©e : **${(question.options as string[])[optionIndex]}**`,
    ephemeral: true,
  });
}

export async function getEventStats(eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      questions: {
        include: {
          responses: {
            include: {
              participant: true,
            },
          },
        },
      },
    },
  });

  if (!event) return null;

  if (event.type === 'CTF') {
    const ctfChallenges = await (prisma as any).eventCtfChallenge.findMany({
      where: { eventId },
      include: {
        solves: {
          include: {
            participant: true,
          },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
    return {
      type: 'CTF',
      challenges: ctfChallenges.map((c: any) => ({
        id: c.id,
        title: c.title,
        points: c.points,
        xpReward: c.xpReward,
        roleIdReward: c.roleIdReward,
        solveCount: c.solves.length,
        solves: c.solves.map((s: any) => ({
          userId: s.participant.userId,
          username: s.participant.username || s.participant.userTag || s.participant.userId,
          solvedAt: s.solvedAt,
        })),
      })),
    };
  }

  let currentQuestion = event.questions.find((q) => q.status === 'ONGOING');
  
  // Si la question en cours n'a pas encore de rÃ©ponses, on affiche les stats de la derniÃ¨re question terminÃ©e
  if (currentQuestion && currentQuestion.responses.length === 0) {
    const lastCompleted = [...event.questions]
      .reverse()
      .find(q => q.status === 'COMPLETED');
    if (lastCompleted) currentQuestion = lastCompleted;
  }

  if (!currentQuestion) {
    currentQuestion = event.questions.find(q => q.status === 'COMPLETED') || event.questions[event.questions.length - 1];
  }
  
  if (!currentQuestion) return null;

  const latestResponses = new Map<string, {
    userId: string;
    userTag: string | null;
    optionIndex: number;
    optionLabel: string;
    isCorrect: boolean;
    questionId: string;
    questionText: string;
    sortOrder: number;
  }>();

  for (const q of event.questions) {
    const qOptions = q.options as string[];
    const qSortOrder = (q as any).sortOrder ?? 0;
    for (const r of q.responses) {
      const userId = r.participant.userId;
      const existing = latestResponses.get(userId);
      if (!existing || qSortOrder >= existing.sortOrder) {
        latestResponses.set(userId, {
          userId,
          userTag: r.participant.userTag,
          optionIndex: r.optionIndex,
          optionLabel: qOptions[r.optionIndex] || `Option ${r.optionIndex + 1}`,
          isCorrect: r.isCorrect,
          questionId: q.id,
          questionText: q.text,
          sortOrder: qSortOrder,
        });
      }
    }
  }

  const distribution: Record<number, number> = {};
  (currentQuestion.options as string[]).forEach((_, idx) => (distribution[idx] = 0));

  currentQuestion.responses.forEach((r) => {
    distribution[r.optionIndex] = (distribution[r.optionIndex] || 0) + 1;
  });

  return {
    questionId: currentQuestion.id,
    questionText: currentQuestion.text,
    distribution,
    options: currentQuestion.options as string[],
    latestResponses: Array.from(latestResponses.values()).map(({ sortOrder, ...rest }) => rest),
    responses: currentQuestion.responses.map(r => ({
      userId: r.participant.userId,
      userTag: r.participant.userTag,
      optionIndex: r.optionIndex,
      responseTimeMs: r.responseTimeMs,
      isCorrect: r.isCorrect
    }))
  };
}

export async function finishEvent(client: Client, eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      participants: {
        orderBy: [
          { score: 'desc' },
          { lastSolveAt: 'asc' }
        ],
      },
    },
  });

  if (!event || !event.messageId || !event.channelId) throw new Error('Ã‰vÃ©nement introuvable');

  const channel = (await client.channels.fetch(event.channelId).catch(() => null)) as TextChannel | null;
  if (!channel) throw new Error('Salon Discord introuvable');

  const message = await channel.messages.fetch(event.messageId).catch(() => null);

  const leaderboard = event.participants
    .slice(0, 10)
    .map((p: any, i: number) => `${i + 1}. **${p.userTag || p.userId}** â€” ${p.score} pts`)
    .join('\n') || 'Aucun participant.';

  let description = `Bravo Ã  tous les participants !\n\n**Classement Final :**\n${leaderboard}`;

  if (event.type === 'CTF') {
    const embed = new EmbedBuilder()
      .setTitle(`ðŸ�� Capture The Flag terminÃ© : ${event.title}`)
      .setDescription(description)
      .setColor(COLORS.success)
      .setTimestamp();

    if (message) {
      await message.edit({ embeds: [embed], components: [] });
    } else {
      await channel.send({ embeds: [embed], components: [] });
    }

    await prisma.event.update({
      where: { id: eventId },
      data: { status: 'COMPLETED' },
    });

    return { status: 'completed' };
  }
  
  const lastQuestion = await prisma.eventQuizQuestion.findFirst({
    where: { eventId },
    orderBy: { sortOrder: 'desc' },
  });

  if (lastQuestion) {
    const lastAnswer = (lastQuestion.options as string[])[lastQuestion.correctOptionIndex];
    description = `âœ… La bonne rÃ©ponse Ã  la derniÃ¨re question Ã©tait : **${lastAnswer}**\n\n` + description;
  }

  const embed = new EmbedBuilder()
    .setTitle(`ðŸ�� Ã‰vÃ©nement terminÃ© : ${event.title}`)
    .setDescription(description)
    .setColor(COLORS.success)
    .setTimestamp();

  if (message) {
    const statsButton = new ButtonBuilder()
      .setCustomId(`event-stats:${eventId}`)
      .setLabel('ðŸ“Š Stats/Analytics')
      .setStyle(ButtonStyle.Secondary);

    const detailsButton = new ButtonBuilder()
      .setCustomId(`event-result-page:${eventId}:0`)
      .setLabel('ðŸ”� DÃ©tails')
      .setStyle(ButtonStyle.Primary);

    const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:5173';
    const dashboardLink = `${DASHBOARD_URL.replace(/\/$/, '')}/events/control/${eventId}`;
    const dashboardButton = new ButtonBuilder()
      .setLabel('Ouvrir Dashboard')
      .setStyle(ButtonStyle.Link)
      .setURL(dashboardLink);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(statsButton, detailsButton, dashboardButton);

    await message.edit({ embeds: [embed], components: [row] });
  } else {
    const statsButton = new ButtonBuilder()
      .setCustomId(`event-stats:${eventId}`)
      .setLabel('ðŸ“Š Stats/Analytics')
      .setStyle(ButtonStyle.Secondary);

    const detailsButton = new ButtonBuilder()
      .setCustomId(`event-result-page:${eventId}:0`)
      .setLabel('ðŸ”� DÃ©tails')
      .setStyle(ButtonStyle.Primary);

    const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:5173';
    const dashboardLink = `${DASHBOARD_URL.replace(/\/$/, '')}/events/control/${eventId}`;
    const dashboardButton = new ButtonBuilder()
      .setLabel('Ouvrir Dashboard')
      .setStyle(ButtonStyle.Link)
      .setURL(dashboardLink);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(statsButton, detailsButton, dashboardButton);

    await channel.send({ embeds: [embed], components: [row] });
  }

  await prisma.event.update({
    where: { id: eventId },
    data: { status: 'COMPLETED' },
  });

  return { status: 'completed' };
}

export async function buildEventResultsView(interaction: any, eventId: string, page: number = 0) {
  const userId = interaction.user.id;
  const guildId = interaction.guildId;

  if (!eventId) {
    const participations = await prisma.eventParticipant.findMany({
      where: { userId, guildId: guildId || '' },
      include: { event: true },
      orderBy: { event: { createdAt: 'desc' } }
    });

    if (participations.length === 0) {
      return { content: "â�Œ Tu n'as participÃ© Ã  aucun quiz pour le moment.", embeds: [], components: [] };
    }

    const embed = new EmbedBuilder()
      .setTitle('ðŸ“ˆ Tes RÃ©sultats Quiz')
      .setDescription('SÃ©lectionne un Ã©vÃ©nement pour voir le dÃ©tail de tes rÃ©ponses.')
      .setColor(COLORS.info);

    const select = new StringSelectMenuBuilder()
      .setCustomId('event-result-select')
      .setPlaceholder('Choisir un Ã©vÃ©nement...')
      .addOptions(
        participations.slice(0, 25).map(p => ({
          label: truncate(p.event.title, 100),
          description: `Score: ${p.score} - ${p.event.createdAt.toLocaleDateString()}`,
          value: p.event.id
        }))
      );

    return { embeds: [embed], components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)] };
  }
  
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      questions: {
        orderBy: { sortOrder: 'asc' },
        include: {
          responses: {
            include: {
              participant: true,
            }
          }
        }
      }
    }
  });

  if (!event) return { content: 'â�Œ Ã‰vÃ©nement introuvable.', embeds: [], components: [] };

  const pageSize = 10;
  const totalPages = Math.ceil(event.questions.length / pageSize) || 1;
  const start = page * pageSize;
  const end = start + pageSize;
  const visibleQuestions = event.questions.slice(start, end);

  const embed = new EmbedBuilder()
    .setTitle(`ðŸ“ˆ RÃ©sultats : ${event.title}`)
    .setDescription(`Voici le dÃ©tail de tes rÃ©ponses (Page ${page + 1}/${totalPages}).`)
    .setColor(COLORS.info)
    .setTimestamp();

  visibleQuestions.forEach((q, i) => {
    // Chercher la rÃ©ponse correspondant Ã  l'utilisateur parmi les rÃ©ponses disponibles.
    // On ne se fie pas uniquement Ã  la relation WHERE cÃ´tÃ© Prisma car il arrive
    // que les donnÃ©es aient Ã©tÃ© enregistrÃ©es avec une relation incorrecte (bug question 39, etc.).
    const userResponse = Array.isArray(q.responses)
      ? q.responses.find((r: any) => r.participant && r.participant.userId === userId)
      : undefined;
    const options = q.options as string[];
    const correctLabel = options[q.correctOptionIndex];
    
    let userLabel = '*Pas de rÃ©ponse*';
    let icon = 'âšª';

    if (userResponse) {
      userLabel = options[userResponse.optionIndex];
      icon = userResponse.isCorrect ? 'âœ…' : 'â�Œ';
    }

    embed.addFields({
      name: `${start + i + 1}. ${truncate(q.text, 200)}`,
      value: `Ta rÃ©ponse : ${icon} **${truncate(userLabel, 100)}**\nBonne rÃ©ponse : **${truncate(correctLabel, 100)}**`
    });
  });

  const row = new ActionRowBuilder<ButtonBuilder>();
  if (page > 0) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`event-result-page:${eventId}:${page - 1}`)
        .setLabel('PrÃ©cÃ©dent')
        .setStyle(ButtonStyle.Secondary)
    );
  }
  if (page < totalPages - 1) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`event-result-page:${eventId}:${page + 1}`)
        .setLabel('Suivant')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  row.addComponents(
    new ButtonBuilder()
      .setCustomId('event-result-back')
      .setLabel('Retour Ã  la liste')
      .setStyle(ButtonStyle.Danger)
  );

  return { embeds: [embed], components: [row] };
}

export async function deleteEvent(client: Client, eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { channelId: true, messageId: true }
  });

  if (event && event.channelId && event.messageId) {
    try {
      const channel = await client.channels.fetch(event.channelId).catch(() => null) as TextChannel | null;
      if (channel) {
        const message = await channel.messages.fetch(event.messageId).catch(() => null);
        if (message) {
          await message.delete().catch(() => null);
        }
      }
    } catch (err) {
      logger.error('EventsService', 'Failed to delete Discord message for event:', err);
    }
  }

  return prisma.event.delete({
    where: { id: eventId },
  });
}

export async function handleCtfFlagSubmission(interaction: any, eventId: string, flag: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { ctfChallenges: true }
  });

  if (!event || event.status !== 'ONGOING') {
    return interaction.reply({ content: 'â�Œ Ce CTF n\'est pas actif.', ephemeral: true });
  }

  const challenge = (event as any).ctfChallenges.find((c: any) => c.flag.trim().toLowerCase() === flag.trim().toLowerCase());
  if (!challenge) {
    return interaction.reply({ content: 'â�Œ Flag incorrect. Essayez encore !', ephemeral: true });
  }

  await prisma.memberProfile.upsert({
    where: {
      guildId_userId: {
        guildId: interaction.guildId!,
        userId: interaction.user.id,
      },
    },
    create: {
      guildId: interaction.guildId!,
      userId: interaction.user.id,
      userTag: interaction.user.tag,
      username: interaction.user.username,
      displayName: (interaction.member as any)?.displayName || interaction.user.username,
      avatarUrl: interaction.user.displayAvatarURL(),
    },
    update: {
      userTag: interaction.user.tag,
      username: interaction.user.username,
      displayName: (interaction.member as any)?.displayName || interaction.user.username,
      avatarUrl: interaction.user.displayAvatarURL(),
    },
  });

  const participant = await prisma.eventParticipant.upsert({
    where: {
      eventId_userId: {
        eventId,
        userId: interaction.user.id,
      },
    },
    create: {
      eventId,
      userId: interaction.user.id,
      guildId: interaction.guildId!,
      userTag: interaction.user.tag,
      username: interaction.user.username,
    },
    update: {
      userTag: interaction.user.tag,
      username: interaction.user.username,
    },
  });

  const existingSolve = await (prisma as any).eventCtfSolve.findUnique({
    where: {
      challengeId_participantId: {
        challengeId: challenge.id,
        participantId: participant.id,
      },
    },
  });

  if (existingSolve) {
    return interaction.reply({ content: 'âš ï¸� Vous avez dÃ©jÃ  rÃ©solu ce challenge !', ephemeral: true });
  }

  const previousSolvesCount = await (prisma as any).eventCtfSolve.count({
    where: { challengeId: challenge.id }
  });

  await (prisma as any).eventCtfSolve.create({
    data: {
      challengeId: challenge.id,
      participantId: participant.id,
    },
  });

  const newScore = participant.score + challenge.points;

  await prisma.eventParticipant.update({
    where: { id: participant.id },
    data: {
      score: newScore,
      lastSolveAt: new Date(),
    },
  });

  let roleFeedback = '';
  if (challenge.roleIdReward) {
    const member = interaction.member;
    if (member && 'roles' in member) {
      const role = interaction.guild?.roles.cache.get(challenge.roleIdReward);
      if (role) {
        await (member.roles as any).add(role).catch((err: any) => {
          logger.error('CtfService', 'Failed to add reward role:', err);
        });
        roleFeedback = ` et le rôle **${role.name}** vous a été attribué`;
      }
    }
  }

  let xpFeedback = '';
  if (challenge.xpReward > 0) {
    try {
      const { addXp } = await import('../progression/levelingService.js');
      await addXp(interaction.guildId!, interaction.user.id, challenge.xpReward, interaction.client);
      xpFeedback = ` (+${challenge.xpReward} XP)`;
    } catch (err) {
      logger.error('CtfService', 'Failed to add XP reward:', err);
    }
  }

  // Broadcast public first blood message
  if (previousSolvesCount === 0 && event.channelId) {
    const channel = interaction.guild?.channels.cache.get(event.channelId) as TextChannel | null;
    if (channel) {
      await channel.send({
        content: `🩸 **First Blood !** <@${interaction.user.id}> est le premier à résoudre le challenge **${challenge.title}** !`
      }).catch(() => null);
    }
  }

  return interaction.reply({
    content: `🎉 **Correct !** Vous avez résolu le challenge **${challenge.title}** (+${challenge.points} pts)${roleFeedback}${xpFeedback} !`,
    ephemeral: true,
  });
}


export async function buildCtfLeaderboard(interaction: any, eventId: string) {
  const participants = await prisma.eventParticipant.findMany({
    where: { eventId },
    orderBy: [
      { score: 'desc' },
      { lastSolveAt: 'asc' },
    ],
    take: 10,
  });

  const leaderboard = participants
    .map((p, idx) => {
      const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
      return `${medal} **${p.userTag || p.username || p.userId}** — ${p.score} pts (résolu le : ${p.lastSolveAt ? p.lastSolveAt.toLocaleDateString('fr-FR') + ' à ' + p.lastSolveAt.toLocaleTimeString('fr-FR') : 'N/A'})`;
    })
    .join('\n') || 'Aucun participant pour le moment.';

  const embed = new EmbedBuilder()
    .setTitle('📊 Classement CTF')
    .setDescription(leaderboard)
    .setColor(COLORS.success)
    .setTimestamp();

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

export async function buildCtfParticipantProgress(interaction: any, eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      ctfChallenges: {
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  if (!event) return interaction.reply({ content: '❌ CTF introuvable.', ephemeral: true });

  const participant = await prisma.eventParticipant.findUnique({
    where: {
      eventId_userId: {
        eventId,
        userId: interaction.user.id,
      },
    },
    include: {
      ctfSolves: true,
    },
  });

  const solvedChallengeIds = new Set((participant as any)?.ctfSolves.map((s: any) => s.challengeId) || []);

  const list = (event as any).ctfChallenges.map((c: any) => {
    const isSolved = solvedChallengeIds.has(c.id);
    const statusIcon = isSolved ? '✅' : '❌';
    return `${statusIcon} **${c.title}** (${c.points} pts) ${c.xpReward > 0 ? `[+${c.xpReward} XP]` : ''}`;
  }).join('\n') || 'Aucun challenge dans ce CTF.';

  const totalPoints = (event as any).ctfChallenges.reduce((acc: number, c: any) => acc + c.points, 0);
  const userPoints = participant?.score || 0;

  const embed = new EmbedBuilder()
    .setTitle(`🎯 Votre Progression : ${event.title}`)
    .setDescription(`Score actuel : **${userPoints}** / **${totalPoints}** pts\n\n${list}`)
    .setColor(COLORS.info)
    .setTimestamp();

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

export async function checkScheduledEvents(client: Client) {
  const now = new Date();
  const events = await prisma.event.findMany({
    where: {
      status: 'DRAFT',
      triggerType: 'SCHEDULED',
      triggerStatus: 'PENDING',
    },
  });

  for (const event of events) {
    if (!event.triggerValue) continue;
    const triggerDate = new Date(event.triggerValue);
    if (triggerDate <= now) {
      try {
        await prisma.event.update({
          where: { id: event.id },
          data: { triggerStatus: 'TRIGGERED' },
        });
        await publishEvent(client, event.id);
        logger.info('EventService', `Événement ${event.id} planifié démarré.`);
      } catch (err) {
        logger.error('EventService', `Erreur démarrage événement planifié ${event.id}:`, err);
        await prisma.event.update({
          where: { id: event.id },
          data: { triggerStatus: 'FAILED' },
        }).catch(() => null);
      }
    }
  }
}


// ============================================================================
// ÉVÉNEMENTS CUSTOM (Discord Scheduled Event + Annonce)
// ============================================================================

export async function createCustomEvent(
  client: Client,
  guildId: string,
  data: {
    title: string;
    description?: string;
    announcementChannelId?: string;
    formId?: string;
    startTime?: string;
    endTime?: string;
    createDiscordEvent?: boolean;
    location?: string;
  }
) {
  // @ts-expect-error - Prisma client needs to be regenerated by user to recognize Event.announcementChannelId
  const event = await prisma.event.create({
    data: {
      guildId,
      title: data.title,
      description: data.description,
      type: 'CUSTOM',
      status: 'DRAFT',
      announcementChannelId: data.announcementChannelId,
      formId: data.formId || null,
      triggerType: data.startTime ? 'SCHEDULED' : null,
      triggerValue: data.startTime || null,
      triggerStatus: data.startTime ? 'PENDING' : 'TRIGGERED',
    },
  });

  if (data.createDiscordEvent && data.startTime) {
    try {
      const discordGuild = await client.guilds.fetch(guildId).catch(() => null);
      if (discordGuild) {
        const startTime = new Date(data.startTime);
        const endTime = data.endTime ? new Date(data.endTime) : new Date(startTime.getTime() + 2 * 60 * 60 * 1000);
        const scheduledEvent = await discordGuild.scheduledEvents.create({
          name: data.title,
          description: data.description,
          scheduledStartTime: startTime,
          scheduledEndTime: endTime,
          privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
          entityType: GuildScheduledEventEntityType.External,
          entityMetadata: { location: data.location || 'Discord' },
        });
        // @ts-expect-error - Prisma client needs to be regenerated by user to recognize Event.discordEventId
        await prisma.event.update({ where: { id: event.id }, data: { discordEventId: scheduledEvent.id } });
        logger.info('EventService', `GuildScheduledEvent cree: ${scheduledEvent.id} pour l evenement ${event.id}`);
      }
    } catch (err) {
      logger.warn('EventService', `Impossible de creer le GuildScheduledEvent: ${err}`);
    }
  }

  return prisma.event.findUnique({ where: { id: event.id } });
}

export async function publishCustomEventAnnouncement(client: Client, eventId: string) {
  // @ts-expect-error - Prisma client needs to be regenerated by user to recognize Event.customForm
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { customForm: true },
  });

  if (!event) throw new Error('Evenement introuvable');
  if (event.type !== 'CUSTOM') throw new Error("Cet evenement n'est pas de type CUSTOM");

  const config = (event.config as any) || {};
  const createDiscordEvent = config.createDiscordEvent !== false;
  const sendEmbed = config.sendEmbed !== false;
  const location = config.location || 'Discord';
  const endTime = config.endTime;

  let discordEventId = event.discordEventId;

  // 1. Create scheduled event on Discord if enabled
  if (createDiscordEvent && event.triggerValue && !discordEventId) {
    try {
      const discordGuild = await client.guilds.fetch(event.guildId).catch(() => null);
      if (discordGuild) {
        const startTime = new Date(event.triggerValue);
        const end = endTime ? new Date(endTime) : new Date(startTime.getTime() + 2 * 60 * 60 * 1000);
        const scheduledEvent = await discordGuild.scheduledEvents.create({
          name: event.title,
          description: event.description || '',
          scheduledStartTime: startTime,
          scheduledEndTime: end,
          privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
          entityType: GuildScheduledEventEntityType.External,
          entityMetadata: { location },
        });
        discordEventId = scheduledEvent.id;
        // @ts-expect-error - Prisma client needs to be regenerated by user to recognize Event.discordEventId
        await prisma.event.update({ where: { id: event.id }, data: { discordEventId } });
        logger.info('EventService', `GuildScheduledEvent cree lors de la publication: ${scheduledEvent.id}`);
      }
    } catch (err) {
      logger.warn('EventService', `Impossible de creer le GuildScheduledEvent lors de la publication: ${err}`);
    }
  }

  let announcementMessageId = null;

  // 2. Send announcement embed if enabled
  if (sendEmbed) {
    // @ts-expect-error - Prisma client needs to be regenerated by user to recognize Event.announcementChannelId
    const channelId = event.announcementChannelId;
    if (!channelId) throw new Error("Aucun salon d'annonce configure pour cet evenement");

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) throw new Error('Salon Discord introuvable');

    const embed = new EmbedBuilder()
      .setTitle(`📅 ${event.title}`)
      .setColor(COLORS.info)
      .setTimestamp();

    if (event.description) embed.setDescription(event.description);

    if (event.triggerValue) {
      const date = new Date(event.triggerValue);
      embed.addFields({ name: '🕒 Date', value: `<t:${Math.floor(date.getTime() / 1000)}:F>`, inline: true });
    }

    // @ts-expect-error - Prisma client needs to be regenerated by user to recognize Event.formId
    if (event.formId) {
      embed.addFields({ name: '📝 Inscription', value: "Cliquez sur S'inscrire pour remplir le formulaire.", inline: false });
    } else {
      embed.addFields({ name: '📝 Inscription', value: "Cliquez sur S'inscrire pour vous enregistrer.", inline: false });
    }

    const registerBtn = new ButtonBuilder()
      .setCustomId(`event-custom-register:${eventId}`)
      .setLabel("📝 S'inscrire")
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(registerBtn);

    if (discordEventId) {
      try {
        const discordGuild = (channel as TextChannel).guild;
        const discordEvent = await discordGuild.scheduledEvents.fetch(discordEventId).catch(() => null);
        if (discordEvent) {
          const eventLinkBtn = new ButtonBuilder()
            .setLabel("📅 Voir l'evenement Discord")
            .setStyle(ButtonStyle.Link)
            .setURL(`https://discord.com/events/${discordGuild.id}/${discordEvent.id}`);
          row.addComponents(eventLinkBtn);
          embed.addFields({ name: '📅 Evenement Discord', value: `[Cliquez ici](https://discord.com/events/${discordGuild.id}/${discordEvent.id})`, inline: true });
        }
      } catch {}
    }

    const message = await (channel as TextChannel).send({ embeds: [embed], components: [row] });
    announcementMessageId = message.id;
  }

  // Update event status
  await prisma.event.update({
    where: { id: eventId },
    data: {
      status: 'PUBLISHED',
      // @ts-expect-error - Prisma client needs to be regenerated by user to recognize Event.announcementMessageId
      announcementMessageId
    }
  });

  logger.info('EventService', `Annonce publiee pour l evenement CUSTOM ${eventId}`);
  return { event: await prisma.event.findUnique({ where: { id: eventId } }), messageId: announcementMessageId };
}

export async function handleCustomEventRegisterButton(interaction: ButtonInteraction, eventId: string) {
  // @ts-expect-error - Prisma client needs to be regenerated by user to recognize Event.customForm
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { customForm: true },
  });

  if (!event || event.type !== 'CUSTOM') {
    return interaction.reply({ content: '❌ Evenement introuvable.', ephemeral: true });
  }
  if (event.status === 'COMPLETED' || event.status === 'CANCELLED') {
    return interaction.reply({ content: '❌ Les inscriptions sont fermees pour cet evenement.', ephemeral: true });
  }

  // @ts-expect-error - Prisma client needs to be regenerated by user to recognize Event.formId
  if (event.formId && (event as any).customForm) {
    const { buildFormModal } = await import('./customFormService.js');
    // @ts-expect-error - Prisma client needs to be regenerated by user to recognize Event.formId
    const modal = buildFormModal(event.formId, eventId, (event as any).customForm.structure);
    return interaction.showModal(modal);
  }

  const { handleDirectRegistration } = await import('./customFormService.js');
  return handleDirectRegistration(interaction, eventId);
}

export async function deleteCustomEventDiscordEvent(client: Client, eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  // @ts-expect-error - Prisma client needs to be regenerated by user to recognize Event.discordEventId
  if (!event?.discordEventId || !event.guildId) return;
  try {
    const discordGuild = await client.guilds.fetch(event.guildId).catch(() => null);
    if (!discordGuild) return;
    // @ts-expect-error - Prisma client needs to be regenerated by user to recognize Event.discordEventId
    const scheduledEvent = await discordGuild.scheduledEvents.fetch(event.discordEventId).catch(() => null);
    if (scheduledEvent) await scheduledEvent.delete();
    // @ts-expect-error - Prisma client needs to be regenerated by user to recognize Event.discordEventId
    logger.info('EventService', `GuildScheduledEvent ${event.discordEventId} supprime`);
  } catch (err) {
    logger.warn('EventService', `Impossible de supprimer le GuildScheduledEvent: ${err}`);
  }
}
