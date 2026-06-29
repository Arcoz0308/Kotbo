import type { SlashCommandDefinition } from '../../commands.js';
import {
  SlashCommandBuilder,
  ContainerBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { COLORS_RAW, text, errorContainer } from '../../utils/embeds.js';
import { E, buildProgressBar } from '../../utils/emojis.js';
import {
  generateStaffEvaluation,
  getStaffEvaluations,
  getEvaluationsDashboardData,
} from '../../services/staff/staffEvaluationService.js';
import { getStaffMember } from '../../services/staff/staffManagementService.js';

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function trendIcon(trend: string, delta: number): string {
  if (trend === 'UP') return `${E.success} +${delta}`;
  if (trend === 'DOWN') return `${E.error} ${delta}`;
  return `${E.dot} Stable`;
}

function scoreColor(score: number): number {
  if (score >= 75) return COLORS_RAW.success;
  if (score >= 50) return COLORS_RAW.primary;
  if (score >= 30) return COLORS_RAW.warning;
  return COLORS_RAW.danger;
}

const data = new SlashCommandBuilder()
  .setName('evaluations')
  .setDescription('Évaluations de performance du staff')
  .addSubcommand((sub) =>
    sub.setName('me')
      .setDescription('Voir mes évaluations'))
  .addSubcommand((sub) =>
    sub.setName('check')
      .setDescription('Voir les évaluations d\'un membre staff')
      .addUserOption((opt) => opt.setName('membre').setDescription('Membre staff').setRequired(true)))
  .addSubcommand((sub) =>
    sub.setName('generate')
      .setDescription('Générer une évaluation pour un membre')
      .addUserOption((opt) => opt.setName('membre').setDescription('Membre staff').setRequired(true))
      .addIntegerOption((opt) => opt.setName('periode').setDescription('Période en jours (défaut: 30)').setMinValue(7).setMaxValue(90)))
  .addSubcommand((sub) =>
    sub.setName('overview')
      .setDescription('Vue d\'ensemble des évaluations du staff'));

async function execute(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;

  if (subcommand === 'me' || subcommand === 'check') {
    const targetUser = subcommand === 'check'
      ? interaction.options.getUser('membre', true)
      : interaction.user;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const staffMember = await getStaffMember(guildId, interaction.user.id);
    if (!staffMember) {
      await interaction.editReply({
        components: [errorContainer('Accès refusé', 'Cette commande est réservée au staff.')],
        flags: MessageFlags.IsComponentsV2,
      });
      return;
    }

    const evaluations = await getStaffEvaluations(guildId, targetUser.id);

    if (evaluations.length === 0) {
      const container = new ContainerBuilder()
        .setAccentColor(COLORS_RAW.dark)
        .addTextDisplayComponents(text(`### ${E.stats} Évaluations · @${targetUser.username}`))
        .addTextDisplayComponents(text(`${E.info} Aucune évaluation disponible.`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(text(`-# ${E.kotbo} Kotbo · Évaluations`));

      await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      return;
    }

    const latest = evaluations[0];

    const container = new ContainerBuilder()
      .setAccentColor(scoreColor(latest.overallScore))
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(text(`### ${E.stats} Évaluation · @${targetUser.username}`))
          .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: targetUser.displayAvatarURL() } }))
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(text([
        `**Score global** · **${latest.overallScore}**/100 ${trendIcon(latest.trend, latest.trendDelta)}`,
        '',
        `${E.dot} **Activité** · ${buildProgressBar(latest.activityScore, 8)} \`${latest.activityScore}/100\``,
        `${E.dot} **Modération** · ${buildProgressBar(latest.moderationScore, 8)} \`${latest.moderationScore}/100\``,
        `${E.dot} **Présence** · ${buildProgressBar(latest.presenceScore, 8)} \`${latest.presenceScore}/100\``,
      ].join('\n')))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(text([
        `**${E.messages} Détails** · ${formatDate(latest.periodStart)} → ${formatDate(latest.periodEnd)}`,
        `${E.dot} Messages: **${latest.totalMessages.toLocaleString('fr-FR')}** · Vocal: **${latest.totalVoiceMinutes.toLocaleString('fr-FR')} min**`,
        `${E.dot} Sanctions traitées: **${latest.sanctionsHandled}** · Tickets résolus: **${latest.ticketsResolved}**`,
        `${E.dot} Réunions: **${latest.meetingsAttended}**/${latest.meetingsTotal} · Absences: **${latest.absenceDays}j**`,
      ].join('\n')));

    if (latest.managerNote) {
      container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
      container.addTextDisplayComponents(text(`**${E.info} Note du responsable**\n${latest.managerNote}`));
    }

    if (evaluations.length > 1) {
      const history = evaluations.slice(1, 4).map((ev) =>
        `${E.dot} ${formatDate(ev.periodEnd)} · **${ev.overallScore}**/100 ${trendIcon(ev.trend, ev.trendDelta)}`
      );
      container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
      container.addTextDisplayComponents(text(`**${E.calendar} Historique**\n${history.join('\n')}`));
    }

    container
      .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(text(`-# ${E.kotbo} Kotbo · ${evaluations.length} évaluation(s)`));

    await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  if (subcommand === 'generate') {
    const targetUser = interaction.options.getUser('membre', true);
    const periodDays = interaction.options.getInteger('periode') ?? 30;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const staffMember = await getStaffMember(guildId, interaction.user.id);
    if (!staffMember || !['ADMIN', 'OWNER'].includes(staffMember.grade)) {
      await interaction.editReply({
        components: [errorContainer('Accès refusé', 'Seuls les admins peuvent générer des évaluations.')],
        flags: MessageFlags.IsComponentsV2,
      });
      return;
    }

    const evaluation = await generateStaffEvaluation(guildId, targetUser.id, periodDays);

    const container = new ContainerBuilder()
      .setAccentColor(scoreColor(evaluation.overallScore))
      .addTextDisplayComponents(text(`### ${E.success} Évaluation générée`))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(text([
        `${E.arrow} **Membre** · @${targetUser.username}`,
        `${E.arrow} **Période** · ${periodDays} jours`,
        `${E.arrow} **Score** · **${evaluation.overallScore}**/100 ${trendIcon(evaluation.trend, evaluation.trendDelta)}`,
        '',
        `${E.dot} Activité: **${evaluation.activityScore}** · Modération: **${evaluation.moderationScore}** · Présence: **${evaluation.presenceScore}**`,
      ].join('\n')))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(text(`-# ${E.kotbo} Kotbo · Évaluations`));

    await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  if (subcommand === 'overview') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const staffMember = await getStaffMember(guildId, interaction.user.id);
    if (!staffMember || !['ADMIN', 'OWNER'].includes(staffMember.grade)) {
      await interaction.editReply({
        components: [errorContainer('Accès refusé', 'Seuls les admins peuvent voir la vue d\'ensemble.')],
        flags: MessageFlags.IsComponentsV2,
      });
      return;
    }

    const data = await getEvaluationsDashboardData(guildId);

    if (data.latestByStaff.length === 0) {
      const container = new ContainerBuilder()
        .setAccentColor(COLORS_RAW.dark)
        .addTextDisplayComponents(text(`### ${E.stats} Vue d'ensemble`))
        .addTextDisplayComponents(text(`${E.info} Aucune évaluation disponible. Utilisez \`/evaluations generate\`.`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(text(`-# ${E.kotbo} Kotbo · Évaluations`));

      await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      return;
    }

    const staffMap = new Map(data.staffMembers.map((s) => [s.userId, s.displayName]));

    const lines = data.latestByStaff
      .sort((a, b) => b.overallScore - a.overallScore)
      .map((ev, i) => {
        const name = staffMap.get(ev.staffUserId) ?? ev.staffUserId;
        const bar = buildProgressBar(ev.overallScore, 6);
        return `**${i + 1}.** ${bar} \`${ev.overallScore}\` · ${name} ${trendIcon(ev.trend, ev.trendDelta)}`;
      });

    const container = new ContainerBuilder()
      .setAccentColor(scoreColor(data.averageScore))
      .addTextDisplayComponents(text(`### ${E.stats} Vue d'ensemble des évaluations`))
      .addTextDisplayComponents(text(`${E.arrow} **Score moyen** · **${data.averageScore}**/100`))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(text(lines.join('\n')))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(text(`-# ${E.kotbo} Kotbo · ${data.latestByStaff.length} membre(s) évalué(s)`));

    await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }
}

export const evaluationsCommand = { data, execute } satisfies SlashCommandDefinition;
