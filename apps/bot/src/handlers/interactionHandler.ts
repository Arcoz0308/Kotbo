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
  type AnySelectMenuInteraction,
  PermissionFlagsBits,
  type GuildMember,
  TextInputBuilder,
  TextInputStyle,
  ModalBuilder,
} from 'discord.js';
import prisma from '../utils/db.js';
import { getCachedGuild } from '../utils/cache.js';
import { logger } from '../utils/logger.js';
import { DigestFrequency } from '@prisma/client';
import { COLORS, successEmbed, truncate } from '../utils/embeds.js';
import { handleConfigButton, handleConfigModal } from './configHandler.js';
import { sendSetupStep1, sendSetupStep2, sendSetupStep3, sendSetupFinish } from '../panels/setupPanel.js';
import { reviewDailyAlgoSubmission } from '../services/dailyAlgoService.js';
import { renderPanelTarget } from '../utils/interactionResponses.js';
import { parseSetupStep, parseUserCaseRoute, parseValidateRoute, parseEventQuizRoute, parseEventResultRoute } from './interactionRoutes.js';
import { handleQuizInteraction, buildEventResultsView, getEventStats } from '../services/eventService.js';
import { toggleGuildBoolean } from '../utils/prismaToggles.js';
import { requireSingleSelectedValue, validateTimeField } from '../utils/interactionValidation.js';
import { buildMemberCasePanel, type MemberCaseSection } from '../services/memberCaseService.js';
import { handleRecruitmentButton } from '../services/recruitmentService.js';
import { handleTicketButton, handleTicketModalSubmit } from '../services/ticketService.js';
import { checkInMeeting, createNotification } from '../services/staffLeadershipService.js';
import { handleDCInteraction } from '../services/dcDetectionService.js';
import { showModeratorNoteModal } from '../commands/note.js';
import {
  parseDurationToMs,
  registerBanSanction,
  registerKickSanction,
  registerTimeoutSanction,
  registerWarnSanction,
  runGuildBan,
} from '../services/sanctionService.js';


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

  const guild = await getCachedGuild(guildId);
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

  // ── Giveaway buttons ────────────────────────────────────────────────
  if (customId.startsWith('giveaway_join:')) {
    const { handleGiveawayJoin } = await import('../services/giveawayService.js');
    await handleGiveawayJoin(interaction);
    return;
  }

  // ── Reaction Role buttons ───────────────────────────────────────────
  if (customId.startsWith('role_toggle:')) {
    const { handleRoleToggleInteraction } = await import('../services/reactionRoleService.js');
    await handleRoleToggleInteraction(interaction);
    return;
  }

  // ── Suggestion buttons ──────────────────────────────────────────────
  if (customId.startsWith('suggest_vote:')) {
    const { handleSuggestionVote } = await import('../services/suggestionService.js');
    const type = customId.split(':')[2] as 'up' | 'down';
    await handleSuggestionVote(interaction, type);
    return;
  }

  // ── Suggestion form button ───────────────────────────────────────────
  if (customId === 'suggest_form_open') {
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');
    
    const modal = new ModalBuilder()
      .setCustomId('suggest_form_modal')
      .setTitle('💡 Soumettre une suggestion');

    const suggestionInput = new TextInputBuilder()
      .setCustomId('suggestion_content')
      .setLabel('Votre suggestion')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Décrivez votre suggestion en détail...')
      .setRequired(true)
      .setMaxLength(1000)
      .setMinLength(10);

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(suggestionInput);
    modal.addComponents(row);

    await interaction.showModal(modal);
    return;
  }

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

    if (caseRoute.action === 'note') {
      const targetUser = await client.users.fetch(caseRoute.userId).catch(() => null);
      await showModeratorNoteModal(interaction, caseRoute.userId, targetUser?.username ?? 'Utilisateur');
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
      files: panel.files,
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  // Recruitment ticket buttons
  if (customId.startsWith('recruit:')) {
    await handleRecruitmentButton(client, customId, interaction);
    return;
  }

  // Ticket system buttons
  if (customId.startsWith('ticket:')) {
    await handleTicketButton(client, customId, interaction);
    return;
  }



  // ── Double Account Buttons ───────────────────────────────────────────
  if (customId.startsWith('dc_')) {
    const member = await resolveGuildMemberByUserId(interaction, user.id);
    if (!(await canModerate(member, guildId!))) {
      await interaction.reply({ content: '❌ Tu n’as pas les permissions nécessaires pour gérer les DCs.', flags: [MessageFlags.Ephemeral] });
      return;
    }

    await handleDCInteraction(interaction);
    return;
  }

  if (customId.startsWith('meeting_rsvp:')) {
    const parts = customId.split(':');
    const meetingId = parts[1];
    const status = parts[2]; // PRESENT, EXCUSED, ABSENT

    if (!status || !meetingId) return;

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

    // Cas "S'excuser" -> On demande une raison via Modal
    if (status === 'EXCUSED') {
      const modal = new ModalBuilder()
        .setCustomId(`meeting_excuse_modal:${meetingId}`)
        .setTitle('Justification d\'absence');

      const reasonInput = new TextInputBuilder()
        .setCustomId('excuse_reason')
        .setLabel('Raison de votre absence')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Expliquez pourquoi vous ne pouvez pas venir...')
        .setRequired(true)
        .setMaxLength(500);

      const row = new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput);
      modal.addComponents(row);

      await interaction.showModal(modal);
      return;
    }

    try {
      const labels: Record<string, string> = { 
        PRESENT: 'Présent ✅', 
        ABSENT: 'Absent ❌' 
      };

      await checkInMeeting(client, meetingId, staffMember.id, status as any);
      
      let response = `✅ Votre statut pour cette réunion est désormais : **${labels[status] || status}**.`;
      if (status === 'ABSENT') {
        response += '\n⚠️ **Note :** Une absence automatique a été enregistrée dans votre dossier pour cette réunion.';
      }

      await interaction.reply({
        content: response,
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

  const eventRoute = parseEventQuizRoute(customId);
  if (eventRoute && eventRoute.optionIndex !== undefined) {
    await handleQuizInteraction(interaction, eventRoute.questionId, eventRoute.optionIndex);
    return;
  }

  const resultRoute = parseEventResultRoute(customId);
  if (resultRoute) {
    const results = await buildEventResultsView(interaction, resultRoute.eventId, resultRoute.page);
    await interaction.update(results);
    return;
  }

  if (customId.startsWith('event-stats:')) {
    const parts = customId.split(':');
    const eventId = parts[1];
    if (!eventId) {
      await interaction.reply({ content: '❌ Événement introuvable.', flags: [MessageFlags.Ephemeral] });
      return;
    }

    try {
      const stats = await getEventStats(eventId);
      if (!stats) {
        await interaction.reply({ content: '❌ Aucune statistique disponible pour cet événement.', flags: [MessageFlags.Ephemeral] });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('📊 Statistiques de l\'événement')
        .setDescription(stats.questionText ? truncate(stats.questionText, 200) : 'Distribution des réponses')
        .setColor(COLORS.info)
        .setTimestamp();

      const total = Object.values(stats.distribution).reduce((s: number, v: any) => s + (v || 0), 0);

      (Object.keys(stats.distribution) || []).forEach((k) => {
        const idx = parseInt(k, 10);
        const label = (stats.options && stats.options[idx]) ? stats.options[idx] : `Option ${idx + 1}`;
        const count = stats.distribution[idx] ?? 0;
        embed.addFields({ name: `${label}`, value: `${count} vote(s)`, inline: true });
      });

      embed.addFields({ name: 'Total réponses', value: `${total}`, inline: true });

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`event-result-page:${eventId}:0`).setLabel('🔍 Voir les détails').setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({ embeds: [embed], components: [row], flags: [MessageFlags.Ephemeral] });
    } catch (err) {
      logger.error('Handler', 'Error showing event stats:', err);
      await interaction.reply({ content: '❌ Erreur lors de la récupération des statistiques.', flags: [MessageFlags.Ephemeral] });
    }

    return;
  }

  if (customId === 'event-result-back') {
    const events = await prisma.event.findMany({
      where: {
        guildId: guildId!,
        participants: { some: { userId: interaction.user.id } }
      },
      orderBy: { createdAt: 'desc' },
      take: 25
    });
    
    const embed = new EmbedBuilder()
      .setTitle('📈 Tes Résultats de Quiz')
      .setDescription('Sélectionne un événement pour voir le détail de tes réponses.')
      .setColor(COLORS.info);

    const select = new StringSelectMenuBuilder()
      .setCustomId('event-result-select')
      .setPlaceholder('Sélectionne un quiz...')
      .addOptions(events.map(e => ({
        label: e.title.substring(0, 100),
        value: e.id,
        description: `Le ${e.createdAt.toLocaleDateString('fr-FR')}`
      })));

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
    await interaction.update({ embeds: [embed], components: [row] });
    return;
  }

  if (!guildId) return;

  const setupStep = parseSetupStep(customId);
  if (setupStep) {
    const step = setupStep;

    if (step === 'step1') await sendSetupStep1(client, guildId, interaction);
    else if (step === 'step2') await sendSetupStep2(client, guildId, interaction);
    else if (step === 'step3') await sendSetupStep3(client, guildId, interaction);
    else if (step === 'finish') await sendSetupFinish(client, guildId, interaction);

    else if (step === 'trans_toggle') {
      await toggleGuildBoolean(guildId, 'translationEnabled');
      await sendSetupStep3(client, guildId, interaction);
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



    if (action === 'reject') {
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
    }


    return;
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
    await interaction.update({ embeds: [panel.embed], components: panel.components, files: panel.files });
    return;
  }

  if (customId === 'event-result-select') {
    const eventId = interaction.values[0];
    const results = await buildEventResultsView(interaction, eventId, 0);
    await interaction.update(results);
    return;
  }

  if (caseRoute?.action === 'sanction_action') {
    if (!interaction.isStringSelectMenu()) return;
    const action = interaction.values[0]; // warn, timeout, kick, ban

    const member = await resolveGuildMemberByUserId(interaction, interaction.user.id);
    if (!(await canModerate(member, guildId))) {
      await interaction.reply({ content: '❌ Tu n’as pas les permissions nécessaires.', flags: [MessageFlags.Ephemeral] });
      return;
    }

    const targetUserId = caseRoute.userId;
    const targetUser = await client.users.fetch(targetUserId).catch(() => null);
    const targetUsername = targetUser?.username ?? 'Utilisateur';

    const actionLabel = action === 'warn' ? 'Avertissement' : action === 'timeout' ? 'Timeout' : action === 'kick' ? 'Expulsion' : 'Bannissement';

    const modal = new ModalBuilder()
      .setCustomId(`sanction_modal:${action}:${targetUserId}`)
      .setTitle(`Sanction : ${truncate(targetUsername, 20)}`);

    const reasonInput = new TextInputBuilder()
      .setCustomId('reason')
      .setLabel(`Raison du ${actionLabel}`)
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder(`Motif de la sanction...`)
      .setRequired(true)
      .setMaxLength(500);

    const rows: ActionRowBuilder<TextInputBuilder>[] = [];

    if (action === 'timeout') {
      const durationInput = new TextInputBuilder()
        .setCustomId('duration')
        .setLabel('Durée (ex: 2h, 1j)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Exemple : 2h')
        .setRequired(true)
        .setMaxLength(50);
      rows.push(new ActionRowBuilder<TextInputBuilder>().addComponents(durationInput));
    }

    rows.push(new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput));
    modal.addComponents(rows);

    await interaction.showModal(modal);
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
    else if (step === 'trans_lang') {
      const targetLang = normalizeTargetLanguage(val);
      await prisma.guild.upsert({
        where: { id: guildId },
        update: { defaultTranslateTo: targetLang },
        create: { id: guildId, defaultTranslateTo: targetLang },
      });
      await sendSetupStep3(client, guildId, interaction);
    }
    return;
  }


}

export async function handleModalSubmit(interaction: ModalSubmitInteraction, client: Client): Promise<void> {
  const { customId, guildId } = interaction;
  if (!guildId) return;

  // ── Suggestion form modal ─────────────────────────────────────────────
  if (customId === 'suggest_form_modal') {
    const content = interaction.fields.getTextInputValue('suggestion_content');
    
    try {
      const { createSuggestion } = await import('../services/suggestionService.js');
      const suggestion = await createSuggestion(
        guildId,
        interaction.user.id,
        interaction.user.username,
        content,
        client
      );
      
      await interaction.reply({
        content: `💡 Votre suggestion a été publiée avec succès ! (ID : \`${suggestion.id}\`)`,
        flags: [MessageFlags.Ephemeral],
      });
    } catch (err: any) {
      await interaction.reply({
        content: `❌ Impossible de publier la suggestion : ${err?.message || 'erreur inconnue'}`,
        flags: [MessageFlags.Ephemeral],
      });
    }
    return;
  }

  if (customId === 'modal:resignation:open') {
    const reason = interaction.fields.getTextInputValue('reason');
    try {
      const staff = await prisma.staffMember.findFirst({
        where: { guildId, userId: interaction.user.id },
      });

      if (!staff) {
        await interaction.reply({ content: '❌ Vous ne faites pas partie de l\'équipe Staff.', flags: [MessageFlags.Ephemeral] });
        return;
      }

      const resignation = await prisma.staffResignation.create({
        data: {
          guildId,
          staffUserId: staff.id,
          reason,
          status: 'PENDING'
        }
      });

      // MP Discord de confirmation au membre
      let dmMessageId: string | null = null;
      try {
        const confirmEmbed = new EmbedBuilder()
          .setTitle('📨 Demande de démission reçue')
          .setDescription(
            `Votre demande de démission a bien été enregistrée et est en attente d\'approbation par la direction.\n\n` +
            `**Motif fourni :**\n> ${reason}\n\n` +
            `Vous serez notifié de la décision finale. Vous pouvez suivre le statut dans votre profil sur le dashboard.`
          )
          .setColor(COLORS.info)
          .setTimestamp()
          .setFooter({ text: `Référence : ${resignation.id}` });
        const dm = await interaction.user.send({ embeds: [confirmEmbed] }).catch(() => null);
        dmMessageId = dm?.id ?? null;
      } catch {
        // Silent fail si le MP est désactivé
      }

      if (dmMessageId) {
        await prisma.staffResignation.update({
          where: { id: resignation.id },
          data: { discordMpMessageId: dmMessageId }
        }).catch(() => null);
      }

      // Notifier les managers/admins via dashboard + MP Discord
      const managers = await prisma.staffMember.findMany({
        where: {
          guildId,
          grade: { in: ['Manager', 'Admin', 'Administrateur', 'Fondateur', 'Direction'] }
        }
      });

      if (managers.length > 0) {
        await Promise.all(managers.map(async (m: { userId: string; username: string | null }) => {
          // Notif dashboard
          await createNotification(
            guildId,
            m.userId,
            '🔔 Demande de démission',
            `${interaction.user.username} a soumis une demande de démission.\nMotif : ${reason}`,
            'WARNING',
            '/staff-management?tab=resignations',
            true
          ).catch(() => null);

          // MP Discord aux managers
          try {
            const managerDiscordUser = await client.users.fetch(m.userId).catch(() => null);
            if (managerDiscordUser) {
              const managerEmbed = new EmbedBuilder()
                .setTitle('🔔 Nouvelle demande de démission')
                .setDescription(
                  `**${interaction.user.username}** (${interaction.user.id}) a soumis une demande de démission.\n\n` +
                  `**Motif :**\n> ${reason}\n\n` +
                  `Rendez-vous sur le dashboard pour approuver ou refuser cette demande.`
                )
                .setColor(COLORS.warning)
                .setTimestamp()
                .setFooter({ text: `Référence : ${resignation.id}` });
              await managerDiscordUser.send({ embeds: [managerEmbed] }).catch(() => null);
            }
          } catch {
            // Silent fail
          }
        }));
      }

      await interaction.reply({
        content: '✅ Votre demande de démission a été soumise avec succès aux managers pour approbation. Vous recevrez une notification de leur décision.',
        flags: [MessageFlags.Ephemeral]
      });
    } catch (err) {
      logger.error('Handler', 'Error during resignation modal submit:', err);
      await interaction.reply({
        content: '❌ Une erreur est survenue lors de l\'enregistrement de votre demande.',
        flags: [MessageFlags.Ephemeral]
      });
    }
    return;
  }
  if (customId.startsWith('modal:ticket:')) {
    await handleTicketModalSubmit(client, customId, interaction);
    return;
  }

  if (customId.startsWith('meeting_excuse_modal:')) {
    const meetingId = customId.split(':')[1];
    const reason = interaction.fields.getTextInputValue('excuse_reason');

    if (!meetingId) return;

    const staffMember = await prisma.staffMember.findFirst({
      where: { guildId, userId: interaction.user.id },
    });

    if (!staffMember) {
      await interaction.reply({ content: '❌ Membre non trouvé.', flags: [MessageFlags.Ephemeral] });
      return;
    }

    try {
      await checkInMeeting(client, meetingId, staffMember.id, 'EXCUSED', reason);
      await interaction.reply({
        content: `✅ Votre excuse a été enregistrée : *${reason}*.`,
        flags: [MessageFlags.Ephemeral]
      });
    } catch (error) {
      logger.error('Handler', `Error during meeting excuse modal submit: ${error}`);
      await interaction.reply({
        content: '❌ Une erreur est survenue lors de l\'enregistrement de votre excuse.',
        flags: [MessageFlags.Ephemeral]
      });
    }
    return;
  }

  if (customId.startsWith('sanction_modal:')) {
    const parts = customId.split(':');
    const action = parts[1];
    const targetUserId = parts[2];
    if (!targetUserId) return;

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const reason = interaction.fields.getTextInputValue('reason');
    const durationInput = action === 'timeout' ? interaction.fields.getTextInputValue('duration') : null;

    const member = await resolveGuildMemberByUserId(interaction, interaction.user.id);
    if (!(await canModerate(member, interaction.guildId!))) {
      await interaction.editReply('❌ Vous n\'avez pas les permissions.');
      return;
    }

    const executor = interaction.user;

    try {
      if (action === 'warn') {
        const warnResult = await registerWarnSanction({
          guildId: interaction.guildId!,
          targetUserId,
          executorUserId: executor.id,
          executorTag: executor.tag,
          reason,
        });
        await interaction.editReply({ embeds: [successEmbed('Avertissement appliqué', `L'avertissement a bien été enregistré. (Warn #${warnResult.warnCount})`)] });
      } else if (action === 'timeout') {
        const durationMs = parseDurationToMs(durationInput || '');
        if (!durationMs) {
          await interaction.editReply({ embeds: [errorEmbed('Durée invalide', 'Le format de la durée est invalide.')] });
          return;
        }
        await registerTimeoutSanction({
          guildId: interaction.guildId!,
          targetUserId,
          executorUserId: executor.id,
          executorTag: executor.tag,
          reason,
          durationMs,
        });
        await interaction.editReply({ embeds: [successEmbed('Timeout appliqué', `Le timeout de ${durationInput} a bien été enregistré.`)] });
      } else if (action === 'kick') {
        await registerKickSanction({
          guildId: interaction.guildId!,
          targetUserId,
          executorUserId: executor.id,
          executorTag: executor.tag,
          reason,
        });
        await interaction.editReply({ embeds: [successEmbed('Expulsion appliquée', `L'utilisateur a été expulsé.`)] });
      } else if (action === 'ban') {
        await registerBanSanction({
          guildId: interaction.guildId!,
          targetUserId,
          executorUserId: executor.id,
          executorTag: executor.tag,
          reason,
        });
        await interaction.editReply({ embeds: [successEmbed('Bannissement appliqué', `L'utilisateur a été banni.`)] });
      }
    } catch (error) {
      await interaction.editReply({ embeds: [errorEmbed('Erreur', error instanceof Error ? error.message : 'Une erreur est survenue.')] });
    }
    return;
  }

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

  // ── Moderator Note Modal ────────────────────────────────────────────────
  if (customId.startsWith('modal:moderator-note:')) {
    const targetUserId = customId.split(':')[2];
    const noteContent = interaction.fields.getTextInputValue('note_content').trim();

    if (!targetUserId) return;

    await prisma.memberProfile.upsert({
      where: {
        guildId_userId: {
          guildId,
          userId: targetUserId,
        },
      },
      update: { moderatorNote: noteContent },
      create: {
        guildId,
        userId: targetUserId,
        moderatorNote: noteContent,
      },
    });

    await interaction.reply({
      content: `✅ Note modérateur mise à jour pour <@${targetUserId}>.`,
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const eventRoute = parseEventQuizRoute(customId);
  if (eventRoute && interaction.isStringSelectMenu()) {
    const optionIndex = parseInt(interaction.values[0], 10);
    await handleQuizInteraction(interaction, eventRoute.questionId, optionIndex);
    return;
  }
}
