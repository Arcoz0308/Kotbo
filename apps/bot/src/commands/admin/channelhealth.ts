import type { SlashCommandDefinition } from '../../commands.js';
import { SlashCommandBuilder, ChannelType, type ChatInputCommandInteraction } from 'discord.js';
import { successEmbed, COLORS } from '../../utils/embeds.js';
import { EmbedBuilder } from 'discord.js';
import {
  analyzeGuildChannelHealth,
  upsertChannelHealthConfig,
} from '../../services/analytics/channelHealthService.js';

const data = new SlashCommandBuilder()
  .setName('channelhealth')
  .setDescription('📊 Gestion du moniteur de santé des salons')
  .addSubcommand(sub =>
    sub
      .setName('analyse')
      .setDescription('Lance une analyse de santé des salons'),
  )
  .addSubcommand(sub =>
    sub
      .setName('activer')
      .setDescription('Active le moniteur de santé des salons')
      .addChannelOption(opt =>
        opt
          .setName('salon-alertes')
          .setDescription('Salon pour recevoir les rapports')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false),
      ),
  )
  .addSubcommand(sub =>
    sub
      .setName('desactiver')
      .setDescription('Désactive le moniteur de santé des salons'),
  )
  .addSubcommand(sub =>
    sub
      .setName('config')
      .setDescription('Configure les seuils du moniteur')
      .addStringOption(opt =>
        opt
          .setName('mode-split')
          .setDescription('Mode pour les salons surchargés')
          .addChoices(
            { name: 'Notification seulement', value: 'NOTIFY' },
            { name: 'Automatique', value: 'AUTO' },
          )
          .setRequired(false),
      )
      .addStringOption(opt =>
        opt
          .setName('mode-archive')
          .setDescription('Mode pour les salons morts')
          .addChoices(
            { name: 'Notification seulement', value: 'NOTIFY' },
            { name: 'Automatique', value: 'AUTO' },
          )
          .setRequired(false),
      )
      .addIntegerOption(opt =>
        opt
          .setName('periode')
          .setDescription("Période d'analyse en jours (7-90)")
          .setMinValue(7)
          .setMaxValue(90)
          .setRequired(false),
      ),
  );

async function execute(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guildId;
  if (!guildId) return;

  if (subcommand === 'analyse') {
    await interaction.deferReply();

    const summary = await analyzeGuildChannelHealth(interaction.client, guildId);

    if (!summary || summary.channels.length === 0) {
      await interaction.editReply({
        embeds: [successEmbed('Analyse', 'Aucune donnée disponible. Activez le moniteur et attendez quelques jours de collecte.')],
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('📊 Santé des Salons')
      .setColor(COLORS.primary)
      .setTimestamp()
      .setFooter({ text: `Analyse sur ${summary.periodDays} jours — ${summary.channels.length} salon(s) analysé(s)` });

    const statusIcons: Record<string, string> = {
      HEALTHY: '🟢',
      OVERLOADED: '🔴',
      UNDERUSED: '🟡',
      DEAD: '⚫',
    };

    const statusCounts = {
      HEALTHY: summary.healthy.length,
      OVERLOADED: summary.overloaded.length,
      UNDERUSED: summary.underused.length,
      DEAD: summary.dead.length,
    };

    embed.addFields({
      name: 'Résumé',
      value: Object.entries(statusCounts)
        .map(([status, count]) => `${statusIcons[status]} **${status}**: ${count}`)
        .join(' | '),
    });

    if (summary.overloaded.length > 0) {
      embed.addFields({
        name: '🔴 Salons surchargés',
        value: summary.overloaded
          .slice(0, 5)
          .map(c => `<#${c.channelId}> — ${c.avgMsgPerDay.toFixed(0)} msg/j, ${c.uniqueUsersAvg.toFixed(0)} users (${c.confidence}%)`)
          .join('\n'),
      });
    }

    if (summary.dead.length > 0) {
      embed.addFields({
        name: '⚫ Salons morts',
        value: summary.dead
          .slice(0, 5)
          .map(c => `<#${c.channelId}> — ${c.avgMsgPerDay.toFixed(2)} msg/j`)
          .join('\n'),
      });
    }

    if (summary.underused.length > 0) {
      embed.addFields({
        name: '🟡 Salons sous-utilisés',
        value: summary.underused
          .slice(0, 5)
          .map(c => `<#${c.channelId}> — ${c.avgMsgPerDay.toFixed(1)} msg/j, ${c.uniqueUsersAvg.toFixed(0)} users`)
          .join('\n'),
      });
    }

    const topChannels = summary.channels.slice(0, 5);
    embed.addFields({
      name: '📈 Top 5 salons actifs',
      value: topChannels
        .map((c, i) => `${i + 1}. <#${c.channelId}> — ${c.totalMessages} msg (${c.trend === 'UP' ? '↗️' : c.trend === 'DOWN' ? '↘️' : '➡️'})`)
        .join('\n'),
    });

    await interaction.editReply({ embeds: [embed] });
  } else if (subcommand === 'activer') {
    await interaction.deferReply({ ephemeral: true });
    const alertChannel = interaction.options.getChannel('salon-alertes');

    await upsertChannelHealthConfig(guildId, {
      enabled: true,
      ...(alertChannel ? { alertChannelId: alertChannel.id } : {}),
    });

    await interaction.editReply({
      embeds: [successEmbed(
        'Moniteur activé',
        `Le moniteur de santé des salons est maintenant actif.\n${alertChannel ? `Les rapports seront envoyés dans <#${alertChannel.id}>.` : 'Configurez un salon d\'alertes avec `/channelhealth config`.'}`,
      )],
    });
  } else if (subcommand === 'desactiver') {
    await interaction.deferReply({ ephemeral: true });
    await upsertChannelHealthConfig(guildId, { enabled: false });
    await interaction.editReply({
      embeds: [successEmbed('Moniteur désactivé', 'Le moniteur de santé des salons a été désactivé.')],
    });
  } else if (subcommand === 'config') {
    await interaction.deferReply({ ephemeral: true });

    const splitMode = interaction.options.getString('mode-split');
    const archiveMode = interaction.options.getString('mode-archive');
    const period = interaction.options.getInteger('periode');

    const updateData: Record<string, unknown> = {};
    if (splitMode) updateData.splitMode = splitMode;
    if (archiveMode) updateData.archiveMode = archiveMode;
    if (period) updateData.analysisPeriodDays = period;

    if (Object.keys(updateData).length === 0) {
      await interaction.editReply({
        embeds: [successEmbed('Configuration', 'Aucune modification spécifiée. Utilisez les options de la commande.')],
      });
      return;
    }

    await upsertChannelHealthConfig(guildId, updateData);

    const changes = [];
    if (splitMode) changes.push(`Mode split: **${splitMode}**`);
    if (archiveMode) changes.push(`Mode archive: **${archiveMode}**`);
    if (period) changes.push(`Période d'analyse: **${period}** jours`);

    await interaction.editReply({
      embeds: [successEmbed('Configuration mise à jour', changes.join('\n'))],
    });
  }
}

export const channelhealthCommand = { data, execute } satisfies SlashCommandDefinition;
