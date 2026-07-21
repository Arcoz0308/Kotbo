import type { SlashCommandDefinition } from '../../commands.js';
import {
  SlashCommandBuilder,
  ChannelType,
  MessageFlags,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { successContainer, kotboContainer } from '../../utils/embeds.js';
import { E } from '../../utils/emojis.js';
import {
  analyzeGuildChannelHealth,
  upsertChannelHealthConfig,
} from '../../services/analytics/channelHealthService.js';
import { separator, v2Message } from '@arcscord/components';

const data = new SlashCommandBuilder()
  .setName('channelhealth')
  .setDescription('Gestion du moniteur de santé des salons')
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

const STATUS_ICONS: Record<string, string> = {
  HEALTHY: E.online,
  OVERLOADED: E.dnd,
  UNDERUSED: E.idle,
  DEAD: E.offline,
};

const STATUS_LABELS: Record<string, string> = {
  HEALTHY: 'Sain',
  OVERLOADED: 'Surchargé',
  UNDERUSED: 'Sous-utilisé',
  DEAD: 'Mort',
};

function trendIcon(trend: string): string {
  if (trend === 'UP') return `${E.success}`;
  if (trend === 'DOWN') return `${E.error}`;
  return `${E.dot}`;
}

async function execute(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guildId;
  if (!guildId) return;

  if (subcommand === 'analyse') {
    await interaction.deferReply();

    const summary = await analyzeGuildChannelHealth(interaction.client, guildId);

    if (!summary || summary.channels.length === 0) {
      await interaction.editReply(v2Message(
        successContainer('Analyse', 'Aucune donnée disponible. Activez le moniteur et attendez quelques jours de collecte.'),
      ));
      return;
    }

    const statusCounts = {
      HEALTHY: summary.healthy.length,
      OVERLOADED: summary.overloaded.length,
      UNDERUSED: summary.underused.length,
      DEAD: summary.dead.length,
    };

    const fields = [
      separator({ divider: true, spacing: 'small' }),
      `**Résumé**\n` +
        Object.entries(statusCounts)
          .map(([status, count]) => `${STATUS_ICONS[status]} **${STATUS_LABELS[status]}**: ${count}`)
          .join(' · '),
    ];

    if (summary.overloaded.length > 0) {
      fields.push(
        separator({ divider: true, spacing: 'small' }),
        `**${E.dnd} Salons surchargés**\n` +
          summary.overloaded
            .slice(0, 5)
            .map(c => `${E.dot} <#${c.channelId}> — ${c.avgMsgPerDay.toFixed(0)} msg/j, ${c.uniqueUsersAvg.toFixed(0)} users (${c.confidence}%)`)
            .join('\n'),
      );
    }

    if (summary.dead.length > 0) {
      fields.push(
        separator({ divider: true, spacing: 'small' }),
        `**${E.offline} Salons morts**\n` +
          summary.dead
            .slice(0, 5)
            .map(c => `${E.dot} <#${c.channelId}> — ${c.avgMsgPerDay.toFixed(2)} msg/j`)
            .join('\n'),
      );
    }

    if (summary.underused.length > 0) {
      fields.push(
        separator({ divider: true, spacing: 'small' }),
        `**${E.idle} Salons sous-utilisés**\n` +
          summary.underused
            .slice(0, 5)
            .map(c => `${E.dot} <#${c.channelId}> — ${c.avgMsgPerDay.toFixed(1)} msg/j, ${c.uniqueUsersAvg.toFixed(0)} users`)
            .join('\n'),
      );
    }

    const topChannels = summary.channels.slice(0, 5);
    fields.push(
      separator({ divider: true, spacing: 'small' }),
      `**${E.trophy} Top 5 salons actifs**\n` +
        topChannels
          .map((c, i) => `${E.dot} **${i + 1}.** <#${c.channelId}> — ${c.totalMessages} msg ${trendIcon(c.trend)}`)
          .join('\n'),
    );

    await interaction.editReply(v2Message(
      kotboContainer({
        color: 'primary',
        title: `${E.stats} Santé des Salons`,
        fields,
        footerTitle: `Analyse sur ${summary.periodDays}j — ${summary.channels.length} salon(s)`,
      }),
    ));
  } else if (subcommand === 'activer') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const alertChannel = interaction.options.getChannel('salon-alertes');

    await upsertChannelHealthConfig(guildId, {
      enabled: true,
      ...(alertChannel ? { alertChannelId: alertChannel.id } : {}),
    });

    const desc = alertChannel
      ? `Les rapports seront envoyés dans <#${alertChannel.id}>.`
      : 'Configurez un salon d\'alertes avec `/channelhealth config`.';

    await interaction.editReply(v2Message(
      successContainer('Moniteur activé', desc),
    ));
  } else if (subcommand === 'desactiver') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await upsertChannelHealthConfig(guildId, { enabled: false });
    await interaction.editReply(v2Message(
      successContainer('Moniteur désactivé', 'Le moniteur de santé des salons a été désactivé.'),
    ));
  } else if (subcommand === 'config') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const splitMode = interaction.options.getString('mode-split');
    const archiveMode = interaction.options.getString('mode-archive');
    const period = interaction.options.getInteger('periode');

    const updateData: Record<string, unknown> = {};
    if (splitMode) updateData.splitMode = splitMode;
    if (archiveMode) updateData.archiveMode = archiveMode;
    if (period) updateData.analysisPeriodDays = period;

    if (Object.keys(updateData).length === 0) {
      await interaction.editReply(v2Message(
        successContainer('Configuration', 'Aucune modification spécifiée. Utilisez les options de la commande.'),
      ));
      return;
    }

    await upsertChannelHealthConfig(guildId, updateData);

    const changes = [];
    if (splitMode) changes.push(`${E.arrow} **Mode split** · ${splitMode}`);
    if (archiveMode) changes.push(`${E.arrow} **Mode archive** · ${archiveMode}`);
    if (period) changes.push(`${E.arrow} **Période** · ${period} jours`);

    await interaction.editReply(v2Message(
      kotboContainer({
        color: 'success',
        title: `${E.settings} Configuration mise à jour`,
        fields: [
          separator({ divider: true, spacing: 'small' }),
          changes.join('\n'),
        ],
        footerTitle: 'Channel Health',
      }),
    ));
  }
}

export const channelhealthCommand = { data, execute } satisfies SlashCommandDefinition;
