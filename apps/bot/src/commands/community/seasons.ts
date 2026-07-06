import {
  SlashCommandBuilder,
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { COLORS_RAW, text, errorContainer } from '../../utils/embeds.js';
import { E, rankEmoji, buildProgressBar } from '../../utils/emojis.js';
import { getAllSeasons, getSeasonLeaderboard } from '../../services/progression/seasonService.js';
import type { SlashCommandDefinition } from '../../commands.js';

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
      const container = new ContainerBuilder()
        .setAccentColor(COLORS_RAW.dark)
        .addTextDisplayComponents(text(`### ${E.trophy} Saisons`))
        .addTextDisplayComponents(text(`${E.info} Aucune saison configurée pour le moment.`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(text(`-# ${E.kotbo} Kotbo · Saisons`));

      await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      return;
    }

    const lines = seasons.map((s: any) => {
      const status = STATUS_MAP[s.status] ?? { icon: E.dot, label: s.status };
      const snapCount = s._count?.snapshots ?? 0;
      return `${status.icon} **Saison #${s.number}** · ${s.name}\n${E.dot} ${formatDate(s.startDate)} → ${formatDate(s.endDate)} · ${status.label}${snapCount > 0 ? ` · ${snapCount} participants` : ''}`;
    });

    const container = new ContainerBuilder()
      .setAccentColor(COLORS_RAW.primary)
      .addTextDisplayComponents(text(`### ${E.trophy} Saisons`))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(text(lines.join('\n\n')))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(text(`-# ${E.kotbo} Kotbo · ${seasons.length} saison(s)`));

    await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  if (subcommand === 'current') {
    await interaction.deferReply();
    const seasons = await getAllSeasons(guildId);
    const active = seasons.find((s: any) => s.status === 'ACTIVE');

    if (!active) {
      const container = new ContainerBuilder()
        .setAccentColor(COLORS_RAW.dark)
        .addTextDisplayComponents(text(`### ${E.trophy} Saison en cours`))
        .addTextDisplayComponents(text(`${E.info} Aucune saison active pour le moment.`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(text(`-# ${E.kotbo} Kotbo · Saisons`));

      await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
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

    const container = new ContainerBuilder()
      .setAccentColor(COLORS_RAW.primary)
      .addTextDisplayComponents(text(`### ${E.trophy} Saison #${active.number} · ${active.name}`))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(text([
        `${E.arrow} **Période** · ${formatDate(active.startDate)} → ${formatDate(active.endDate)}`,
        `${E.arrow} **Progression** · ${buildProgressBar(progressPct, 8)} \`${Math.round(progressPct)}%\``,
        `${E.arrow} **Temps restant** · ${daysLeft} jour(s)`,
      ].join('\n')));

    if (lb.length > 0) {
      const lbLines = lb.map((entry: any) => {
        const medal = rankEmoji(entry.rank);
        return `${medal} <@${entry.userId}> — Lvl **${entry.level}** · **${entry.xp.toLocaleString('fr-FR')}** ${E.xp}`;
      });

      container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
      container.addTextDisplayComponents(text(`**${E.level} Classement**`));
      container.addTextDisplayComponents(text(lbLines.join('\n')));
    }

    container
      .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(text(`-# ${E.kotbo} Kotbo · Saisons`));

    await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  if (subcommand === 'leaderboard') {
    const seasonId = interaction.options.getString('saison', true);
    await interaction.deferReply();

    const lb = await getSeasonLeaderboard(guildId, seasonId, 20);

    if (lb.length === 0) {
      await interaction.editReply({
        components: [errorContainer('Aucun résultat', 'Aucun classement trouvé pour cette saison.')],
        flags: MessageFlags.IsComponentsV2,
      });
      return;
    }

    const lines = lb.map((entry: any) => {
      const medal = rankEmoji(entry.rank);
      return `${medal} <@${entry.userId}> — Lvl **${entry.level}** · **${entry.xp.toLocaleString('fr-FR')}** ${E.xp}`;
    });

    const container = new ContainerBuilder()
      .setAccentColor(COLORS_RAW.primary)
      .addTextDisplayComponents(text(`### ${E.trophy} Classement Saison`))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(text(lines.join('\n')))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(text(`-# ${E.kotbo} Kotbo · ${lb.length} participant(s)`));

    await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }
}

export const seasonsCommand = { data, execute } satisfies SlashCommandDefinition;
