import { SlashCommandBuilder, type ChatInputCommandInteraction, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { successEmbed, errorEmbed, infoEmbed, COLORS, truncate } from '../utils/embeds.js';
import prisma from '../utils/db.js';
import { createPagination } from '../utils/pagination.js';



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
      .setName('add-daily-algo')
      .setDescription('Ajoute un nouveau problème dans la banque Daily Algo')
      .addStringOption(option =>
        option
          .setName('titre')
          .setDescription('Titre du problème')
          .setRequired(true),
      )
      .addStringOption(option =>
        option
          .setName('question')
          .setDescription('Énoncé du Daily Algo')
          .setRequired(true),
      )
      .addStringOption(option =>
        option
          .setName('solution')
          .setDescription('Solution attendue')
          .setRequired(true),
      )
      .addStringOption(option =>
        option
          .setName('difficulte')
          .setDescription('Niveau de difficulté')
          .addChoices(
            { name: 'Facile', value: 'facile' },
            { name: 'Moyen', value: 'moyen' },
            { name: 'Difficile', value: 'difficile' },
          )
          .setRequired(true),
      )
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
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await prisma.guild.upsert({ where: { id: guildId }, update: {}, create: { id: guildId } });

  if (subcommand === 'info') {
    const guild = await prisma.guild.findUnique({
      where: { id: guildId },
      select: {
        dailyAlgoChannelId: true,
        dailyAlgoValidationChannelId: true,
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
              name: 'Salon validation Daily Algo',
              value: guild?.dailyAlgoValidationChannelId ? `<#${guild.dailyAlgoValidationChannelId}>` : '❌ Non configuré',
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
      flags: [MessageFlags.Ephemeral],
    });
  } else if (subcommand === 'add-daily-algo') {
    const titre = interaction.options.getString('titre', true).trim();
    const question = interaction.options.getString('question', true).trim();
    const solution = interaction.options.getString('solution', true).trim();
    const difficulte = interaction.options.getString('difficulte', true).trim();

    const existing = await prisma.dailyAlgoProblem.findFirst({
      where: {
        title: titre,
        language: 'fr',
      },
    });

    if (existing) {
      await interaction.reply({
        embeds: [
          infoEmbed(
            'Daily Algo déjà présent',
            `Le problème **${titre}** existe déjà dans la banque française.`
          ),
        ],
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    await prisma.dailyAlgoProblem.create({
      data: {
        title: titre,
        description: question,
        solution,
        difficulty: difficulte,
        language: 'fr',
        functionName: 'solve',
        functionArgs: [{ name: 'input', type: 'unknown' }],
        unitTests: [{ name: 'placeholder', args: [null], expected: null }],
        allowedLanguages: ['javascript', 'typescript', 'python'],
      },
    });

    await interaction.reply({
      embeds: [
        successEmbed(
          'Daily Algo ajouté',
          `Le problème **${titre}** a été ajouté à la banque et pourra être sélectionné une seule fois.`
        ),
      ],
      flags: [MessageFlags.Ephemeral],
    });
  } else if (subcommand === 'set-algo-channel') {
    const channel = interaction.options.getChannel('channel', true);

    if (channel.type !== 0 && channel.type !== 5) { // 5 = GUILD_NEWS (announce channel)
      await interaction.reply({
        embeds: [errorEmbed('Erreur', 'Le salon doit être un salon texte')],
        flags: [MessageFlags.Ephemeral],
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
      flags: [MessageFlags.Ephemeral],
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
        flags: [MessageFlags.Ephemeral],
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
      flags: [MessageFlags.Ephemeral],
    });

    await prisma.guild.update({
      where: { id: guildId },
      data: { githubReleasesChannelId: channel.id },
    });

  }
}
