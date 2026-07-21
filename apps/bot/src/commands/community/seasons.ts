import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { errorContainer, kotboContainer } from '../../utils/embeds.js';
import { E, rankEmoji, buildProgressBar } from '../../utils/emojis.js';
import { getAllSeasons, getSeasonLeaderboard } from '../../services/progression/seasonService.js';
import type { SlashCommandDefinition } from '../../commands.js';
import { ContainerChild, separator, v2Message } from '@arcscord/components';

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const STATUS_MAP: Record<string, { icon: string; label: string }> = {
  ACTIVE: { icon: E.online, label: 'Active' },
  UPCOMING: { icon: E.idle, label: 'À venir' },
  ENDED: { icon: E.offline, label: 'Terminée' },
};

const data = new SlashCommandBuilder()
  .setName('seasons')
  .setDescription('Saisons de progression — classements et récompenses')
  .addSubcommand((sub) =>
    sub.setName('list')
      .setDescription('Voir toutes les saisons'))
  .addSubcommand((sub) =>
    sub.setName('current')
      .setDescription('Voir la saison en cours et le classement'))
  .addSubcommand((sub) =>
    sub.setName('leaderboard')
      .setDescription('Classement d\'une saison')
      .addStringOption((opt) => opt.setName('saison').setDescription('ID de la saison').setRequired(true)));

async function execute(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;

  if (subcommand === 'list') {
    await interaction.deferReply();
    const seasons = await getAllSeasons(guildId);

    if (seasons.length === 0) {
      await interaction.editReply(v2Message(
        kotboContainer({
          color: 'dark',
          title: `${E.trophy} Saisons`,
          fields: [
            `${E.info} Aucune saison configurée pour le moment.`
          ],
          footerTitle: 'Saisons'
        })
      ));
      return;
    }

    const lines = seasons.map((s) => {
      const status = STATUS_MAP[s.status] ?? { icon: E.dot, label: s.status };
      const snapCount = s._count?.snapshots ?? 0;
      return `${status.icon} **Saison #${s.number}** · ${s.name}\n${E.dot} ${formatDate(s.startDate)} → ${formatDate(s.endDate)} · ${status.label}${snapCount > 0 ? ` · ${snapCount} participants` : ''}`;
    });

    await interaction.editReply(v2Message(
      kotboContainer({
        color: 'primary',
        title: `${E.trophy} Saisons`,
        fields: [
          separator({ divider: true, spacing: 'small' }),
          lines.join('\n\n')
        ],
        footerTitle: `${seasons.length} saison${seasons.length > 1 ? 's' : ''}`
      })
    ));
  }

  if (subcommand === 'current') {
    await interaction.deferReply();
    const seasons = await getAllSeasons(guildId);
    const active = seasons.find((s) => s.status === 'ACTIVE');

    if (!active) {
      await interaction.editReply(v2Message(
        kotboContainer({
          color: 'dark',
          title: `${E.trophy} Saison en cours`,
          fields: [
            `${E.info} Aucune saison active pour le moment.`
          ],
          footerTitle: 'Saisons'
        })
      ));
      return;
    }

    const now = Date.now();
    const start = new Date(active.startDate).getTime();
    const end = new Date(active.endDate).getTime();
    const totalDuration = end - start;
    const elapsed = now - start;
    const progressPct = totalDuration > 0 ? Math.min((elapsed / totalDuration) * 100, 100) : 0;
    const daysLeft = Math.max(0, Math.ceil((end - now) / 86400000));

    const lb = await getSeasonLeaderboard(guildId, active.id, 10);

    const fields: ContainerChild[] = [
      separator({ divider: true, spacing: 'small' }),
      [
        `${E.arrow} **Période** · ${formatDate(active.startDate)} → ${formatDate(active.endDate)}`,
        `${E.arrow} **Progression** · ${buildProgressBar(progressPct, 8)} \`${Math.round(progressPct)}%\``,
        `${E.arrow} **Temps restant** · ${daysLeft} jour(s)`,
      ].join('\n')
    ]

    // add leaderboard if exist
    if (lb.length > 0) {
      const lbLines = lb.map((entry) => {
        const medal = rankEmoji(entry.rank);
        return `${medal} <@${entry.userId}> — Lvl **${entry.level}** · **${entry.xp.toLocaleString('fr-FR')}** ${E.xp}`;
      });

      fields.push(
        separator({ divider: true, spacing: 'small' }),
        `**${E.level} Classement**`,
        lbLines.join('\n')
      )
    }

    await interaction.editReply(v2Message(
      kotboContainer({
        color: 'primary',
        title: `${E.trophy} Saison #${active.number} · ${active.name}`,
        fields,
        footerTitle: 'Saisons'
      })
    ));
  }

  if (subcommand === 'leaderboard') {
    const seasonId = interaction.options.getString('saison', true);
    await interaction.deferReply();

    const lb = await getSeasonLeaderboard(guildId, seasonId, 20);

    if (lb.length === 0) {
      await interaction.editReply(v2Message(
        errorContainer('Aucun résultat', 'Aucun classement trouvé pour cette saison.'),
      ));
      return;
    }

    const lines = lb.map((entry) => {
      const medal = rankEmoji(entry.rank);
      return `${medal} <@${entry.userId}> — Lvl **${entry.level}** · **${entry.xp.toLocaleString('fr-FR')}** ${E.xp}`;
    });

    await interaction.editReply(v2Message(
      kotboContainer({
        color: 'primary',
        title: `${E.trophy} Classement Saison`,
        fields: [
          separator({ divider: true, spacing: 'small' }),
          lines.join('\n')
        ],
        footerTitle: `${lb.length} participant${lb.length > 1 ? 's' : ''}`
      })
    ));
  }
}

export const seasonsCommand = { data, execute } satisfies SlashCommandDefinition;
