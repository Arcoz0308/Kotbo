import type { SlashCommandDefinition } from '../../commands.js';
import {
  SlashCommandBuilder,
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { COLORS_RAW, errorContainer, kotboContainer } from '../../utils/embeds.js';
import { E, buildProgressBar } from '../../utils/emojis.js';
import {
  generateStaffEvaluation,
  getStaffEvaluations,
  getEvaluationsDashboardData,
} from '../../services/staff/staffEvaluationService.js';
import { getStaffMember } from '../../services/staff/staffManagementService.js';
import { ContainerChild, separator, v2Message } from '@arcscord/components';

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
    const hasAdminPerm = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
      || interaction.guild?.ownerId === interaction.user.id;

    if (!staffMember && !hasAdminPerm) {
      await interaction.editReply(v2Message(
        errorContainer('Accès refusé', 'Cette commande est réservée au staff.'),
      ));
      return;
    }

    const evaluations = await getStaffEvaluations(guildId, targetUser.id);

    if (evaluations.length === 0) {
      await interaction.editReply(v2Message(
        kotboContainer({
          color: 'dark',
          title: `${E.stats} Évaluations · @${targetUser.username}`,
          fields: [`${E.info} Aucune évaluation disponible.`],
          footerTitle: 'Évaluations',
        }),
      ));
      return;
    }

    const latest = evaluations[0];

    const fields: ContainerChild[] = [
      separator({ divider: true, spacing: 'small' }),
      [
        `**Score global** · **${latest.overallScore}**/100 ${trendIcon(latest.trend, latest.trendDelta)}`,
        '',
        `${E.dot} **Activité** · ${buildProgressBar(latest.activityScore, 8)} \`${latest.activityScore}/100\``,
        `${E.dot} **Modération** · ${buildProgressBar(latest.moderationScore, 8)} \`${latest.moderationScore}/100\``,
        `${E.dot} **Présence** · ${buildProgressBar(latest.presenceScore, 8)} \`${latest.presenceScore}/100\``,
      ].join('\n'),
      separator({ divider: true, spacing: 'small' }),
      [
        `**${E.messages} Détails** · ${formatDate(latest.periodStart)} → ${formatDate(latest.periodEnd)}`,
        `${E.dot} Messages: **${latest.totalMessages.toLocaleString('fr-FR')}** · Vocal: **${latest.totalVoiceMinutes.toLocaleString('fr-FR')} min**`,
        `${E.dot} Sanctions traitées: **${latest.sanctionsHandled}** · Tickets résolus: **${latest.ticketsResolved}**`,
        `${E.dot} Réunions: **${latest.meetingsAttended}**/${latest.meetingsTotal} · Absences: **${latest.absenceDays}j**`,
      ].join('\n'),
    ];

    if (latest.managerNote) {
      fields.push(
        separator({ divider: true, spacing: 'small' }),
        `**${E.info} Note du responsable**\n${latest.managerNote}`,
      );
    }

    if (evaluations.length > 1) {
      const history = evaluations.slice(1, 4).map((ev) =>
        `${E.dot} ${formatDate(ev.periodEnd)} · **${ev.overallScore}**/100 ${trendIcon(ev.trend, ev.trendDelta)}`
      );
      fields.push(
        separator({ divider: true, spacing: 'small' }),
        `**${E.calendar} Historique**\n${history.join('\n')}`,
      );
    }

    await interaction.editReply(v2Message(
      kotboContainer({
        color: scoreColor(latest.overallScore),
        title: `${E.stats} Évaluation · @${targetUser.username}`,
        titleThumbnail: { url: targetUser.displayAvatarURL() },
        fields,
        footerTitle: `${evaluations.length} évaluation(s)`,
      }),
    ));
  }

  if (subcommand === 'generate') {
    const targetUser = interaction.options.getUser('membre', true);
    const periodDays = interaction.options.getInteger('periode') ?? 30;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const staffMember = await getStaffMember(guildId, interaction.user.id);
    const hasAdminPerm = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
      || interaction.guild?.ownerId === interaction.user.id;
    const isStaffAdmin = staffMember && ['ADMIN', 'OWNER'].includes(staffMember.grade);

    if (!isStaffAdmin && !hasAdminPerm) {
      await interaction.editReply(v2Message(
        errorContainer('Accès refusé', 'Seuls les admins peuvent générer des évaluations.'),
      ));
      return;
    }

    const evaluation = await generateStaffEvaluation(guildId, targetUser.id, periodDays);

    await interaction.editReply(v2Message(
      kotboContainer({
        color: scoreColor(evaluation.overallScore),
        title: `${E.success} Évaluation générée`,
        fields: [
          separator({ divider: true, spacing: 'small' }),
          [
            `${E.arrow} **Membre** · @${targetUser.username}`,
            `${E.arrow} **Période** · ${periodDays} jours`,
            `${E.arrow} **Score** · **${evaluation.overallScore}**/100 ${trendIcon(evaluation.trend, evaluation.trendDelta)}`,
            '',
            `${E.dot} Activité: **${evaluation.activityScore}** · Modération: **${evaluation.moderationScore}** · Présence: **${evaluation.presenceScore}**`,
          ].join('\n'),
        ],
        footerTitle: 'Évaluations',
      }),
    ));
  }

  if (subcommand === 'overview') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const staffMember = await getStaffMember(guildId, interaction.user.id);
    const hasAdminPerm = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
      || interaction.guild?.ownerId === interaction.user.id;
    const isStaffAdmin = staffMember && ['ADMIN', 'OWNER'].includes(staffMember.grade);

    if (!isStaffAdmin && !hasAdminPerm) {
      await interaction.editReply(v2Message(
        errorContainer('Accès refusé', 'Seuls les admins peuvent voir la vue d\'ensemble.'),
      ));
      return;
    }

    const data = await getEvaluationsDashboardData(guildId);

    if (data.latestByStaff.length === 0) {
      await interaction.editReply(v2Message(
        kotboContainer({
          color: 'dark',
          title: `${E.stats} Vue d'ensemble`,
          fields: [`${E.info} Aucune évaluation disponible. Utilisez \`/evaluations generate\`.`],
          footerTitle: 'Évaluations',
        }),
      ));
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

    await interaction.editReply(v2Message(
      kotboContainer({
        color: scoreColor(data.averageScore),
        title: `${E.stats} Vue d'ensemble des évaluations`,
        fields: [
          `${E.arrow} **Score moyen** · **${data.averageScore}**/100`,
          separator({ divider: true, spacing: 'small' }),
          lines.join('\n'),
        ],
        footerTitle: `${data.latestByStaff.length} membre(s) évalué(s)`,
      }),
    ));
  }
}

export const evaluationsCommand = { data, execute } satisfies SlashCommandDefinition;
