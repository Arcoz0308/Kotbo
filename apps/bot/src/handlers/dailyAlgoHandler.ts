import {
  type Client,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js';
import { logger } from '../utils/logger.js';
import { queueDailyAlgoSubmission } from '../services/dailyAlgoService.js';
import { replyOrFollowUp } from '../utils/interactionResponses.js';

function formatRankLabel(rank: number): string {
  if (rank === 1) return '🥇 1er';
  if (rank === 2) return '🥈 2ème';
  if (rank === 3) return '🥉 3ème';
  return `#${rank}`;
}

export function registerDailyAlgoHandlers(client: Client): void {
  client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith('daily-algo-submit:')) return;

    const runId = interaction.customId.split(':')[1];
    if (!runId) return;

    const modal = new ModalBuilder()
      .setCustomId(`daily-algo-solution:${runId}`)
      .setTitle('Solution du Daily Algo');

    const solutionInput = new TextInputBuilder()
      .setCustomId('solution-code')
      .setLabel('Ton code')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Colle ton code ici...')
      .setRequired(true)
      .setMaxLength(1900);

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(solutionInput);
    modal.addComponents(row);

    await interaction.showModal(modal);
  });

  client.on('interactionCreate', async interaction => {
    if (!interaction.isModalSubmit()) return;
    if (!interaction.customId.startsWith('daily-algo-solution:')) return;

    const runId = interaction.customId.split(':')[1];
    if (!runId) return;

    const solutionCode = interaction.fields.getTextInputValue('solution-code');

    try {
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

      const result = await queueDailyAlgoSubmission({
        client,
        runId,
        authorId: interaction.user.id,
        authorName: interaction.user.globalName ?? interaction.user.username,
        solution: solutionCode,
      });

      const rankLabel = formatRankLabel(result.speedRank);
      const bonusPoints = result.speedRank <= 3 ? ` (+${4 - result.speedRank}pts bonus rapidité ⚡)` : '';

      await replyOrFollowUp(interaction, {
        content: `✅ **Solution enregistrée !**\n\nTu es le **${rankLabel}** à avoir soumis ta solution${bonusPoints}.\n\n⏳ Un membre du staff va noter ta réponse. Le classement sera mis à jour automatiquement !`,
        flags: [MessageFlags.Ephemeral],
      });

      await interaction.user.send({
        content: `✅ Ta réponse pour le Daily Algo a été enregistrée ! Tu es arrivé ${rankLabel}. Le classement sera affiché une fois ta solution notée.`,
      }).catch(() => {
        logger.debug('DailyAlgo', `Impossible d'envoyer un MP à ${interaction.user.username}`);
      });
    } catch (error) {
      logger.error('DailyAlgo', 'Erreur lors du traitement de la soumission de solution :', error);
      const message = error instanceof Error ? error.message : 'Erreur lors de la soumission';
      await replyOrFollowUp(interaction, {
        content: `❌ ${message}`,
        flags: [MessageFlags.Ephemeral],
      });
    }
  });

  logger.success('DailyAlgo', 'Gestionnaires de bouton et de modal enregistrés');
}
