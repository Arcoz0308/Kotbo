import { 
  MessageFlags, 
  SlashCommandBuilder, 
  type ChatInputCommandInteraction,
} from 'discord.js';
import { logger } from '../utils/logger.js';
import { buildEventResultsView } from '../services/eventService.js';

export const data = new SlashCommandBuilder()
  .setName('event')
  .setDescription('🎯 Commandes liées aux événements')
  .addSubcommand(sub => 
    sub
      .setName('resultat')
      .setDescription('📈 Voir tes résultats à un quiz')
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'resultat') {
    return handleResults(interaction);
  }
}

async function handleResults(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.editReply('❌ Cette commande doit être utilisée sur un serveur.');
      return;
    }

    const results = await buildEventResultsView(interaction, '', 0);
    await interaction.editReply(results);
  } catch (err) {
    logger.error('EventCommand', 'Error showing results:', err);
    await interaction.editReply('❌ Une erreur est survenue.');
  }
}
