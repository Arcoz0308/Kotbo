import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type Client,
  type TextChannel,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import prisma from '../utils/db.js';
import { logger } from '../utils/logger.js';
import { COLORS, truncate } from '../utils/embeds.js';

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
      participants: {
        orderBy: { score: 'desc' },
        include: {
          profile: true,
        },
      },
    },
  });
}

export async function createEvent(guildId: string, data: { title: string; description?: string; type: 'QUIZ'; channelId?: string }) {
  return prisma.event.create({
    data: {
      guildId,
      title: data.title,
      description: data.description,
      type: data.type,
      channelId: data.channelId,
    },
  });
}

export async function publishEvent(client: Client, eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { questions: true },
  });

  if (!event || !event.channelId) throw new Error('Événement ou salon introuvable');

  const channel = (await client.channels.fetch(event.channelId).catch(() => null)) as TextChannel | null;
  if (!channel) throw new Error('Salon Discord introuvable');

  const embed = new EmbedBuilder()
    .setTitle(`🎉 Événement : ${event.title}`)
    .setDescription(event.description || 'Un nouvel événement commence ! Préparez-vous.')
    .setColor(COLORS.info)
    .addFields({ name: 'Statut', value: '⌛ En attente du lancement...', inline: true })
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

  if (!event || !event.messageId || !event.channelId) throw new Error('Événement non publié');

  // Trouver la question en cours ou la suivante
  const currentQuestion = event.questions.find((q) => q.status === 'ONGOING');
  const nextQuestion = event.questions.find((q) => q.status === 'DRAFT');

  if (currentQuestion) {
    // Clôturer la question actuelle
    await prisma.eventQuizQuestion.update({
      where: { id: currentQuestion.id },
      data: { status: 'COMPLETED', endTime: new Date() },
    });
  }

  if (!nextQuestion) {
    // Plus de questions, terminer l'évent
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

  const embed = new EmbedBuilder()
    .setTitle(`❓ Question : ${nextQuestion.text}`)
    .setDescription('Choisissez la bonne réponse ci-dessous !')
    .setColor(COLORS.info)
    .setTimestamp();

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
      .setPlaceholder('Choisissez votre réponse...');

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
    return interaction.reply({ content: 'Cette question est terminée ou invalide.', ephemeral: true });
  }

  // S'assurer que le profil membre existe (nécessaire pour la relation EventParticipant -> MemberProfile)
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

  // Créer ou récupérer le participant
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

  // Mettre à jour le score global du participant
  const allResponses = await prisma.eventQuizResponse.findMany({
    where: { participantId: participant.id },
  });

  const newScore = allResponses.filter((r) => r.isCorrect).length;

  await prisma.eventParticipant.update({
    where: { id: participant.id },
    data: { score: newScore },
  });

  return interaction.reply({
    content: `Ta réponse a été enregistrée : **${(question.options as string[])[optionIndex]}**`,
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

  const currentQuestion = event.questions.find((q) => q.status === 'ONGOING') || event.questions[event.questions.length - 1];
  
  if (!currentQuestion) return null;

  const distribution: Record<number, number> = {};
  (currentQuestion.options as string[]).forEach((_, idx) => (distribution[idx] = 0));

  currentQuestion.responses.forEach((r) => {
    distribution[r.optionIndex] = (distribution[r.optionIndex] || 0) + 1;
  });

  return {
    questionId: currentQuestion.id,
    questionText: currentQuestion.text,
    distribution,
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
        orderBy: { score: 'desc' },
      },
    },
  });

  if (!event || !event.messageId || !event.channelId) throw new Error('Événement introuvable');

  const channel = (await client.channels.fetch(event.channelId).catch(() => null)) as TextChannel | null;
  if (!channel) throw new Error('Salon Discord introuvable');

  const message = await channel.messages.fetch(event.messageId).catch(() => null);
  
  const leaderboard = event.participants
    .slice(0, 10)
    .map((p, i) => `${i + 1}. **${p.userTag || p.userId}** — ${p.score} pts`)
    .join('\n') || 'Aucun participant.';

  const embed = new EmbedBuilder()
    .setTitle(`🏁 Événement terminé : ${event.title}`)
    .setDescription(`Bravo à tous les participants !\n\n**Classement Final :**\n${leaderboard}`)
    .setColor(COLORS.success)
    .setTimestamp();

  if (message) {
    await message.edit({ embeds: [embed], components: [] });
  } else {
    await channel.send({ embeds: [embed] });
  }

  await prisma.event.update({
    where: { id: eventId },
    data: { status: 'COMPLETED' },
  });

  // Ici on pourrait ajouter de la logique pour mettre à jour les profils (XP, badges, etc.)
  // Pour l'instant, les participations sont déjà liées aux profils via le schéma.

  return { status: 'completed' };
}
