import {
  type ChannelSelectMenuInteraction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type SelectMenuInteraction,
  MessageFlags,
} from 'discord.js';
import prisma from '../utils/db.js';
import {
  sendMainConfigPanel,
  sendNewsConfigSectionPanel,
  sendCodePoliceConfig,
  sendDailyAlgoConfig,
  sendGitHubReleasesConfig,
  sendStatusConfig,
  buildSetTimeModal,
  buildSetReposModal,
} from '../panels/generalConfigPanel.js';
import { errorEmbed, successEmbed } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';

export async function handleConfigSelectMenu(interaction: SelectMenuInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const value = interaction.values[0]!;

  switch (value) {
    case 'cfg:section:code-police':
      await sendCodePoliceConfig(interaction, guildId);
      break;
    case 'cfg:section:daily-algo':
      await sendDailyAlgoConfig(interaction, guildId);
      break;
    case 'cfg:section:github-releases':
      await sendGitHubReleasesConfig(interaction, guildId);
      break;
    case 'cfg:section:status':
      await sendStatusConfig(interaction, guildId);
      break;
    case 'cfg:section:news':
      await sendNewsConfigSectionPanel(interaction, guildId);
      break;
    case 'cfg:section:main':
      await sendMainConfigPanel(interaction, guildId);
      break;
  }
}

export async function handleConfigButton(interaction: ButtonInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const customId = interaction.customId;

  try {
    if (customId === 'cfg:back:main') {
      await sendMainConfigPanel(interaction, guildId);
    } else if (customId === 'cfg:section:news') {
      await sendNewsConfigSectionPanel(interaction, guildId);
    } else if (customId === 'cfg:toggle:code-police') {
      const guild = await prisma.guild.findUnique({ where: { id: guildId } });
      if (!guild) return;

      await prisma.guild.update({
        where: { id: guildId },
        data: { codePoliceEnabled: !guild.codePoliceEnabled },
      });

      await interaction.reply({
        embeds: [
          successEmbed(
            'Police du code',
            `✅ ${!guild.codePoliceEnabled ? 'Activé' : 'Désactivé'}`
          ),
        ],
        flags: [MessageFlags.Ephemeral],
      });

      await sendCodePoliceConfig(interaction, guildId);
    } else if (customId === 'cfg:toggle:daily-algo') {
      const guild = await prisma.guild.findUnique({ where: { id: guildId } });
      if (!guild) return;

      await prisma.guild.update({
        where: { id: guildId },
        data: { dailyAlgoEnabled: !guild.dailyAlgoEnabled },
      });

      await interaction.reply({
        embeds: [
          successEmbed(
            'Daily Algo',
            `✅ ${!guild.dailyAlgoEnabled ? 'Activé' : 'Désactivé'}`
          ),
        ],
        flags: [MessageFlags.Ephemeral],
      });

      await sendDailyAlgoConfig(interaction, guildId);
    } else if (customId === 'cfg:toggle:github-releases') {
      const guild = await prisma.guild.findUnique({ where: { id: guildId } });
      if (!guild) return;

      await prisma.guild.update({
        where: { id: guildId },
        data: { githubReleasesEnabled: !guild.githubReleasesEnabled },
      });

      await interaction.reply({
        embeds: [
          successEmbed(
            'Releases GitHub',
            `✅ ${!guild.githubReleasesEnabled ? 'Activé' : 'Désactivé'}`
          ),
        ],
        flags: [MessageFlags.Ephemeral],
      });

      await sendGitHubReleasesConfig(interaction, guildId);
    } else if (customId === 'cfg:modal:daily-algo:time') {
      const modal = await buildSetTimeModal();
      await interaction.showModal(modal);
    } else if (customId === 'cfg:modal:github-releases:repos') {
      const modal = await buildSetReposModal();
      await interaction.showModal(modal);
    } else if (customId === 'cfg:clear:daily-algo:channel') {
      await prisma.guild.update({ where: { id: guildId }, data: { dailyAlgoChannelId: null } });
      await interaction.reply({ embeds: [successEmbed('Daily Algo', 'Salon supprimé.')], flags: [MessageFlags.Ephemeral] });
      await sendDailyAlgoConfig(interaction, guildId);
    } else if (customId === 'cfg:clear:daily-algo:validation-channel') {
      await prisma.guild.update({ where: { id: guildId }, data: { dailyAlgoValidationChannelId: null } });
      await interaction.reply({ embeds: [successEmbed('Daily Algo', 'Salon de validation supprimé.')], flags: [MessageFlags.Ephemeral] });
      await sendDailyAlgoConfig(interaction, guildId);
    } else if (customId === 'cfg:clear:github-releases:channel') {
      await prisma.guild.update({ where: { id: guildId }, data: { githubReleasesChannelId: null } });
      await interaction.reply({ embeds: [successEmbed('Releases GitHub', 'Salon supprimé.')], flags: [MessageFlags.Ephemeral] });
      await sendGitHubReleasesConfig(interaction, guildId);
    } else if (customId === 'cfg:clear:status:channel') {
      await prisma.guild.update({ where: { id: guildId }, data: { statusCheckChannelId: null } });
      await interaction.reply({ embeds: [successEmbed('Vérificateur de statut', 'Restriction supprimée.')], flags: [MessageFlags.Ephemeral] });
      await sendStatusConfig(interaction, guildId);
    }
  } catch (error) {
    logger.error('ConfigHandler', 'Erreur lors du traitement du bouton de configuration :', error);
    await interaction.reply({
      embeds: [errorEmbed('Erreur', 'Une erreur est survenue')],
      flags: [MessageFlags.Ephemeral],
    });
  }
}

export async function handleConfigModal(interaction: ModalSubmitInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const customId = interaction.customId;

  try {
    if (customId === 'cfg:modal:daily-algo:time') {
      const time = interaction.fields.getTextInputValue('time');

      // Validate time format HH:MM
      if (!/^([0-1]\d|2[0-3]):([0-5]\d)$/.test(time)) {
        await interaction.reply({
          embeds: [errorEmbed('Format invalide', 'Utilise le format HH:MM (ex: 09:00)')],
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      await prisma.guild.update({
        where: { id: guildId },
        data: { dailyAlgoTime: time },
      });

      await interaction.reply({
        embeds: [successEmbed('Daily Algo', `Heure configurée : ${time} UTC`)],
        flags: [MessageFlags.Ephemeral],
      });

      await sendDailyAlgoConfig(interaction, guildId);
    } else if (customId === 'cfg:modal:github-releases:repos') {
      const reposText = interaction.fields.getTextInputValue('repos');
      const repos = reposText
        .split('\n')
        .map(r => r.trim())
        .filter(r => r.length > 0 && r.includes('/'));

      if (repos.length === 0) {
        await interaction.reply({
          embeds: [errorEmbed('Erreur', 'Au moins un dépôt est requis (format : owner/repo)')],
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      await prisma.guild.update({
        where: { id: guildId },
        data: { githubRepositories: repos },
      });

      await interaction.reply({
        embeds: [successEmbed('Releases GitHub', `${repos.length} dépôts configurés`)],
        flags: [MessageFlags.Ephemeral],
      });

      await sendGitHubReleasesConfig(interaction, guildId);
    }
  } catch (error) {
    logger.error('ConfigHandler', 'Erreur lors du traitement de la modal de configuration :', error);
    await interaction.reply({
      embeds: [errorEmbed('Erreur', 'Une erreur est survenue')],
      flags: [MessageFlags.Ephemeral],
    });
  }
}

export async function handleConfigChannelSelect(interaction: ChannelSelectMenuInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const customId = interaction.customId;
  const channelId = interaction.values[0]!;

  try {
    if (customId === 'cfg:select:daily-algo:channel') {
      await prisma.guild.update({ where: { id: guildId }, data: { dailyAlgoChannelId: channelId } });
      await interaction.reply({ embeds: [successEmbed('Daily Algo', `Salon configuré : <#${channelId}>`)], flags: [MessageFlags.Ephemeral] });
      await sendDailyAlgoConfig(interaction, guildId);
      return;
    }

    if (customId === 'cfg:select:daily-algo:validation-channel') {
      await prisma.guild.update({ where: { id: guildId }, data: { dailyAlgoValidationChannelId: channelId } });
      await interaction.reply({ embeds: [successEmbed('Daily Algo', `Salon de validation configuré : <#${channelId}>`)], flags: [MessageFlags.Ephemeral] });
      await sendDailyAlgoConfig(interaction, guildId);
      return;
    }

    if (customId === 'cfg:select:github-releases:channel') {
      await prisma.guild.update({ where: { id: guildId }, data: { githubReleasesChannelId: channelId } });
      await interaction.reply({ embeds: [successEmbed('Releases GitHub', `Salon configuré : <#${channelId}>`)], flags: [MessageFlags.Ephemeral] });
      await sendGitHubReleasesConfig(interaction, guildId);
      return;
    }

    if (customId === 'cfg:select:status:channel') {
      await prisma.guild.update({ where: { id: guildId }, data: { statusCheckChannelId: channelId } });
      await interaction.reply({ embeds: [successEmbed('Vérificateur de statut', `Salon autorisé : <#${channelId}>`)], flags: [MessageFlags.Ephemeral] });
      await sendStatusConfig(interaction, guildId);
      return;
    }
  } catch (error) {
    logger.error('ConfigHandler', 'Erreur lors du traitement de la sélection de salon :', error);
    await interaction.reply({
      embeds: [errorEmbed('Erreur', 'Une erreur est survenue')],
      flags: [MessageFlags.Ephemeral],
    });
  }
}
