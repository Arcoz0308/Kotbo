import type { SlashCommandDefinition } from '../../commands.js';
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { COLORS_RAW, kotboContainer } from '../../utils/embeds.js';
import { E, buildProgressBar } from '../../utils/emojis.js';
import { getPulseDashboardData } from '../../services/analytics/pulseService.js';
import { ContainerChild, separator, v2Message } from '@arcscord/components';

function scoreColor(score: number): number {
  if (score >= 75) return COLORS_RAW.success;
  if (score >= 50) return COLORS_RAW.primary;
  if (score >= 30) return COLORS_RAW.warning;
  return COLORS_RAW.danger;
}

function trendLabel(trend: string, delta: number): string {
  if (trend === 'UP') return `${E.success} +${delta} pts`;
  if (trend === 'DOWN') return `${E.error} ${delta} pts`;
  return `${E.dot} Stable`;
}

function scoreBar(label: string, score: number): string {
  return `${E.dot} **${label}** · ${buildProgressBar(score, 8)} \`${score}/100\``;
}

const ALERT_ICONS: Record<string, string> = {
  danger: E.error,
  warning: E.warning,
  success: E.success,
};

const data = new SlashCommandBuilder()
  .setName('pulse')
  .setDescription('Pouls du serveur — score de santé et métriques clés');

async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const guildId = interaction.guildId;
  if (!guildId) return;

  const pulse = await getPulseDashboardData(guildId);
  const { current, metrics } = pulse;

  const fields: ContainerChild[] = [
    separator({ divider: true, spacing: 'small' }),
    [
      `**Score global** · **${current.score}**/100 ${trendLabel(current.trend, current.trendDelta)}`,
      '',
      scoreBar('Activité', current.activityScore),
      scoreBar('Engagement', current.engagementScore),
      scoreBar('Croissance', current.growthScore),
      scoreBar('Modération', current.moderationScore),
      scoreBar('Santé', current.healthScore),
    ].join('\n'),
    separator({ divider: true, spacing: 'small' }),
    [
      `**${E.messages} Métriques du jour**`,
      `${E.dot} Messages: **${metrics.totalMessages.toLocaleString('fr-FR')}** · Vocal: **${metrics.totalVoiceMinutes.toLocaleString('fr-FR')} min**`,
      `${E.dot} Membres actifs: **${metrics.activeMembers}**/${metrics.totalMembers}`,
      `${E.dot} Arrivées: **+${metrics.membersJoined}** · Départs: **-${metrics.membersLeft}**`,
      `${E.dot} Sanctions: **${metrics.sanctionsCount}** · Tickets: ${E.success} **${metrics.ticketsResolved}** / ${E.clock} **${metrics.ticketsOpen}**`,
      `${E.dot} Salons: ${E.online} **${metrics.channelsHealthy}** sains · ${E.dnd} **${metrics.channelsUnhealthy}** à surveiller`,
    ].join('\n'),
  ];

  if (current.alerts.length > 0) {
    const alertLines = current.alerts.map((a) => {
      const icon = ALERT_ICONS[a.severity] ?? E.info;
      return `${icon} ${a.message}`;
    });
    fields.push(
      separator({ divider: true, spacing: 'small' }),
      `**${E.warning} Alertes**\n${alertLines.join('\n')}`,
    );
  }

  await interaction.editReply(v2Message(
    kotboContainer({
      color: scoreColor(current.score),
      title: `${E.stats} Pouls du Serveur`,
      fields,
      footerTitle: 'Pulse',
    }),
  ));
}

export const pulseCommand = { data, execute } satisfies SlashCommandDefinition;
