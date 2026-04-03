import {
  type Client,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { logger } from '../utils/logger.js';

export function registerDailyAlgoHandlers(client: Client): void {
  client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    if (interaction.customId !== 'daily-algo-submit') return;

    const modal = new ModalBuilder()
      .setCustomId('daily-algo-solution')
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
    if (interaction.customId !== 'daily-algo-solution') return;

    const solutionCode = interaction.fields.getTextInputValue('solution-code');

    try {
      await interaction.reply({
        content: `✅ Solution reçue de ${interaction.user.toString()} !\n\n||${solutionCode}||`,
      });

      await interaction.user.send({
        content: '✅ Ta solution pour le Daily Algo a bien été enregistrée !',
      }).catch(() => {
        logger.debug('DailyAlgo', `Impossible d'envoyer un MP à ${interaction.user.username}`);
      });
    } catch (error) {
      logger.error('DailyAlgo', 'Erreur lors du traitement de la soumission de solution :', error);
      await interaction.reply({
        content: '❌ Erreur lors de la soumission',
        flags: [MessageFlags.Ephemeral],
      });
    }
  });

  logger.success('DailyAlgo', 'Gestionnaires de bouton et de modal enregistrés');
}

export function getDailyAlgoButtonRow() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('daily-algo-submit')
      .setLabel('📝 Soumettre ma solution')
      .setStyle(ButtonStyle.Primary)
  );
}
