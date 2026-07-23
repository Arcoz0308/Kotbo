import { errorMessage } from '../../utils/errors.js';
import type { SlashCommandDefinition } from '../../commands.js';
import { SlashCommandBuilder, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { createSuggestion } from '../../services/features/suggestionService.js';

const data = new SlashCommandBuilder()
  .setName('suggest')
  .setDescription('💡 Soumettre une suggestion ou une idée pour le serveur')
  .addStringOption((o) =>
    o
      .setName('suggestion')
      .setDescription('Votre idée ou suggestion détaillée')
      .setRequired(true)
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: '❌ Cette commande doit être utilisée sur un serveur.',
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const content = interaction.options.getString('suggestion', true);

  try {
    const suggestion = await createSuggestion(
      guildId,
      interaction.user.id,
      interaction.user.username,
      content,
      interaction.client
    );
    await interaction.editReply(`💡 Votre suggestion a été publiée avec succès ! (ID : \`${suggestion.id}\`)`);
  } catch (err: unknown) {
    await interaction.editReply(`❌ Impossible de publier la suggestion : ${errorMessage(err) || 'erreur inconnue'}`);
  }
}

export const suggestCommand = { data, execute } satisfies SlashCommandDefinition;
