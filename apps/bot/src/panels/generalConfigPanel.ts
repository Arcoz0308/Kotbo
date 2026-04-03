import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
  type ButtonInteraction,
  type ChannelSelectMenuInteraction,
  type ChatInputCommandInteraction,
  type InteractionReplyOptions,
  type InteractionUpdateOptions,
  type ModalSubmitInteraction,
  type SelectMenuInteraction,
} from 'discord.js';
import prisma from '../utils/db.js';
import { errorEmbed } from '../utils/embeds.js';

type PanelInteraction =
  | ChatInputCommandInteraction
  | ButtonInteraction
  | SelectMenuInteraction
  | ChannelSelectMenuInteraction
  | ModalSubmitInteraction;

async function renderPanel(interaction: PanelInteraction, payload: InteractionReplyOptions): Promise<void> {
  const updatablePayload: InteractionUpdateOptions = {
    content: payload.content,
    embeds: payload.embeds,
    components: payload.components,
    allowedMentions: payload.allowedMentions,
  };

  if (interaction.isRepliable() && (interaction.deferred || interaction.replied)) {
    await interaction.editReply(updatablePayload);
    return;
  }

  if ('update' in interaction) {
    await interaction.update(updatablePayload);
    return;
  }

  await interaction.reply({
    ...payload,
    flags: payload.flags ?? [MessageFlags.Ephemeral],
  });
}

export async function sendMainConfigPanel(
  interaction: PanelInteraction,
  guildId: string
): Promise<void> {
  const guild = await prisma.guild.findUnique({ where: { id: guildId } });
  
  if (!guild) {
    await renderPanel(interaction, {
      embeds: [errorEmbed('Erreur', 'Serveur non trouvé dans la base de données')],
      flags: 64,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('⚙️ Hub de Configuration Kotbo')
    .setDescription('Navigation globale : ouvre une section puis configure chaque fonctionnalité dans son sous-menu.')
    .addFields(
      {
        name: '📰 Flux d’actualité (RSS / YouTube / Digest)',
        value: 'Géré via le panneau historique',
        inline: true,
      },
      {
        name: '🚨 Police du code',
        value: guild.codePoliceEnabled ? '✅ Activé' : '❌ Désactivé',
        inline: true,
      },
      {
        name: '📚 Daily Algo',
        value: guild.dailyAlgoEnabled
          ? `✅ ${guild.dailyAlgoChannelId ? 'Défi OK' : 'Défi manquant'} • ${guild.dailyAlgoValidationChannelId ? 'Validation OK' : 'Validation manquante'} • ${guild.dailyAlgoTime} UTC`
          : '❌ Désactivé',
        inline: true,
      },
      {
        name: '📦 Releases GitHub',
        value: guild.githubReleasesEnabled
          ? `✅ ${guild.githubReleasesChannelId ? 'Salon OK' : 'Salon manquant'} • ${guild.githubRepositories.length} repos`
          : '❌ Désactivé',
        inline: true,
      },
      {
        name: '🌐 Restriction de /status',
        value: guild.statusCheckChannelId ? `<#${guild.statusCheckChannelId}>` : 'Aucune restriction',
        inline: true,
      }
    )
    .setFooter({ text: '100 % des salons des fonctionnalités sont configurables en BDD' })
    .setTimestamp();

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('cfg:main:select')
    .setPlaceholder('Choisis une section')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('📰 Flux d’actualité')
        .setDescription('RSS, YouTube, digest, traduction, rôles, salons')
        .setValue('cfg:section:news'),
      new StringSelectMenuOptionBuilder()
        .setLabel('🚨 Police du code')
        .setDescription('Reformatte automatiquement le code')
        .setValue('cfg:section:code-police'),
      new StringSelectMenuOptionBuilder()
        .setLabel('📚 Daily Algo')
        .setDescription('Défi algorithmique quotidien')
        .setValue('cfg:section:daily-algo'),
      new StringSelectMenuOptionBuilder()
        .setLabel('📦 Releases GitHub')
        .setDescription('Notifications de nouvelles releases')
        .setValue('cfg:section:github-releases'),
      new StringSelectMenuOptionBuilder()
        .setLabel('🌐 Vérificateur de statut')
        .setDescription('Restriction de canal pour /status')
        .setValue('cfg:section:status')
    );

  const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('cfg:section:news').setLabel('📰 Ouvrir les flux d’actualité').setStyle(ButtonStyle.Primary),
  );

  await renderPanel(interaction, {
    embeds: [embed],
    components: [row1, row2],
  });
}

export async function sendNewsConfigSectionPanel(
  interaction: PanelInteraction,
  guildId: string
): Promise<void> {
  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    include: { feeds: true },
  });

  if (!guild) {
    await renderPanel(interaction, {
      embeds: [errorEmbed('Erreur', 'Serveur non trouvé dans la base de données')],
      flags: 64,
    });
    return;
  }

  const activeFeeds = guild.feeds.filter((f) => f.enabled).length;

  const embed = new EmbedBuilder()
    .setColor(0x3a86ff)
    .setTitle('📰 Flux d’actualité - Menu de section')
    .setDescription('Choisis une fonctionnalité pour ouvrir son panneau détaillé.')
    .addFields(
      {
        name: '📡 Flux RSS',
        value: `${activeFeeds}/${guild.feeds.length} actifs`,
        inline: true,
      },
      {
        name: '▶️ YouTube',
        value: guild.youtubeEnabled ? '✅ Activé' : '❌ Désactivé',
        inline: true,
      },
      {
        name: '📅 Digest',
        value: guild.digestEnabled ? `✅ ${guild.digestTime}` : '❌ Désactivé',
        inline: true,
      },
      {
        name: '🌐 Traduction',
        value: guild.translationEnabled ? `✅ -> ${guild.defaultTranslateTo}` : '❌ Désactivée',
        inline: true,
      },
      {
        name: '🛡️ Modération News',
        value: guild.moderatorRoleId ? `<@&${guild.moderatorRoleId}>` : 'Administrateurs uniquement',
        inline: true,
      },
      {
        name: '📺 Salon YouTube',
        value: guild.youtubeChannelId ? `<#${guild.youtubeChannelId}>` : 'Par défaut',
        inline: true,
      },
    )
    .setTimestamp();

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('config:feeds').setLabel('📡 Flux RSS').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('config:youtube_panel').setLabel('▶️ YouTube').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('config:digest').setLabel('📅 Digest').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('config:translation').setLabel('🌐 Traduction').setStyle(ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('config:keywords').setLabel('🔑 Mots-clés').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('config:set_mod_role').setLabel('🛡️ Rôle Mod').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('config:set_yt_channel').setLabel('📺 Salon YT').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('cfg:back:main').setLabel('← Menu général').setStyle(ButtonStyle.Secondary),
  );

  await renderPanel(interaction, {
    embeds: [embed],
    components: [row1, row2],
  });
}

export async function sendCodePoliceConfig(
  interaction: PanelInteraction,
  guildId: string
): Promise<void> {
  const guild = await prisma.guild.findUnique({ where: { id: guildId } });
  if (!guild) return;

  const embed = new EmbedBuilder()
    .setColor(0xff006e)
    .setTitle('🚨 Configuration - Police du code')
    .setDescription('Le bot reformatte automatiquement le code non formaté')
    .addFields(
      {
        name: 'Statut',
        value: guild.codePoliceEnabled ? '✅ **Activé**' : '❌ **Désactivé**',
        inline: false,
      },
      {
        name: 'Fonctionnalité',
        value:
          'Détecte les messages avec du code brut, supprime le message original et le reposte avec des backticks.',
        inline: false,
      }
    );

  const toggleBtn = new ButtonBuilder()
    .setCustomId('cfg:toggle:code-police')
    .setLabel(guild.codePoliceEnabled ? 'Désactiver' : 'Activer')
    .setStyle(guild.codePoliceEnabled ? ButtonStyle.Danger : ButtonStyle.Success);

  const backBtn = new ButtonBuilder()
    .setCustomId('cfg:back:main')
    .setLabel('← Retour')
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(toggleBtn, backBtn);

  await renderPanel(interaction, {
    embeds: [embed],
    components: [row],
  });
}

export async function sendDailyAlgoConfig(
  interaction: PanelInteraction,
  guildId: string
): Promise<void> {
  const guild = await prisma.guild.findUnique({ where: { id: guildId } });
  if (!guild) return;

  const embed = new EmbedBuilder()
    .setColor(0xffbe0b)
    .setTitle('📚 Configuration - Daily Algo')
    .setDescription('Défis algorithmiques quotidiens avec validation manuelle des réponses')
    .addFields(
      {
        name: 'Statut',
        value: guild.dailyAlgoEnabled ? '✅ **Activé**' : '❌ **Désactivé**',
        inline: false,
      },
      {
        name: 'Canal du défi',
        value: guild.dailyAlgoChannelId ? `<#${guild.dailyAlgoChannelId}>` : '❌ Non configuré',
        inline: false,
      },
      {
        name: 'Canal de validation',
        value: guild.dailyAlgoValidationChannelId ? `<#${guild.dailyAlgoValidationChannelId}>` : '❌ Non configuré',
        inline: false,
      },
      {
        name: 'Heure',
        value: `⏰ **${guild.dailyAlgoTime}** UTC`,
        inline: false,
      }
    );

  const toggleBtn = new ButtonBuilder()
    .setCustomId('cfg:toggle:daily-algo')
    .setLabel(guild.dailyAlgoEnabled ? 'Désactiver' : 'Activer')
    .setStyle(guild.dailyAlgoEnabled ? ButtonStyle.Danger : ButtonStyle.Success);

  const timeBtn = new ButtonBuilder()
    .setCustomId('cfg:modal:daily-algo:time')
    .setLabel('🕐 Changer l\'heure')
    .setStyle(ButtonStyle.Primary);

  const clearChannelBtn = new ButtonBuilder()
    .setCustomId('cfg:clear:daily-algo:channel')
    .setLabel('🧹 Retirer le salon du défi')
    .setStyle(ButtonStyle.Danger);

  const clearValidationBtn = new ButtonBuilder()
    .setCustomId('cfg:clear:daily-algo:validation-channel')
    .setLabel('🧹 Retirer le salon de validation')
    .setStyle(ButtonStyle.Danger);

  const backBtn = new ButtonBuilder()
    .setCustomId('cfg:back:main')
    .setLabel('← Retour')
    .setStyle(ButtonStyle.Secondary);

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId('cfg:select:daily-algo:channel')
    .setPlaceholder('Choisir le salon du défi Daily Algo')
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1);

  const validationSelect = new ChannelSelectMenuBuilder()
    .setCustomId('cfg:select:daily-algo:validation-channel')
    .setPlaceholder('Choisir le salon de validation des réponses')
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1);

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(toggleBtn, timeBtn, backBtn);
  const row2 = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(channelSelect);
  const row3 = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(validationSelect);
  const row4 = new ActionRowBuilder<ButtonBuilder>().addComponents(clearChannelBtn, clearValidationBtn);

  await renderPanel(interaction, {
    embeds: [embed],
    components: [row1, row2, row3, row4],
  });
}

export async function sendGitHubReleasesConfig(
  interaction: PanelInteraction,
  guildId: string
): Promise<void> {
  const guild = await prisma.guild.findUnique({ where: { id: guildId } });
  if (!guild) return;

  const repoList = guild.githubRepositories.join('\n• ');

  const embed = new EmbedBuilder()
    .setColor(0x8338ec)
    .setTitle('📦 Configuration - Releases GitHub')
    .setDescription('Notifications de nouvelles releases GitHub')
    .addFields(
      {
        name: 'Statut',
        value: guild.githubReleasesEnabled ? '✅ **Activé**' : '❌ **Désactivé**',
        inline: false,
      },
      {
        name: 'Canal',
        value: guild.githubReleasesChannelId ? `<#${guild.githubReleasesChannelId}>` : '❌ Non configuré',
        inline: false,
      },
      {
        name: `Dépôts surveillés (${guild.githubRepositories.length})`,
        value: `• ${repoList}`,
        inline: false,
      }
    );

  const toggleBtn = new ButtonBuilder()
    .setCustomId('cfg:toggle:github-releases')
    .setLabel(guild.githubReleasesEnabled ? 'Désactiver' : 'Activer')
    .setStyle(guild.githubReleasesEnabled ? ButtonStyle.Danger : ButtonStyle.Success);

  const reposBtn = new ButtonBuilder()
    .setCustomId('cfg:modal:github-releases:repos')
    .setLabel('📚 Gérer les dépôts')
    .setStyle(ButtonStyle.Primary);

  const clearChannelBtn = new ButtonBuilder()
    .setCustomId('cfg:clear:github-releases:channel')
    .setLabel('🧹 Retirer le salon')
    .setStyle(ButtonStyle.Danger);

  const backBtn = new ButtonBuilder()
    .setCustomId('cfg:back:main')
    .setLabel('← Retour')
    .setStyle(ButtonStyle.Secondary);

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId('cfg:select:github-releases:channel')
    .setPlaceholder('Choisir le salon des releases GitHub')
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1);

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(toggleBtn, reposBtn, clearChannelBtn, backBtn);
  const row2 = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(channelSelect);

  await renderPanel(interaction, {
    embeds: [embed],
    components: [row1, row2],
  });
}

export async function sendStatusConfig(interaction: PanelInteraction, guildId: string): Promise<void> {
  const guild = await prisma.guild.findUnique({ where: { id: guildId } });
  if (!guild) return;

  const embed = new EmbedBuilder()
    .setColor(0x06d6a0)
    .setTitle('🌐 Configuration - Vérificateur de statut')
    .setDescription('Personnalise le comportement de la commande /status')
    .addFields(
      {
        name: 'Salon autorisé (optionnel)',
        value: guild.statusCheckChannelId ? `<#${guild.statusCheckChannelId}>` : 'Aucune restriction',
        inline: false,
      },
      {
        name: 'Comportement',
        value: guild.statusCheckChannelId
          ? 'La commande /status est limitée à ce salon.'
          : 'La commande /status est utilisable dans tous les salons.',
        inline: false,
      },
    );

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('cfg:clear:status:channel').setLabel('🧹 Retirer la restriction').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('cfg:back:main').setLabel('← Retour').setStyle(ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId('cfg:select:status:channel')
      .setPlaceholder('Choisir le salon autorisé pour /status')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setMinValues(1)
      .setMaxValues(1),
  );

  await renderPanel(interaction, {
    embeds: [embed],
    components: [row1, row2],
  });
}

export async function buildSetTimeModal(): Promise<ModalBuilder> {
  return new ModalBuilder()
    .setCustomId('cfg:modal:daily-algo:time')
    .setTitle('Configurer l\'heure - Daily Algo')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('time')
          .setLabel('Heure (HH:MM UTC)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex: 09:00')
          .setRequired(true)
      )
    );
}

export async function buildSetReposModal(): Promise<ModalBuilder> {
  return new ModalBuilder()
    .setCustomId('cfg:modal:github-releases:repos')
    .setTitle('Configurer les dépôts GitHub')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('repos')
          .setLabel('Dépôts (un par ligne)')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('facebook/react\ndocker/compose\nmicrosoft/typescript')
          .setRequired(true)
      )
    );
}
