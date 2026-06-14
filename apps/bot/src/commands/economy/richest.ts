import type { SlashCommandDefinition } from '../../commands.js';
import { SlashCommandBuilder, type ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from 'discord.js';
import { getRichestPlayers, getOrCreateEconomyConfig } from '../../services/features/economyService.js';
import { errorEmbed, COLORS } from '../../utils/embeds.js';

const data = new SlashCommandBuilder()
  .setName('richest')
  .setDescription('🏆 Classement des membres les plus riches du serveur');

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;

  try {
    const config = await getOrCreateEconomyConfig(guildId);
    const richest = await getRichestPlayers(guildId, 10);

    if (richest.length === 0) {
      await interaction.reply({
        content: 'Aucun profil n’existe encore sur ce serveur.',
        flags: [MessageFlags.Ephemeral]
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`🏆 Les plus riches — ${interaction.guild?.name}`)
      .setColor(COLORS.primary)
      .setTimestamp();

    const list = richest
      .map((profile, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `\`#${index + 1}\``;
        return `${medal} <@${profile.userId}> — **${profile.balance}** ${config.currencyEmoji} (Niveau ${profile.level})`;
      })
      .join('\n');

    embed.setDescription(list);

    await interaction.reply({ embeds: [embed] });
  } catch (err: any) {
    await interaction.reply({
      embeds: [errorEmbed('Erreur', err.message || 'Impossible de charger le classement.')],
      flags: [MessageFlags.Ephemeral]
    });
  }
}

export const richestCommand = { data, execute } satisfies SlashCommandDefinition;
