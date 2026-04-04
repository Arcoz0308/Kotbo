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

      await queueDailyAlgoSubmission({
        client,
        runId,
        authorId: interaction.user.id,
        authorName: interaction.user.globalName ?? interaction.user.username,
        solution: solutionCode,
      });

      await interaction.user.send({
        content: '✅ Ta réponse pour le Daily Algo a bien été enregistrée et envoyée en validation !',
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
