import { SlashCommandBuilder, type ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { successEmbed, errorEmbed, infoEmbed } from '../utils/embeds.js';
import prisma from '../utils/db.js';

export const data = new SlashCommandBuilder()
  .setName('admin')
  .setDescription('🔧 Commandes administrateur')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sub =>
    sub
      .setName('info')
      .setDescription('Affiche les informations de configuration actuelles')
  )
  .addSubcommand(sub =>
    sub
      .setName('set-algo-channel')
      .setDescription('Définit le salon pour le Daily Algo')
      .addChannelOption(option =>
        option
          .setName('channel')
          .setDescription('Le salon des défis quotidiens')
          .setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('set-releases-channel')
      .setDescription('Définit le salon pour les releases GitHub')
      .addChannelOption(option =>
        option
          .setName('channel')
          .setDescription('Le salon des releases GitHub')
          .setRequired(true)
      )
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  if (!guildId) {
    await interaction.reply({
      embeds: [errorEmbed('Erreur', 'Cette commande doit être utilisée dans un serveur.')],
      flags: 64,
    });
    return;
  }

  await prisma.guild.upsert({ where: { id: guildId }, update: {}, create: { id: guildId } });

  if (subcommand === 'info') {
    const guild = await prisma.guild.findUnique({
      where: { id: guildId },
      select: {
        dailyAlgoChannelId: true,
        dailyAlgoEnabled: true,
        dailyAlgoTime: true,
        githubReleasesChannelId: true,
        githubReleasesEnabled: true,
        githubRepositories: true,
      },
    });

    await interaction.reply({
      embeds: [
        infoEmbed(
          'Configuration actuelle',
          'Paramètres persistés en base de données',
          [
            {
              name: 'Salon Daily Algo',
              value: guild?.dailyAlgoChannelId ? `<#${guild.dailyAlgoChannelId}>` : '❌ Non configuré',
              inline: true,
            },
            {
              name: 'Salon releases GitHub',
              value: guild?.githubReleasesChannelId ? `<#${guild.githubReleasesChannelId}>` : '❌ Non configuré',
              inline: true,
            },
            {
              name: 'Daily Algo',
              value: guild?.dailyAlgoEnabled ? `✅ Activé (${guild.dailyAlgoTime} UTC)` : '❌ Désactivé',
              inline: true,
            },
            {
              name: 'Releases GitHub',
              value: guild?.githubReleasesEnabled
                ? `✅ Activé (${guild.githubRepositories.length} repos)`
                : '❌ Désactivé',
              inline: false,
            },
          ]
        ),
      ],
      flags: 64,
    });
  } else if (subcommand === 'set-algo-channel') {
    const channel = interaction.options.getChannel('channel', true);

    if (channel.type !== 0 && channel.type !== 5) { // 5 = GUILD_NEWS (announce channel)
      await interaction.reply({
        embeds: [errorEmbed('Erreur', 'Le salon doit être un salon texte')],
        flags: 64,
      });
      return;
    }

    await interaction.reply({
      embeds: [
        successEmbed(
          'Salon Daily Algo configuré',
          `Le Daily Algo sera publié dans ${channel.toString()}`
        ),
      ],
      flags: 64,
    });

    await prisma.guild.update({
      where: { id: guildId },
      data: { dailyAlgoChannelId: channel.id },
    });
  } else if (subcommand === 'set-releases-channel') {
    const channel = interaction.options.getChannel('channel', true);

    if (channel.type !== 0 && channel.type !== 5) { // 5 = GUILD_NEWS (announce channel)
      await interaction.reply({
        embeds: [errorEmbed('Erreur', 'Le salon doit être un salon texte')],
        flags: 64,
      });
      return;
    }

    await interaction.reply({
      embeds: [
        successEmbed(
          'Salon releases GitHub configuré',
          `Les releases GitHub seront publiées dans ${channel.toString()}`
        ),
      ],
      flags: 64,
    });

    await prisma.guild.update({
      where: { id: guildId },
      data: { githubReleasesChannelId: channel.id },
    });
  }
}
