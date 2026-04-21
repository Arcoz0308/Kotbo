import {
  type Interaction,
  type Client,
  TextChannel,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalSubmitInteraction,
  MessageFlags,
  type ButtonInteraction,
  type ColorResolvable,
  type AnySelectMenuInteraction,
} from 'discord.js';
import prisma from '../utils/db.js';
import { logger } from '../utils/logger.js';
import { DigestFrequency } from '@prisma/client';
import { COLORS, errorEmbed, successEmbed, infoEmbed, feedStatusEmoji, truncate } from '../utils/embeds.js';
import { sendFeedsPanel, buildAddFeedModal, sendRoleSelectionPanel, sendChannelSelectionPanel, sendDigestPanel, sendDigestRoleSelectionPanel, buildDigestModal, sendYouTubeConfigPanel, sendYouTubeRoleSelectionPanel, sendGlobalKeywordsPanel, sendFeedKeywordsPanel, buildKeywordModal } from '../panels/configPanel.js';
import { sendMainConfigPanel } from '../panels/generalConfigPanel.js';
import { handleConfigButton, handleConfigChannelSelect, handleConfigModal, handleConfigSelectMenu } from './configHandler.js';
import { sendSetupStep1, sendSetupStep2, sendSetupStep3, sendSetupStep4, sendSetupStep5, sendSetupFinish, buildSetupDigestModal } from '../panels/setupPanel.js';
import { sendApprovedItem } from '../services/notificationService.js';
import { sendDMSubscribePanel } from '../services/notificationService.js';
import { translate } from '../services/translationService.js';
import { reviewDailyAlgoSubmission } from '../services/dailyAlgoService.js';
import { extractDigestTopics } from '../services/digestService.js';
import { PermissionFlagsBits, type GuildMember } from 'discord.js';
import { extractKeywords } from '../utils/keywords.js';
import {
  createSession,
  getSession,
  deleteSession,
  advanceSession,
  sessionKey,
  type KeywordSession,
} from './keywordSessionStore.js';
import { getNewsSession, deleteNewsSession, updateNewsSession } from './newsSessionStore.js';
import { sendToValidationQueue } from '../services/notificationService.js';
import { TextInputBuilder, TextInputStyle } from 'discord.js';
import { ModalBuilder } from 'discord.js';
import { fetchArticleMetadata } from '../utils/metadataParser.js';
import { applyTopicFeedback, extractInterestTopics } from '../services/interestService.js';
import { renderPanelTarget } from '../utils/interactionResponses.js';
import { parseModalSessionId, parseNewsSessionId, parseSetupStep, parseUserCaseRoute, parseValidateRoute } from './interactionRoutes.js';
import { toggleFeedBoolean, toggleGuildBoolean } from '../utils/prismaToggles.js';
import { normalizeCommaKeywords, requireSingleSelectedValue, validateTimeField } from '../utils/interactionValidation.js';
import { buildMemberCasePanel, type MemberCaseSection } from '../services/memberCaseService.js';
import { handleRecruitmentButton } from '../services/recruitmentService.js';
import { checkInMeeting } from '../services/staffLeadershipService.js';

function canUpdateInteraction(value: unknown): value is { update: (options: unknown) => Promise<unknown> } {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { update?: unknown };
  return typeof candidate.update === 'function';
}

function normalizeTargetLanguage(value: string | null | undefined): 'FR' | 'EN' | 'ES' | 'DE' {
  const normalized = value?.trim().toUpperCase();
  if (normalized === 'EN' || normalized === 'ES' || normalized === 'DE') {
    return normalized;
  }
  return 'FR';
}

type PendingDailyAlgoScoreDraft = {
  submissionId: string;
  moderatorId: string;
  createdAt: number;
  scores: {
    correctness: number;
    comments: number;
    compactness: number;
    optimization: number;
    readability: number;
  };
};

const pendingDailyAlgoScoreDrafts = new Map<string, PendingDailyAlgoScoreDraft>();

function pendingDailyAlgoDraftKey(submissionId: string, moderatorId: string): string {
  return `${submissionId}:${moderatorId}`;
}

function prunePendingDailyAlgoDrafts(): void {
  const now = Date.now();
  const maxAgeMs = 30 * 60 * 1000;

  for (const [key, draft] of pendingDailyAlgoScoreDrafts.entries()) {
    if (now - draft.createdAt > maxAgeMs) {
      pendingDailyAlgoScoreDrafts.delete(key);
    }
  }
}

async function canModerate(member: GuildMember | null, guildId: string): Promise<boolean> {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;

  const guild = await prisma.guild.findUnique({ where: { id: guildId } });
  if (guild?.moderatorRoleId && member.roles.cache.has(guild.moderatorRoleId)) {
    return true;
  }

  return false;
}

async function resolveGuildMemberByUserId(interaction: Interaction, userId: string): Promise<GuildMember | null> {
  const guild = interaction.guild;
  if (!guild) return null;
  return guild.members.fetch(userId).catch(() => null);
}

export async function handleButton(interaction: Interaction, client: Client): Promise<void> {
  if (!interaction.isButton()) return;

  const { customId, guildId, user } = interaction;

  const caseRoute = parseUserCaseRoute(customId);
  if (caseRoute) {
    if (!guildId) {
      await interaction.reply({ content: '❌ Le casier utilisateur est disponible uniquement sur un serveur.', flags: [MessageFlags.Ephemeral] });
      return;
    }

    const member = await resolveGuildMemberByUserId(interaction, user.id);
    if (!(await canModerate(member, guildId))) {
      await interaction.reply({ content: '❌ Tu n’as pas les permissions nécessaires pour ouvrir un casier utilisateur.', flags: [MessageFlags.Ephemeral] });
      return;
    }

    if (caseRoute.action === 'close') {
      await interaction.update({ content: '📁 Casier fermé.', embeds: [], components: [] });
      return;
    }

    const section: MemberCaseSection = caseRoute.section ?? 'resume';
    const pageIndex = caseRoute.action === 'prev'
      ? Math.max(0, (caseRoute.pageIndex ?? 0) - 1)
      : caseRoute.action === 'next'
        ? (caseRoute.pageIndex ?? 0) + 1
        : caseRoute.pageIndex ?? 0;

    const panel = await buildMemberCasePanel(interaction.guild!, caseRoute.userId, section, pageIndex);
    await renderPanelTarget(interaction, {
      embeds: [panel.embed],
      components: panel.components,
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  // Recruitment ticket buttons
  if (customId.startsWith('recruit:')) {
    await handleRecruitmentButton(client, customId, interaction);
    return;
  }

  if (customId.startsWith('digest:feedback:')) {
    if (!guildId) {
      await interaction.reply({ content: '❌ Ce feedback doit être envoyé depuis un serveur.', flags: [MessageFlags.Ephemeral] });
      return;
    }

    const direction = customId.endsWith(':up') ? 'up' : 'down';
    const since = new Date();
    since.setHours(0, 0, 0, 0);

    const feedIds = (await prisma.feed.findMany({ where: { guildId }, select: { id: true } })).map((feed) => feed.id);
    if (feedIds.length === 0) {
      await interaction.reply({ content: 'ℹ️ Aucun flux configuré pour ce serveur.', flags: [MessageFlags.Ephemeral] });
      return;
    }

    const recentItems = await prisma.feedItem.findMany({
      where: {
        feedId: { in: feedIds },
        status: 'APPROVED',
        createdAt: { gte: since },
      },
      select: {
        id: true,
        title: true,
        titleTranslated: true,
        description: true,
        descriptionTranslated: true,
        topics: true,
      },
      orderBy: { publishedAt: 'desc' },
      take: 40,
    });

    const digestTopics = extractDigestTopics(recentItems.map((item) => ({
      title: item.titleTranslated ?? item.title,
      description: item.descriptionTranslated ?? item.description,
      topics: item.topics,
    })));

    if (digestTopics.length === 0) {
      await interaction.reply({ content: 'ℹ️ Je n’ai pas assez de signal pour apprendre depuis ce digest.', flags: [MessageFlags.Ephemeral] });
      return;
    }

    await applyTopicFeedback({
      guildId,
      userId: user.id,
      topics: digestTopics,
      source: direction === 'up' ? 'USER_INTERESTING' : 'USER_NOT_INTERESTING',
      isPositive: direction === 'up',
      applyToGuildProfile: true,
    });

    const text = direction === 'up'
      ? `✅ Merci. Je vais favoriser ces thèmes: ${digestTopics.slice(0, 4).join(', ')}`
      : `✅ Bien reçu. Je vais réduire ces thèmes: ${digestTopics.slice(0, 4).join(', ')}`;

    await interaction.reply({ content: text, flags: [MessageFlags.Ephemeral] });
    return;
  }

  if (customId.startsWith('interest:rss:')) {
    const [, , itemId, direction] = customId.split(':');
    const item = await prisma.feedItem.findUnique({ where: { id: itemId }, include: { feed: true } });
    if (!item) {
      await interaction.reply({ content: '❌ News introuvable pour ce feedback.', flags: [MessageFlags.Ephemeral] });
      return;
    }

    const topics = item.topics.length > 0 ? item.topics : extractInterestTopics(item.title, item.description);

    await applyTopicFeedback({
      guildId: item.feed.guildId,
      userId: user.id,
      topics,
      source: direction === 'up' ? 'USER_INTERESTING' : 'USER_NOT_INTERESTING',
      isPositive: direction === 'up',
      feedItemId: item.id,
      applyToGuildProfile: true,
    });

    const text = direction === 'up'
      ? '✅ Merci, je vais proposer plus de sujets similaires.'
      : '✅ Bien reçu, je vais réduire ce type de sujets.';

    await interaction.reply({ content: text, flags: [MessageFlags.Ephemeral] });
    return;
  }

  if (customId.startsWith('dm:toggle:')) {
    const feedId = customId.split(':')[2];
    await interaction.deferUpdate();

    const existing = await prisma.userFeedSub.findFirst({ where: { userId: user.id, feedId } });
    if (existing) {
      await prisma.userFeedSub.delete({ where: { id: existing.id } });
    } else {
      await prisma.userFeedSub.create({ data: { userId: user.id, feedId } });
    }

    const feed = await prisma.feed.findUnique({ where: { id: feedId } });
    if (feed) {
      await sendDMSubscribePanel(user, feed.guildId);
    }
    return;
  }

  if (customId.startsWith('meeting_rsvp_')) {
    const parts = customId.split('_');
    const statusType = parts[2]; // present, excused, absent
    const meetingId = parts[3];

    const statusMap = {
      present: 'PRESENT',
      excused: 'EXCUSED',
      absent: 'ABSENT',
    } as const;

    const status = statusMap[statusType as keyof typeof statusMap];
    if (!status) return;

    if (!guildId) {
      await interaction.reply({ content: '❌ Action impossible hors serveur.', flags: [MessageFlags.Ephemeral] });
      return;
    }

    const staffMember = await prisma.staffMember.findFirst({
      where: { guildId, userId: user.id },
    });

    if (!staffMember) {
      await interaction.reply({
        content: '❌ Vous ne faites pas partie de l\'équipe staff enregistrée sur ce serveur.',
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    try {
      await checkInMeeting(meetingId, staffMember.id, status);
      const labels = { PRESENT: 'Présent ✅', EXCUSED: 'Excusé 📝', ABSENT: 'Absent ❌' };
      await interaction.reply({
        content: `✅ Votre statut pour cette réunion est désormais : **${labels[status]}**.`,
        flags: [MessageFlags.Ephemeral],
      });
    } catch (error) {
      logger.error('Handler', `Error during meeting RSVP: ${error}`);
      await interaction.reply({
        content: '❌ Une erreur est survenue lors de l\'enregistrement de votre réponse.',
        flags: [MessageFlags.Ephemeral],
      });
    }
    return;
  }

  if (customId.startsWith('daily-algo-feedback:')) {
    if (!guildId) {
      await interaction.reply({
        content: '❌ Cette action doit être faite depuis le serveur.',
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const submissionId = customId.split(':')[1];
    if (!submissionId) {
      await interaction.reply({
        content: '❌ Soumission introuvable.',
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    prunePendingDailyAlgoDrafts();
    const key = pendingDailyAlgoDraftKey(submissionId, interaction.user.id);
    const draft = pendingDailyAlgoScoreDrafts.get(key);

    if (!draft) {
      await interaction.reply({
        content: '⚠️ Le brouillon de notation a expiré. Clique de nouveau sur **Noter**.',
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const feedbackModal = new ModalBuilder()
      .setCustomId(`modal:daily-algo-feedback:${submissionId}`)
      .setTitle('🗒️ Explication de la note');

    const feedbackInput = new TextInputBuilder()
      .setCustomId('score_feedback')
      .setLabel('Pourquoi la note est < 5 ?')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Explique ce qui va, ce qui manque, et comment améliorer la solution.')
      .setRequired(true)
      .setMaxLength(1000);

    feedbackModal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(feedbackInput),
    );

    await interaction.showModal(feedbackModal);
    return;
  }

  if (!guildId) return;

  const setupStep = parseSetupStep(customId);
  if (setupStep) {
    const step = setupStep;

    if (step === 'step1') await sendSetupStep1(client, guildId, interaction);
    else if (step === 'step2') await sendSetupStep2(client, guildId, interaction);
    else if (step === 'step3') await sendSetupStep3(client, guildId, interaction);
    else if (step === 'step4') await sendSetupStep4(client, guildId, interaction);
    else if (step === 'step5') await sendSetupStep5(client, guildId, interaction);
    else if (step === 'finish') await sendSetupFinish(client, guildId, interaction);

    else if (step === 'yt_toggle') {
      await toggleGuildBoolean(guildId, 'youtubeEnabled');
      await sendSetupStep3(client, guildId, interaction);
    }
    else if (step === 'digest_toggle') {
      await toggleGuildBoolean(guildId, 'digestEnabled');
      await sendSetupStep4(client, guildId, interaction);
    }
    else if (step === 'trans_toggle') {
      await toggleGuildBoolean(guildId, 'translationEnabled');
      await sendSetupStep5(client, guildId, interaction);
    }
    else if (step === 'digest_time_btn') {
      const guild = await prisma.guild.findUnique({ where: { id: guildId } });
      await interaction.showModal(buildSetupDigestModal(guild));
    }
    else if (step === 'digest_clear_role') {
      await prisma.guild.update({ where: { id: guildId }, data: { digestRoleId: null } });
      await sendSetupStep4(client, guildId, interaction);
    }
    return;
  }

  if (customId.startsWith('cfg:')) {
    await handleConfigButton(interaction);
    return;
  }

  if (customId === 'config:feeds') {
    await sendFeedsPanel(client, guildId, interaction);
    return;
  }

  if (customId === 'config:keywords') {
    await sendGlobalKeywordsPanel(client, guildId, interaction);
    return;
  }

  if (customId.startsWith('config:kw:global:')) {
    const action = customId.split(':')[3];
    if (action === 'clear_confirm') {
      const embed = new EmbedBuilder()
        .setColor(COLORS.danger)
        .setTitle('⚠ Confirmation')
        .setDescription('Êtes-vous sûr de vouloir effacer TOUS les mots-clés globaux ?');
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('config:kw:global:clear_execute').setLabel('Oui, tout effacer').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('config:keywords').setLabel('Annuler').setStyle(ButtonStyle.Secondary),
      );
      await interaction.reply({ embeds: [embed], components: [row], flags: [MessageFlags.Ephemeral] });
    } else if (action === 'clear_execute') {
      await interaction.deferUpdate();
      await prisma.guild.update({
        where: { id: guildId },
        data: { globalIncludeKeywords: [], globalExcludeKeywords: [], globalIgnoredKeywords: [] },
      });
      await interaction.followUp({ content: '✅ Tous les mots-clés globaux ont été effacés.', flags: [MessageFlags.Ephemeral] });
      await sendGlobalKeywordsPanel(client, guildId, interaction.channel as TextChannel);
    } else {
      const modeNames = { include: 'Inclure (Global)', exclude: 'Exclure (Global)', ignore: 'Ignorer (Global)' };
      await interaction.showModal(buildKeywordModal(`modal:kw:global:${action}`, modeNames[action as keyof typeof modeNames]));
    }
    return;
  }

  if (customId.startsWith('config:kw:feed_panel:')) {
    const feedId = customId.split(':')[3];
    await sendFeedKeywordsPanel(client, guildId, feedId, interaction);
    return;
  }

  if (customId.startsWith('config:kw:feed:')) {
    const parts = customId.split(':');
    const action = parts[3];
    const feedId = parts[4];
    
    if (action === 'clear_confirm') {
      const embed = new EmbedBuilder()
        .setColor(COLORS.danger)
        .setTitle('⚠ Confirmation')
        .setDescription('Êtes-vous sûr de vouloir effacer TOUS les mots-clés de ce flux ?');
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`config:kw:feed:clear_execute:${feedId}`).setLabel('Oui, tout effacer').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`config:kw:feed_panel:${feedId}`).setLabel('Annuler').setStyle(ButtonStyle.Secondary),
      );
      await interaction.reply({ embeds: [embed], components: [row], flags: [MessageFlags.Ephemeral] });
    } else if (action === 'clear_execute') {
       await interaction.deferUpdate();
       await prisma.feed.update({
         where: { id: feedId },
         data: { includeKeywords: [], excludeKeywords: [], ignoredKeywords: [] },
       });
       await interaction.followUp({ content: '✅ Tous les mots-clés du flux ont été effacés.', flags: [MessageFlags.Ephemeral] });
       await sendFeedKeywordsPanel(client, guildId, feedId, interaction.channel as TextChannel);
    } else {
      const modeNames = { include: 'Inclure (Flux)', exclude: 'Exclure (Flux)', ignore: 'Ignorer (Flux)' };
      await interaction.showModal(buildKeywordModal(`modal:kw:feed:${action}:${feedId}`, modeNames[action as keyof typeof modeNames]));
    }
    return;
  }

  if (customId === 'config:back' || customId === 'config:refresh') {
    await sendMainConfigPanel(interaction, guildId);
    return;
  }

  if (customId === 'config:feed:add') {
    await interaction.showModal(buildAddFeedModal());
    return;
  }

  if (customId === 'config:feed:autopub_all') {
    const feeds = await prisma.feed.findMany({ where: { guildId } });
    if (feeds.length) {
      const allAutoPublish = feeds.every((f) => f.autoPublish);
      await prisma.feed.updateMany({ where: { guildId }, data: { autoPublish: !allAutoPublish } });
    }
    await sendFeedsPanel(client, guildId, interaction);
    return;
  }

  if (customId === 'config:youtube_panel') {
    await sendYouTubeConfigPanel(client, guildId, interaction);
    return;
  }

  if (customId === 'config:youtube_toggle') {
    await interaction.deferUpdate();
    await toggleGuildBoolean(guildId, 'youtubeEnabled');
    
    await sendYouTubeConfigPanel(client, guildId, interaction);
    return;
  }

  if (customId === 'config:yt_role_short') {
    await sendYouTubeRoleSelectionPanel(client, guildId, interaction, 'short');
    return;
  }

  if (customId === 'config:yt_role_video') {
    await sendYouTubeRoleSelectionPanel(client, guildId, interaction, 'video');
    return;
  }

  if (customId === 'config:reset_yt_short_role') {
    await interaction.deferUpdate();
    await prisma.guild.update({ where: { id: guildId }, data: { youtubeShortRoleId: null } });
    await sendYouTubeConfigPanel(client, guildId, interaction);
    return;
  }

  if (customId === 'config:reset_yt_video_role') {
    await interaction.deferUpdate();
    await prisma.guild.update({ where: { id: guildId }, data: { youtubeVideoRoleId: null } });
    await sendYouTubeConfigPanel(client, guildId, interaction);
    return;
  }

  if (customId === 'config:digest') {
    await sendDigestPanel(client, guildId, interaction);
    return;
  }

  if (customId === 'config:digest:panel') {
    await sendDigestPanel(client, guildId, interaction);
    return;
  }

  if (customId === 'config:digest:toggle') {
    await interaction.deferUpdate();
    await toggleGuildBoolean(guildId, 'digestEnabled');
    await sendDigestPanel(client, guildId, interaction);
    return;
  }

  if (customId === 'config:digest:freq') {
    await interaction.deferUpdate();
    const guild = await prisma.guild.findUnique({ where: { id: guildId } });
    if (!guild) return;
    const currentFreq = guild.digestFrequency;
    await prisma.guild.update({
      where: { id: guildId },
      data: { digestFrequency: currentFreq === DigestFrequency.DAILY ? DigestFrequency.WEEKLY : DigestFrequency.DAILY },
    });
    await sendDigestPanel(client, guildId, interaction);
    return;
  }

  if (customId === 'config:digest:text') {
    const guild = await prisma.guild.findUnique({ where: { id: guildId } });
    await interaction.showModal(buildDigestModal(guild));
    return;
  }

  if (customId === 'config:digest:role') {
    await sendDigestRoleSelectionPanel(client, guildId, interaction);
    return;
  }

  if (customId === 'config:digest:reset_role') {
    await interaction.deferUpdate();
    await prisma.guild.update({ where: { id: guildId }, data: { digestRoleId: null } });
    await sendDigestPanel(client, guildId, interaction);
    return;
  }

  if (customId === 'config:translation') {
    await interaction.deferUpdate();
    await toggleGuildBoolean(guildId, 'translationEnabled');
    await sendMainConfigPanel(interaction, guildId);
    return;
  }

  if (customId === 'config:channels') {
    await interaction.reply({
      content: '📌 Pour modifier les salons de base (Config/Public), utilisez `/setup`. Pour le salon YouTube, utilisez le bouton "Salon YT" ci-dessous.',
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  if (customId === 'config:set_mod_role') {
    await sendRoleSelectionPanel(client, guildId, interaction);
    return;
  }

  if (customId === 'config:set_yt_channel') {
    await sendChannelSelectionPanel(client, guildId, interaction);
    return;
  }

  if (customId === 'config:reset_mod_role') {
    await prisma.guild.update({ where: { id: guildId }, data: { moderatorRoleId: null } });
    await sendMainConfigPanel(interaction, guildId);
    return;
  }

  if (customId === 'config:reset_yt_channel') {
    await prisma.guild.update({ where: { id: guildId }, data: { youtubeChannelId: null } });
    await sendMainConfigPanel(interaction, guildId);
    return;
  }

  // ── Feed Select Actions ──────────────────────────────────────────────────

  if (customId.startsWith('feed:toggle:')) {
    const feedId = customId.split(':')[2];
    await interaction.deferUpdate();
    const toggled = await toggleFeedBoolean(feedId, 'enabled');
    if (toggled !== null) {
      await sendFeedsPanel(client, guildId, interaction);
    }
    return;
  }

  if (customId.startsWith('feed:autopub:')) {
    const feedId = customId.split(':')[2];
    await interaction.deferUpdate();
    const toggled = await toggleFeedBoolean(feedId, 'autoPublish');
    if (toggled !== null) {
      await sendFeedsPanel(client, guildId, interaction);
    }
    return;
  }

  if (customId.startsWith('feed:delete:')) {
    const feedId = customId.split(':')[2];
    await interaction.deferUpdate();
    const feed = await prisma.feed.findUnique({ where: { id: feedId } });
    if (feed) {
      await prisma.feed.delete({ where: { id: feedId } });
      await sendFeedsPanel(client, guildId, interaction);
    }
    return;
  }

  const validateRoute = parseValidateRoute(customId);
  if (validateRoute) {
    const { action, type, itemId } = validateRoute;

    const member = await resolveGuildMemberByUserId(interaction, user.id);
    if (!(await canModerate(member, guildId))) {
      await interaction.reply({ content: '❌ Vous n\'avez pas le rôle modérateur requis pour cette action.', flags: [MessageFlags.Ephemeral] });
      return;
    }

    // Rate action opens a modal — must NOT deferUpdate first
    if (action === 'rate' && type === 'daily-algo') {
      const ratingModal = new ModalBuilder()
        .setCustomId(`modal:daily-algo-rate:${itemId}`)
        .setTitle('📝 Noter la solution');

      const correctnessInput = new TextInputBuilder()
        .setCustomId('score_correctness')
        .setLabel('✅ Exactitude (fonctionnement / cas limites)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('1 à 5')
        .setRequired(true)
        .setMaxLength(1);

      const commentsInput = new TextInputBuilder()
        .setCustomId('score_comments')
        .setLabel('💬 Commentaires (clarté / explications)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('1 à 5')
        .setRequired(true)
        .setMaxLength(1);

      const compactnessInput = new TextInputBuilder()
        .setCustomId('score_compactness')
        .setLabel('📦 Compacité (efficacité / pas de superflu)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('1 à 5')
        .setRequired(true)
        .setMaxLength(1);

      const optimizationInput = new TextInputBuilder()
        .setCustomId('score_optimization')
        .setLabel('⚡ Optimisation (performance / runtime)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('1 à 5')
        .setRequired(true)
        .setMaxLength(1);

      const readabilityInput = new TextInputBuilder()
        .setCustomId('score_readability')
        .setLabel('🧹 Lisibilité (propreté / formatage)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('1 à 5')
        .setRequired(true)
        .setMaxLength(1);

      ratingModal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(correctnessInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(commentsInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(compactnessInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(optimizationInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(readabilityInput),
      );

      await interaction.showModal(ratingModal);
      return;
    }

    await interaction.deferUpdate();

    if (action === 'approve') {

      if (type === 'rss' || type === 'youtube') {
        await sendApprovedItem(client, itemId, type);
      }
      try {
        await interaction.message.delete();
      } catch (e) {
        logger.error('Handler', `Failed to delete message: ${e}`);
      }
      logger.success('Handler', `Approved ${type} item ${itemId} by ${user.tag}`);

      if (type === 'rss') {
        const item = await prisma.feedItem.findUnique({ where: { id: itemId }, include: { feed: true } });
        if (item) {
          const topics = item.topics.length > 0 ? item.topics : extractInterestTopics(item.title, item.description);
          await applyTopicFeedback({
            guildId,
            userId: user.id,
            topics,
            source: 'STAFF_APPROVE',
            isPositive: true,
            feedItemId: item.id,
            applyToGuildProfile: true,
          });
        }
      }
    }

    else if (action === 'reject') {
      if (type === 'daily-algo') {
        await reviewDailyAlgoSubmission({
          client,
          submissionId: itemId,
          action: 'reject',
          moderatorId: user.id,
        });
        logger.info('Handler', `Rejected daily algo submission ${itemId}`);
        return;
      }

      if (type === 'rss') {
        await prisma.feedItem.update({ where: { id: itemId }, data: { status: 'REJECTED' } });
      } else {
        await prisma.youTubeItem.update({ where: { id: itemId }, data: { status: 'REJECTED' } });
      }
      try {
        await interaction.message.delete();
      } catch (e) {
        logger.error('Handler', `Failed to delete message: ${e}`);
      }
      logger.info('Handler', `Rejected ${type} item ${itemId}`);

      if (type === 'rss') {
        const item = await prisma.feedItem.findUnique({ where: { id: itemId }, include: { feed: true } });
        if (item) {
          const topics = item.topics.length > 0 ? item.topics : extractInterestTopics(item.title, item.description);
          await applyTopicFeedback({
            guildId,
            userId: user.id,
            topics,
            source: 'STAFF_REJECT',
            isPositive: false,
            feedItemId: item.id,
            applyToGuildProfile: true,
          });
        }
      }
    }

    else if (action === 'translate') {
      if (type !== 'rss') { await interaction.followUp({ content: 'Traduction non disponible pour YouTube.', flags: [MessageFlags.Ephemeral] }); return; }
      const item = await prisma.feedItem.findUnique({ where: { id: itemId } });
      if (!item) return;
      const guild = await prisma.guild.findUnique({ where: { id: guildId } });
      const targetLang = normalizeTargetLanguage(guild?.defaultTranslateTo);

      const currentEmbed = interaction.message.embeds[0];
      const baseFooterText = currentEmbed?.footer?.text ?? '';
      const pendingFooterText = baseFooterText
        ? `${baseFooterText} · ⏳ Traduction en cours`
        : '⏳ Traduction en cours';

      if (currentEmbed) {
        const pendingEmbed = EmbedBuilder.from(currentEmbed).setFooter({ text: pendingFooterText });
        await interaction.message.edit({ embeds: [pendingEmbed] });
      }

      const [titleTranslated, descriptionTranslated] = await Promise.all([
        translate(item.title, targetLang),
        item.description ? translate(item.description, targetLang) : Promise.resolve(null),
      ]);

      if (!titleTranslated && !descriptionTranslated) {
        if (currentEmbed) {
          const revertedEmbed = EmbedBuilder.from(currentEmbed).setFooter({ text: baseFooterText || 'Kotbo · Bot d’actualité' });
          await interaction.message.edit({ embeds: [revertedEmbed] });
        }
        await interaction.followUp({ content: '⚠️ Erreur lors de la traduction.', flags: [MessageFlags.Ephemeral] });
        return;
      }

      const updateData: { titleTranslated?: string; descriptionTranslated?: string } = {};
      if (titleTranslated) updateData.titleTranslated = titleTranslated;
      if (descriptionTranslated) updateData.descriptionTranslated = descriptionTranslated;

      await prisma.feedItem.update({
        where: { id: itemId },
        data: updateData,
      });

      const nextTitle = titleTranslated ?? item.titleTranslated ?? item.title;
      const nextDescription = descriptionTranslated ?? item.descriptionTranslated ?? item.description ?? currentEmbed?.description ?? null;
      const hasSourceDescription = Boolean((item.description ?? '').trim());
      const hasTitleTranslation = Boolean((titleTranslated ?? item.titleTranslated ?? '').trim());
      const hasDescriptionTranslation = !hasSourceDescription || Boolean((descriptionTranslated ?? item.descriptionTranslated ?? '').trim());
      const translationPending = !(hasTitleTranslation && hasDescriptionTranslation);
      const finalFooterText = translationPending
        ? (baseFooterText ? `${baseFooterText} · ⏳ Traduction en cours` : '⏳ Traduction en cours')
        : (baseFooterText || 'Kotbo · Bot d’actualité');

      if (currentEmbed) {
        const updatedEmbed = EmbedBuilder.from(currentEmbed)
          .setTitle(truncate(nextTitle, 256))
          .setDescription(nextDescription)
          .setFooter({ text: finalFooterText });
        await interaction.message.edit({ embeds: [updatedEmbed] });
      }
    }

    else if (action === 'pin') {
      if (type === 'rss') {
        await prisma.feedItem.update({ where: { id: itemId }, data: { pinned: true } });
      }
      const embed = EmbedBuilder.from(interaction.message.embeds[0]).setFooter({ text: `📌 Sera épinglé à la validation · ID: ${itemId}` });
      await interaction.message.edit({ embeds: [embed] });
    }
    return;
  }

  if (customId.startsWith('kw:')) {
    await handleKeywordButton(interaction);
    return;
  }

  if (customId.startsWith('public:pin:')) {
    const parts = customId.split(':');
    const type = parts[2];
    const itemId = parts[3];
    await interaction.deferUpdate();
    try {
      if (type === 'rss') {
        const item = await prisma.feedItem.findUnique({ where: { id: itemId } });
        if (!item) return;

        const isPinned = item.pinned;

        if (isPinned) {
          await interaction.message.unpin();
          await prisma.feedItem.update({ where: { id: itemId }, data: { pinned: false } });
        } else {
          await interaction.message.pin();
          await prisma.feedItem.update({ where: { id: itemId }, data: { pinned: true } });
          
          setTimeout(async () => {
            if (interaction.channel) {
              const fetched = await interaction.channel.messages.fetch({ limit: 10 }).catch(() => null);
              if (fetched) {
                const sysMsg = fetched.find((m) => m.type === 6 && m.reference?.messageId === interaction.message.id);
                if (sysMsg) await sysMsg.delete().catch(() => null);
              }
            }
          }, 1500);
        }

        const row = interaction.message.components[0] as import('discord.js').ActionRow<import('discord.js').MessageActionRowComponent>;
        if (row && row.components) {
          const updatedComponents = row.components.map((c) => {
            const btn = c as import('discord.js').ButtonComponent;
            if (btn.customId === customId) {
              return ButtonBuilder.from(btn).setLabel(isPinned ? 'Épingler' : 'Désépingler');
            }
            return ButtonBuilder.from(btn);
          });
          await interaction.message.edit({ components: [new ActionRowBuilder<ButtonBuilder>().addComponents(updatedComponents)] });
        }
      }
    } catch {
      await interaction.followUp({ content: '❌ Impossible de modifier l\'épinglage de ce message.', flags: [MessageFlags.Ephemeral] });
    }
    return;
  }

  if (customId.startsWith('subscribe:feed:')) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    try {
      await sendDMSubscribePanel(user, guildId);
      await interaction.editReply({ content: '📬 Panneau d\'abonnement envoyé en message privé !' });
    } catch {
      await interaction.editReply({ content: '❌ Impossible de vous envoyer un message privé. Vérifiez vos paramètres Discord.' });
    }
    return;
  }

  if (customId.startsWith('news:add_detected:') || customId.startsWith('news:add_manual:')) {
    const sessionId = parseNewsSessionId(customId, customId.startsWith('news:add_detected:') ? 'news:add_detected:' : 'news:add_manual:');
    if (!sessionId) return;
    const session = getNewsSession(sessionId);

    if (!session) {
      await interaction.reply({ content: '❌ Cette session a expiré. Veuillez relancer la commande `/news submit`.', flags: [MessageFlags.Ephemeral] });
      return;
    }

    const isDetected = customId.startsWith('news:add_detected:');
    
    const modal = new ModalBuilder()
      .setCustomId(`modal:news:add_feed:${sessionId}`)
      .setTitle('Ajouter le flux RSS');

    const nameInput = new TextInputBuilder()
        .setCustomId('feed_name')
        .setLabel('Nom du flux')
        .setPlaceholder('Ex: Presse-Citron, Journal du Geek...')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    const urlInput = new TextInputBuilder()
        .setCustomId('feed_url')
        .setLabel('URL du flux RSS')
        .setValue(isDetected ? session.metadata.rssUrl! : '')
        .setPlaceholder('https://exemple.com/rss')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    const categoryInput = new TextInputBuilder()
        .setCustomId('feed_category')
        .setLabel('Catégorie')
      .setPlaceholder('Ex: Actualité Tech Générale (France), Intelligence Artificielle & Dev, Général...')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

    modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(urlInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(categoryInput)
    );

    await interaction.showModal(modal);
    return;
  }

  if (customId.startsWith('news:publish_no_feed:')) {
    const sessionId = parseNewsSessionId(customId, 'news:publish_no_feed:');
    if (!sessionId) return;
    const session = getNewsSession(sessionId);

    if (!session) {
      await interaction.reply({ content: '❌ Cette session a expiré.', flags: [MessageFlags.Ephemeral] });
      return;
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    // Check if item already exists
    const urlObj = new URL(session.url);
    const hostname = urlObj.hostname.replace('www.', '');

    // Find or create 'Manual' feed
    let manualFeed = await prisma.feed.findUnique({
      where: { guildId_url: { guildId, url: 'manual' } }
    });

    if (!manualFeed) {
      manualFeed = await prisma.feed.create({
        data: {
          guildId,
          name: 'Soumissions manuelles',
          url: 'manual',
          category: 'Manuel',
          enabled: true,
          autoPublish: false
        }
      });
    }

    const item = await prisma.feedItem.create({
      data: {
        feedId: manualFeed.id,
        guid: session.url,
        url: session.url,
        title: session.metadata.title || 'Sans titre',
        description: session.metadata.description,
        imageUrl: session.metadata.imageUrl,
        publishedAt: new Date(),
        status: 'PENDING',
      }
    });

    await sendToValidationQueue(client, item.id, 'rss');

    await interaction.editReply({
      embeds: [successEmbed('Article soumis !', `L'article a été envoyé en validation.\n\n**${session.metadata.title || 'Sans titre'}**`) ]
    });

    deleteNewsSession(sessionId);
    return;
  }

  if (customId.startsWith('news:edit_metadata:')) {
    const sessionId = parseNewsSessionId(customId, 'news:edit_metadata:');
    if (!sessionId) return;
    const session = getNewsSession(sessionId);

    if (!session) {
      await interaction.reply({ content: '❌ Cette session a expiré.', flags: [MessageFlags.Ephemeral] });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`modal:news:edit_metadata:${sessionId}`)
      .setTitle('Modifier la news');

    const titleInput = new TextInputBuilder()
      .setCustomId('news_title')
      .setLabel('Titre de l\'article')
      .setValue(session.metadata.title || '')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const descInput = new TextInputBuilder()
      .setCustomId('news_description')
      .setLabel('Début du texte / Description')
      .setValue(session.metadata.description || '')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(descInput)
    );

    await interaction.showModal(modal);
    return;
  }
}

async function startKeywordDialog(
  interaction: ButtonInteraction,
  itemId: string,
  feedId: string,
  guildId: string,
  title: string,
  description: string | null | undefined,
  mode: 'include' | 'exclude',
): Promise<void> {
  const feed = await prisma.feed.findUnique({ where: { id: feedId }, include: { guild: true } });
  if (!feed) return;

  const rawKeywords = extractKeywords(title, description);
  const keywords = rawKeywords.filter((w) => {
    return !feed.includeKeywords.includes(w) &&
           !feed.excludeKeywords.includes(w) &&
           !feed.ignoredKeywords.includes(w) &&
           !feed.guild.globalIncludeKeywords.includes(w) &&
           !feed.guild.globalExcludeKeywords.includes(w) &&
           !feed.guild.globalIgnoredKeywords.includes(w);
  });

  if (keywords.length === 0) return;

  const key = sessionKey(interaction.user.id, itemId);
  createSession(key, { keywords, index: 0, feedId, guildId, mode, messageId: null });

  const actionLabel = mode === 'exclude' ? 'exclure' : 'inclure';
  const modeColor = mode === 'exclude' ? COLORS.danger : COLORS.success;
  const modeEmoji = mode === 'exclude' ? '🚫' : '✅';

  const embed = buildKeywordEmbed(keywords, 0, mode, actionLabel, modeColor, modeEmoji);
  const row = buildKeywordRow(itemId, keywords[0], 0, mode);

  const msg = await interaction.followUp({
    embeds: [embed],
    components: [row],
    flags: [MessageFlags.Ephemeral],
  });

  const session = getSession(key);
  if (session) session.messageId = msg.id;
}

function buildKeywordEmbed(
  keywords: string[],
  index: number,
  mode: 'include' | 'exclude',
  actionLabel: string,
  modeColor: ColorResolvable,
  modeEmoji: string,
): EmbedBuilder {
  const word = keywords[index];
  const remaining = keywords.length - index - 1;

  return new EmbedBuilder()
    .setColor(modeColor)
    .setTitle(`${modeEmoji} Veux-tu **${actionLabel}** ce mot-clé ?`)
    .setDescription(
      `## \`${word}\`\n\n` +
      `**Mots-clés détectés dans l'article :** ${keywords.map((k, i) => i === index ? `**\`${k}\`**` : `\`${k}\``).join(', ')}\n\n` +
      `> Choisis une option ci-dessous.${remaining > 0 ? `\n> *${remaining} mot${remaining > 1 ? 's' : ''} restant${remaining > 1 ? 's' : ''} après celui-ci.*` : ''}`,
    )
    .setFooter({ text: `Mot ${index + 1} / ${keywords.length}` })
    .setTimestamp();
}

function buildKeywordRow(
  itemId: string,
  word: string,
  index: number,
  mode: 'include' | 'exclude',
): ActionRowBuilder<ButtonBuilder> {
  const base = `kw:${mode}:${itemId}:${index}`;

  const feedBtn = new ButtonBuilder()
    .setCustomId(`${base}:feed`)
    .setLabel('Pour ce flux')
    .setEmoji('🔒')
    .setStyle(mode === 'exclude' ? ButtonStyle.Danger : ButtonStyle.Success);

  const allBtn = new ButtonBuilder()
    .setCustomId(`${base}:all`)
    .setLabel('Toutes les sources')
    .setEmoji('🌐')
    .setStyle(ButtonStyle.Primary);

  const skipBtn = new ButtonBuilder()
    .setCustomId(`${base}:skip`)
    .setLabel('Passer')
    .setEmoji('⏭️')
    .setStyle(ButtonStyle.Secondary);

  const ignoreAllBtn = new ButtonBuilder()
    .setCustomId(`${base}:ignore_all`)
    .setLabel('Ne plus proposer')
    .setEmoji('🗑️')
    .setStyle(ButtonStyle.Secondary);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(feedBtn, allBtn, skipBtn, ignoreAllBtn);
}

async function handleKeywordButton(interaction: ButtonInteraction): Promise<void> {
  const parts = interaction.customId.split(':');
  if (parts.length < 5) return;

  const [, mode, itemId, indexStr, action] = parts;
  const index = parseInt(indexStr, 10);
  const key = sessionKey(interaction.user.id, itemId);

  const session = getSession(key);
  if (!session) {
    await interaction.reply({
      content: '⏱️ Cette session a expiré. Merci de valider/rejeter un article pour relancer le dialogue.',
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  if (session.index !== index) {
    await interaction.reply({
      content: '⚠️ Ce bouton est obsolète, le dialogue a déjà avancé.',
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const word = session.keywords[index];
  const filterMode = mode as 'include' | 'exclude';
  const field = filterMode === 'exclude' ? 'excludeKeywords' : 'includeKeywords';

  let confirmMsg = '';

  if (action === 'feed') {
    const feed = await prisma.feed.findUnique({ where: { id: session.feedId } });
    if (feed) {
      const existing = filterMode === 'exclude' ? feed.excludeKeywords : feed.includeKeywords;
      if (!existing.includes(word)) {
        await prisma.feed.update({
          where: { id: session.feedId },
          data: { [field]: { push: word } },
        });
      }
      const emoji = filterMode === 'exclude' ? '🚫' : '✅';
      confirmMsg = `${emoji} \`${word}\` ajouté aux mots-clés **${filterMode === 'exclude' ? 'exclus' : 'inclus'}** de **${feed.name}**.`;
    }
  } else if (action === 'all') {
    const field = filterMode === 'exclude' ? 'globalExcludeKeywords' : 'globalIncludeKeywords';
    const guild = await prisma.guild.findUnique({ where: { id: session.guildId } });
    if (guild) {
      const current = guild[field];
      if (!current.includes(word)) {
        await prisma.guild.update({
          where: { id: session.guildId },
          data: { [field]: { push: word } },
        });
      }
    }
    const emoji = filterMode === 'exclude' ? '🚫' : '✅';
    confirmMsg = `${emoji} \`${word}\` ajouté aux mots-clés **${filterMode === 'exclude' ? 'exclus' : 'inclus'}** globaux.`;
  } else if (action === 'ignore_all') {
    const guild = await prisma.guild.findUnique({ where: { id: session.guildId } });
    if (guild) {
      if (!guild.globalIgnoredKeywords.includes(word)) {
        await prisma.guild.update({
          where: { id: session.guildId },
          data: { globalIgnoredKeywords: { push: word } },
        });
      }
    }
    confirmMsg = `🗑️ \`${word}\` complètement ignoré (globalement).`;
  } else {
    confirmMsg = `⏭️ \`${word}\` passé.`;
  }

  const updated = advanceSession(key);
  if (!updated) return;

  const nextIndex = updated.index;

  if (nextIndex >= updated.keywords.length) {
    deleteSession(key);
    const doneEmbed = new EmbedBuilder()
      .setColor(COLORS.success)
      .setTitle('✅ Filtres mis à jour')
      .setDescription(`${confirmMsg}\n\n**Tous les mots-clés ont été traités !** Les filtres sont maintenant actifs.`)
      .setTimestamp();
    await interaction.update({ embeds: [doneEmbed], components: [] });
  } else {
    const actionLabel = filterMode === 'exclude' ? 'exclure' : 'inclure';
    const modeColor = filterMode === 'exclude' ? COLORS.danger : COLORS.success;
    const modeEmoji = filterMode === 'exclude' ? '🚫' : '✅';

    const nextWord = updated.keywords[nextIndex];
    const nextEmbed = buildKeywordEmbed(updated.keywords, nextIndex, filterMode, actionLabel, modeColor, modeEmoji);
    const footerEmbed = EmbedBuilder.from(nextEmbed).setDescription(
      `> *${confirmMsg}*\n\n` + (nextEmbed.data.description ?? '').toString(),
    );

    const nextRow = buildKeywordRow(itemId, nextWord, nextIndex, filterMode);
    await interaction.update({ embeds: [footerEmbed], components: [nextRow] });
  }
}

export async function handleSelectMenu(interaction: AnySelectMenuInteraction, client: Client): Promise<void> {
  const { customId, guildId, values } = interaction;
  if (!guildId) return;

  const caseRoute = parseUserCaseRoute(customId);
  if (caseRoute?.action === 'section') {
    if (!interaction.isStringSelectMenu()) return;

    const member = await resolveGuildMemberByUserId(interaction, interaction.user.id);
    if (!(await canModerate(member, guildId))) {
      await interaction.reply({ content: '❌ Tu n’as pas les permissions nécessaires pour ouvrir un casier utilisateur.', flags: [MessageFlags.Ephemeral] });
      return;
    }

    const section = values[0] as MemberCaseSection | undefined;
    if (!section) return;

    const panel = await buildMemberCasePanel(interaction.guild!, caseRoute.userId, section, caseRoute.pageIndex ?? 0);
    await interaction.update({ embeds: [panel.embed], components: panel.components });
    return;
  }

  if (customId.startsWith('news:recovery:topics')) {
    if (!interaction.isStringSelectMenu()) return;

    const member = await resolveGuildMemberByUserId(interaction, interaction.user.id);
    const canApplyGuild = await canModerate(member, guildId);

    for (const itemId of values) {
      const item = await prisma.feedItem.findUnique({ where: { id: itemId }, include: { feed: true } });
      if (!item) continue;

      const topics = item.topics.length > 0 ? item.topics : extractInterestTopics(item.title, item.description);
      await applyTopicFeedback({
        guildId,
        userId: interaction.user.id,
        topics,
        source: 'RECOVERY_OVERRIDE',
        isPositive: true,
        feedItemId: item.id,
        applyToGuildProfile: canApplyGuild,
      });

      await prisma.feedItem.update({
        where: { id: item.id },
        data: {
          interestDecision: 'ALLOWED',
          status: 'PENDING',
          interestReason: 'Reclassé via rattrapage modération',
          queueMessageId: null,
          publicMessageId: null,
        },
      });
    }

    await interaction.reply({
      content: `✅ ${values.length} sujet(s) ont été marqués comme intéressants et reclassés en file de traitement.`,
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  if (customId.startsWith('cfg:')) {
    if (interaction.isChannelSelectMenu()) {
      await handleConfigChannelSelect(interaction);
    } else if (interaction.isStringSelectMenu()) {
      await handleConfigSelectMenu(interaction);
    } else {
      return;
    }
    return;
  }

  const setupStep = parseSetupStep(customId);
  if (setupStep) {
    const step = setupStep;
    const val = await requireSingleSelectedValue(interaction, 'valeur');
    if (!val) return;

    if (step === 'select_config_channel') {
      await prisma.guild.upsert({
        where: { id: guildId },
        update: { configChannelId: val },
        create: { id: guildId, configChannelId: val },
      });
      await sendSetupStep1(client, guildId, interaction);
    }
    else if (step === 'select_public_channel') {
      await prisma.guild.upsert({
        where: { id: guildId },
        update: { publicChannelId: val },
        create: { id: guildId, publicChannelId: val },
      });
      await sendSetupStep1(client, guildId, interaction);
    }
    else if (step === 'select_mod_role') {
      await prisma.guild.update({ where: { id: guildId }, data: { moderatorRoleId: val } });
      await sendSetupStep2(client, guildId, interaction);
    }
    else if (step === 'yt_channel') {
      await prisma.guild.update({ where: { id: guildId }, data: { youtubeChannelId: val } });
      await sendSetupStep3(client, guildId, interaction);
    }
    else if (step === 'yt_role') {
      await prisma.guild.update({ where: { id: guildId }, data: { youtubeVideoRoleId: val } });
      await sendSetupStep3(client, guildId, interaction);
    }
    else if (step === 'digest_freq') {
      await prisma.guild.update({ where: { id: guildId }, data: { digestFrequency: val as DigestFrequency } });
      await sendSetupStep4(client, guildId, interaction);
    }
    else if (step === 'select_yt_short_role') {
      await prisma.guild.update({ where: { id: guildId }, data: { youtubeShortRoleId: val } });
      await sendSetupStep3(client, guildId, interaction);
    }
    else if (step === 'select_yt_video_role') {
      await prisma.guild.update({ where: { id: guildId }, data: { youtubeVideoRoleId: val } });
      await sendSetupStep3(client, guildId, interaction);
    }
    else if (step === 'select_digest_role') {
      await prisma.guild.update({ where: { id: guildId }, data: { digestRoleId: val } });
      await sendSetupStep4(client, guildId, interaction);
    }
    else if (step === 'trans_lang') {
      const targetLang = normalizeTargetLanguage(val);
      await prisma.guild.upsert({
        where: { id: guildId },
        update: { defaultTranslateTo: targetLang },
        create: { id: guildId, defaultTranslateTo: targetLang },
      });
      await sendSetupStep5(client, guildId, interaction);
    }
    return;
  }

  if (customId === 'config:feed:select') {
    const feedId = await requireSingleSelectedValue(interaction, 'flux');
    if (!feedId) return;
    const feed = await prisma.feed.findUnique({ where: { id: feedId } });
    if (!feed) return;

    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle(`📡 ${feed.name}`)
      .addFields(
        { name: '🔗 URL', value: truncate(feed.url, 100), inline: false },
        { name: '🏷️ Catégorie', value: feed.category, inline: true },
        { name: '📶 Statut', value: feedStatusEmoji(feed.enabled) + ' ' + (feed.enabled ? 'Actif' : 'Inactif'), inline: true },
        { name: '⚡ Auto-publication', value: feed.autoPublish ? 'Oui' : 'Non', inline: true },
        { name: '🌍 Langue', value: feed.language ?? 'Auto', inline: true },
        { name: '🌐 Traduire en', value: feed.translateTo ?? 'Désactivé', inline: true },
        { name: '🔔 Rôle', value: feed.roleId ? `<@&${feed.roleId}>` : 'Aucun', inline: true },
        { name: '🔤 Inclure', value: feed.includeKeywords.length ? feed.includeKeywords.join(', ') : 'Aucun', inline: true },
        { name: '🚫 Exclure', value: feed.excludeKeywords.length ? feed.excludeKeywords.join(', ') : 'Aucun', inline: true },
      )
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`config:kw:feed_panel:${feedId}`).setLabel('🔑 Mots-clés').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`feed:toggle:${feedId}`).setLabel(feed.enabled ? '🔴 Désactiver' : '🟢 Activer').setStyle(feed.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`feed:autopub:${feedId}`).setLabel(feed.autoPublish ? '⚡ Désactiver l’auto-publication' : '⚡ Activer l’auto-publication').setStyle(feed.autoPublish ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`feed:delete:${feedId}`).setLabel('🗑️ Supprimer').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('config:feeds').setLabel('◀ Retour').setStyle(ButtonStyle.Secondary),
    );

    await renderPanelTarget(interaction, { embeds: [embed], components: [row] });
    return;
  }

  if (customId === 'config:select_mod_role') {
    const roleId = await requireSingleSelectedValue(interaction, 'rôle');
    if (!roleId) return;
    await prisma.guild.update({
      where: { id: guildId },
      data: { moderatorRoleId: roleId },
    });
    await sendMainConfigPanel(interaction as unknown as import('discord.js').SelectMenuInteraction, guildId);
    return;
  }

  if (customId === 'config:select_yt_channel') {
    const channelId = await requireSingleSelectedValue(interaction, 'salon');
    if (!channelId) return;
    await prisma.guild.update({
      where: { id: guildId },
      data: { youtubeChannelId: channelId },
    });
    await sendYouTubeConfigPanel(client, guildId, interaction);
    return;
  }

  if (customId === 'config:select_yt_short_role') {
    const roleId = await requireSingleSelectedValue(interaction, 'rôle');
    if (!roleId) return;
    await prisma.guild.update({
      where: { id: guildId },
      data: { youtubeShortRoleId: roleId },
    });
    await sendYouTubeConfigPanel(client, guildId, interaction);
    return;
  }

  if (customId === 'config:select_yt_video_role') {
    const roleId = await requireSingleSelectedValue(interaction, 'rôle');
    if (!roleId) return;
    await prisma.guild.update({
      where: { id: guildId },
      data: { youtubeVideoRoleId: roleId },
    });
    await sendYouTubeConfigPanel(client, guildId, interaction);
    return;
  }

  if (customId === 'config:digest:select_role') {
    const roleId = await requireSingleSelectedValue(interaction, 'rôle');
    if (!roleId) return;
    await prisma.guild.update({
      where: { id: guildId },
      data: { digestRoleId: roleId },
    });
    await sendDigestPanel(client, guildId, interaction);
    return;
  }

  if (customId === 'config:kw:remove') {
    const selectedValue = await requireSingleSelectedValue(interaction, 'mot-clé');
    if (!selectedValue) return;
    await interaction.deferUpdate();
    const [scope, ...rest] = selectedValue.split(':');

    if (scope === 'global') {
      const [action, keyword] = rest;
      const field = action === 'include' ? 'globalIncludeKeywords' : action === 'exclude' ? 'globalExcludeKeywords' : 'globalIgnoredKeywords';
      const guild = await prisma.guild.findUnique({ where: { id: guildId } });
      if (guild) {
        const updated = (guild[field] as string[]).filter((k) => k !== keyword);
        await prisma.guild.update({ where: { id: guildId }, data: { [field]: updated } });
        await interaction.followUp({ content: `✅ Mot-clé \`${keyword}\` supprimé (Global).`, flags: [MessageFlags.Ephemeral] });
        await sendGlobalKeywordsPanel(client, guildId, interaction.channel as TextChannel);
      }
    } else if (scope === 'feed') {
      const [feedId, action, keyword] = rest;
      const field = action === 'include' ? 'includeKeywords' : action === 'exclude' ? 'excludeKeywords' : 'ignoredKeywords';
      const feed = await prisma.feed.findUnique({ where: { id: feedId } });
      if (feed) {
        const updated = (feed[field as 'includeKeywords' | 'excludeKeywords' | 'ignoredKeywords']).filter((k) => k !== keyword);
        await prisma.feed.update({ where: { id: feedId }, data: { [field]: updated } });
        await interaction.followUp({ content: `✅ Mot-clé \`${keyword}\` supprimé (Flux: ${feed.name}).`, flags: [MessageFlags.Ephemeral] });
        await sendFeedKeywordsPanel(client, guildId, feedId, interaction.channel as TextChannel);
      }
    }
    return;
  }
}

export async function handleModalSubmit(interaction: ModalSubmitInteraction, client: Client): Promise<void> {
  const { customId, guildId } = interaction;
  if (!guildId) return;

  // ── Daily Algo Rating Modal ──────────────────────────────────────────────
  if (customId.startsWith('modal:daily-algo-rate:')) {
    const submissionId = customId.split(':')[2];
    if (!submissionId) return;

    function parseScore(raw: string): number | null {
      const n = Number.parseInt(raw.trim(), 10);
      if (Number.isNaN(n) || n < 1 || n > 5) return null;
      return n;
    }

    const correctness = parseScore(interaction.fields.getTextInputValue('score_correctness'));
    const comments = parseScore(interaction.fields.getTextInputValue('score_comments'));
    const compactness = parseScore(interaction.fields.getTextInputValue('score_compactness'));
    const optimization = parseScore(interaction.fields.getTextInputValue('score_optimization'));
    const readability = parseScore(interaction.fields.getTextInputValue('score_readability'));

    if (correctness === null || comments === null || compactness === null || optimization === null || readability === null) {
      await interaction.reply({
        content: '❌ Chaque note doit être un nombre entre **1** et **5**.',
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const hasLowScore = [correctness, comments, compactness, optimization, readability].some((score) => score < 5);

    if (hasLowScore) {
      prunePendingDailyAlgoDrafts();
      const key = pendingDailyAlgoDraftKey(submissionId, interaction.user.id);
      pendingDailyAlgoScoreDrafts.set(key, {
        submissionId,
        moderatorId: interaction.user.id,
        createdAt: Date.now(),
        scores: { correctness, comments, compactness, optimization, readability },
      });

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`daily-algo-feedback:${submissionId}`)
          .setLabel('🗒️ Ajouter l’explication')
          .setStyle(ButtonStyle.Primary),
      );

      await interaction.reply({
        content: `⚠️ Tu as mis au moins une note inférieure à **5/5**.\nAjoute maintenant une explication pour que le participant comprenne comment s'améliorer.`,
        components: [row],
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    let success = false;
    try {
      success = await reviewDailyAlgoSubmission({
        client,
        submissionId,
        action: 'approve',
        moderatorId: interaction.user.id,
        scores: { correctness, comments, compactness, optimization, readability },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Impossible de valider cette soumission.';
      await interaction.editReply({ content: `❌ ${message}` });
      return;
    }

    if (!success) {
      await interaction.editReply({ content: '❌ Soumission introuvable ou déjà notée.' });
      return;
    }

    const avg = ((correctness + comments + compactness + optimization + readability) / 5).toFixed(1);
    await interaction.editReply({
      content: `✅ **Solution notée !** Moyenne : **${avg}/5**\n\n✅ ${correctness}/5 · 💬 ${comments}/5 · 📦 ${compactness}/5 · ⚡ ${optimization}/5 · 🧹 ${readability}/5\n\nLe classement du Daily Algo a été mis à jour.`,
    });
    logger.success('Handler', `Rated daily algo submission ${submissionId} (${avg}/5) by ${interaction.user.username}`);
    return;
  }

  // ── Daily Algo Feedback Modal ────────────────────────────────────────────
  if (customId.startsWith('modal:daily-algo-feedback:')) {
    const submissionId = customId.split(':')[2];
    if (!submissionId) return;

    prunePendingDailyAlgoDrafts();
    const key = pendingDailyAlgoDraftKey(submissionId, interaction.user.id);
    const draft = pendingDailyAlgoScoreDrafts.get(key);

    if (!draft) {
      await interaction.reply({
        content: '⚠️ Le brouillon de notation a expiré. Clique de nouveau sur **Noter**.',
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const feedback = interaction.fields.getTextInputValue('score_feedback').trim();
    if (!feedback) {
      await interaction.reply({
        content: '❌ Une explication est obligatoire quand une note est inférieure à 5/5.',
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    let success = false;
    try {
      success = await reviewDailyAlgoSubmission({
        client,
        submissionId,
        action: 'approve',
        moderatorId: interaction.user.id,
        scores: draft.scores,
        feedback,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Impossible de valider cette soumission.';
      await interaction.editReply({ content: `❌ ${message}` });
      return;
    } finally {
      pendingDailyAlgoScoreDrafts.delete(key);
    }

    if (!success) {
      await interaction.editReply({ content: '❌ Soumission introuvable ou déjà notée.' });
      return;
    }

    const avg = ((draft.scores.correctness + draft.scores.comments + draft.scores.compactness + draft.scores.optimization + draft.scores.readability) / 5).toFixed(1);
    await interaction.editReply({
      content: `✅ **Solution notée avec explication !** Moyenne : **${avg}/5**\n\n✅ ${draft.scores.correctness}/5 · 💬 ${draft.scores.comments}/5 · 📦 ${draft.scores.compactness}/5 · ⚡ ${draft.scores.optimization}/5 · 🧹 ${draft.scores.readability}/5`,
    });
    logger.success('Handler', `Rated daily algo submission ${submissionId} with feedback (${avg}/5) by ${interaction.user.username}`);
    return;
  }

  if (customId.startsWith('cfg:')) {
    await handleConfigModal(interaction);
    return;
  }

  if (customId === 'modal:feed:add') {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const name = interaction.fields.getTextInputValue('feed_name');
    const url = interaction.fields.getTextInputValue('feed_url');
    const category = interaction.fields.getTextInputValue('feed_category') || 'Général';
    const langInput = interaction.fields.getTextInputValue('feed_lang').trim();
    const autoPublishInput = interaction.fields.getTextInputValue('feed_autopublish').toLowerCase();

    let language: string | null = null;
    let translateTo: string | null = null;
    if (langInput.includes('→') || langInput.includes('->')) {
      const sep = langInput.includes('→') ? '→' : '->';
      const parts = langInput.split(sep).map((s) => s.trim());
      language = parts[0] || null;
      translateTo = parts[1] || null;
    } else if (langInput) {
      language = langInput;
    }

    try { new URL(url); } catch {
      await interaction.editReply({ embeds: [errorEmbed('URL invalide')] });
      return;
    }

    const metadata = await fetchArticleMetadata(url);
    const feedUrl = metadata.rssUrl ?? url;

    const existing = await prisma.feed.findFirst({ where: { guildId, url: feedUrl } });
    if (existing) {
      await interaction.editReply({ embeds: [errorEmbed('Flux existant', `Ce flux existe déjà : **${existing.name}**`)] });
      return;
    }

    const guild = await prisma.guild.findUnique({ where: { id: guildId } }) || 
                  await prisma.guild.create({ data: { id: guildId } });

    if (!translateTo && guild.translationEnabled) {
      translateTo = guild.defaultTranslateTo;
    }

    const autoPublish = autoPublishInput === 'oui' || autoPublishInput === 'yes' || autoPublishInput === 'true';

    await prisma.feed.create({
      data: {
        guildId,
        name,
        url: feedUrl,
        category,
        autoPublish,
        language,
        translateTo,
      },
    });

    let successDesc = `**${name}** → \`${feedUrl}\` (Auto-publication : ${autoPublish ? '✅ Oui' : '❌ Non'})`;
    if (!autoPublish && !guild.configChannelId) {
      successDesc += '\n\n⚠️ **Attention** : Aucun salon de modération n\'est configuré. Les articles ne pourront pas être validés tant que vous n\'aurez pas défini le salon de modération via `/setup` ou `/config`.';
    }

    await interaction.editReply({ embeds: [successEmbed('Flux ajouté !', successDesc)] });

    if (interaction.channel instanceof TextChannel) {
      await interaction.channel.send({ embeds: [successEmbed('Flux ajouté !', `**${name}** a été configuré. (Auto-publication : ${autoPublish ? 'Oui' : 'Non'})`)] });
    }
    return;
  }

  if (customId === 'modal:setup:digest_time') {
    const time = interaction.fields.getTextInputValue('digest_time');

    if (!(await validateTimeField(interaction, time, '06:00'))) return;

    await interaction.deferUpdate();
    await prisma.guild.update({
      where: { id: guildId },
      data: { digestTime: time },
    });
    await sendSetupStep4(client, guildId, interaction);
    return;
  }

  if (customId === 'modal:digest:config') {
    await interaction.deferUpdate();
    const time = interaction.fields.getTextInputValue('digest_time');
    let text = interaction.fields.getTextInputValue('digest_text')?.trim() || null;

    if (!(await validateTimeField(interaction, time, '08:00'))) return;

    await prisma.guild.update({
      where: { id: guildId },
      data: { digestTime: time, digestCustomText: text },
    });

    if (interaction.channel) {
      await sendDigestPanel(client, guildId, interaction.channel as TextChannel);
    }
  }

  if (customId.startsWith('modal:kw:')) {
    await interaction.deferUpdate();
    const parts = customId.split(':'); 
    const scope = parts[2]; 
    const action = parts[3]; 
    const feedId = parts[4]; 

    const rawInput = interaction.fields.getTextInputValue('keywords_input');
    const newWords = normalizeCommaKeywords(rawInput);

    if (newWords.length === 0) return;

    if (scope === 'global') {
      const field = action === 'include' ? 'globalIncludeKeywords' : action === 'exclude' ? 'globalExcludeKeywords' : 'globalIgnoredKeywords';
      const guild = await prisma.guild.findUnique({ where: { id: guildId } });
      if (guild) {
        const current = guild[field];
        const updated = Array.from(new Set([...current, ...newWords]));
        await prisma.guild.update({ where: { id: guildId }, data: { [field]: updated } });
      }
      if (interaction.channel) {
        await sendGlobalKeywordsPanel(client, guildId, interaction.channel as TextChannel);
      }
    } else if (scope === 'feed' && feedId) {
      const field = action === 'include' ? 'includeKeywords' : action === 'exclude' ? 'excludeKeywords' : 'ignoredKeywords';
      const feed = await prisma.feed.findUnique({ where: { id: feedId } });
      if (feed) {
        const current = feed[field as 'includeKeywords' | 'excludeKeywords' | 'ignoredKeywords'];
        const updated = Array.from(new Set([...current, ...newWords]));
        await prisma.feed.update({ where: { id: feedId }, data: { [field]: updated } });
      }
      if (interaction.channel) {
        await sendFeedKeywordsPanel(client, guildId, feedId, interaction.channel as TextChannel);
      }
    }
  }

  if (customId.startsWith('modal:news:add_feed:')) {
    const sessionId = parseModalSessionId(customId, 'modal:news:add_feed:');
    if (!sessionId) return;
    const session = getNewsSession(sessionId);

    if (!session) {
      await interaction.reply({ content: '❌ Session expirée.', flags: [MessageFlags.Ephemeral] });
      return;
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const name = interaction.fields.getTextInputValue('feed_name');
    const rssUrl = interaction.fields.getTextInputValue('feed_url');
    const category = interaction.fields.getTextInputValue('feed_category') || 'Général';

    try {
      new URL(rssUrl);
    } catch {
      await interaction.editReply({ embeds: [errorEmbed('URL invalide', 'Veuillez entrer une URL de flux RSS valide.')] });
      return;
    }

    // 1. Create the feed
    const feed = await prisma.feed.upsert({
      where: { guildId_url: { guildId, url: rssUrl } },
      update: { name, category },
      create: { guildId, name, url: rssUrl, category, enabled: true }
    });

    // 2. Create the item
    const guid = session.url;
    const existingItem = await prisma.feedItem.findUnique({
      where: { feedId_guid: { feedId: feed.id, guid } }
    });

    if (existingItem) {
        await interaction.editReply({ embeds: [infoEmbed('Déjà existant', 'Cet article a déjà été soumis.')] });
    } else {
        const item = await prisma.feedItem.create({
            data: {
                feedId: feed.id,
                guid,
                url: session.url,
                title: session.metadata.title || 'Sans titre',
                description: session.metadata.description,
                imageUrl: session.metadata.imageUrl,
                publishedAt: new Date(),
                status: 'PENDING',
            }
        });

        await sendToValidationQueue(client, item.id, 'rss');

        await interaction.editReply({
            embeds: [successEmbed('Flux ajouté et article soumis !', `Le flux **${name}** a été ajouté et l'article a été envoyé en validation.`)]
        });
    }

    deleteNewsSession(sessionId);
  }

  if (customId.startsWith('modal:news:edit_metadata:')) {
    const sessionId = parseModalSessionId(customId, 'modal:news:edit_metadata:');
    if (!sessionId) return;
    const session = getNewsSession(sessionId);

    if (!session) {
      await interaction.reply({ content: '❌ Session expirée.', flags: [MessageFlags.Ephemeral] });
      return;
    }

    const title = interaction.fields.getTextInputValue('news_title');
    const description = interaction.fields.getTextInputValue('news_description');

    updateNewsSession(sessionId, { title, description });

    // Refresh the confirmation message
    const updatedSession = getNewsSession(sessionId)!;
    const hostname = new URL(updatedSession.url).hostname.replace('www.', '');

    const embed = new EmbedBuilder()
      .setColor(COLORS.warning)
      .setTitle('🔍 Flux RSS non trouvé')
      .setDescription(`Le site **${hostname}** n'est pas dans votre liste de flux RSS.\n\n` +
        `**Titre :** ${updatedSession.metadata.title || '*Non détecté*'}\n` +
        `**Description :** ${updatedSession.metadata.description ? (updatedSession.metadata.description.length > 200 ? updatedSession.metadata.description.substring(0, 200) + '...' : updatedSession.metadata.description) : '*Non détectée*'}\n\n` +
        (updatedSession.metadata.rssUrl 
          ? `Un flux RSS a été détecté : \`${updatedSession.metadata.rssUrl}\`.\n` 
          : "Aucun flux RSS n'a été détecté automatiquement.\n"))
      .setTimestamp();

    if (updatedSession.metadata.imageUrl) embed.setThumbnail(updatedSession.metadata.imageUrl);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`news:publish_no_feed:${sessionId}`)
        .setLabel('Publier sans ajouter')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`news:edit_metadata:${sessionId}`)
        .setLabel('Modifier')
        .setStyle(ButtonStyle.Secondary)
    );

    if (updatedSession.metadata.rssUrl) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`news:add_detected:${sessionId}`)
          .setLabel('Ajouter le flux')
          .setStyle(ButtonStyle.Primary)
      );
    } else {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`news:add_manual:${sessionId}`)
          .setLabel('Ajouter manuellement')
          .setStyle(ButtonStyle.Secondary)
      );
    }

    if (canUpdateInteraction(interaction)) {
      await interaction.update({ embeds: [embed], components: [row] });
    } else {
      await interaction.reply({ embeds: [embed], components: [row], flags: [MessageFlags.Ephemeral] });
    }
  }
}
