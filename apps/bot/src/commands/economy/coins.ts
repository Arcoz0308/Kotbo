import type { SlashCommandDefinition } from '../../commands.js';
import { SlashCommandBuilder, type ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from 'discord.js';
import { getOrCreateRpgProfile, getOrCreateEconomyConfig } from '../../services/features/economyService.js';
import { errorEmbed, COLORS } from '../../utils/embeds.js';

const data = new SlashCommandBuilder()
  .setName('coins')
  .setDescription('🪙 Consulter le solde de pièces d’un membre')
  .addUserOption(option =>
    option
      .setName('membre')
      .setDescription('Le membre à inspecter (défaut: vous-même)')
      .setRequired(false)
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const targetUser = interaction.options.getUser('membre') ?? interaction.user;

  if (targetUser.bot) {
    await interaction.reply({
      embeds: [errorEmbed('Erreur', 'Les bots n’ont pas de compte en banque !')],
      flags: [MessageFlags.Ephemeral]
    });
    return;
  }

  try {
    const profile = await getOrCreateRpgProfile(guildId, targetUser.id);
    const config = await getOrCreateEconomyConfig(guildId);

    const embed = new EmbedBuilder()
      .setTitle(`🪙 Portefeuille — ${targetUser.displayName}`)
      .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
      .setColor(COLORS.primary)
      .setDescription(
        `<@${targetUser.id}> possède actuellement **${profile.balance}** ${config.currencyEmoji} **${config.currencyName}**.`
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (err: any) {
    await interaction.reply({
      embeds: [errorEmbed('Erreur', err.message || 'Impossible de consulter le solde.')],
      flags: [MessageFlags.Ephemeral]
    });
  }
}

export const coinsCommand = { data, execute } satisfies SlashCommandDefinition;
