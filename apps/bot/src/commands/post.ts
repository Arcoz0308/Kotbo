import { SlashCommandBuilder, type ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { sendDigest } from '../services/digestService.js';
import { sendDailyAlgo } from '../services/digestService.js';
import { successEmbed, errorEmbed } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('post')
  .setDescription('🚀 Poster le digest et/ou le daily algo')
  .addSubcommand(subcommand =>
    subcommand
      .setName('digest')
      .setDescription('📰 Poster le digest du serveur')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('daily-algo')
      .setDescription('💻 Poster le daily algo du serveur')
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  if (!guildId) {
    await interaction.reply({
      embeds: [errorEmbed('Erreur', 'Cette commande ne peut être utilisée que dans un serveur.')],
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  try {
    if (subcommand === 'digest') {
      await sendDigest(interaction.client, guildId);
      await interaction.editReply({
        embeds: [successEmbed('✅ Digest envoyé', 'Le digest a été posté dans le salon configuré.')],
      });
    } else if (subcommand === 'daily-algo') {
      await sendDailyAlgo(interaction.client, guildId);
      await interaction.editReply({
        embeds: [successEmbed('✅ Daily Algo envoyé', 'Le daily algo a été posté dans le salon configuré.')],
      });
    }
  } catch (error) {
    logger.error('Post', `Erreur lors du post (${subcommand}):`, error);
    await interaction.editReply({
      embeds: [errorEmbed('❌ Erreur', 'Impossible de poster le contenu.')],
    });
  }
}
