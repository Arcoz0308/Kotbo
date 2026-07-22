import {
  SlashCommandBuilder,
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type MessageContextMenuCommandInteraction,
} from 'discord.js';
import type { SlashCommandDefinition, ContextCommandDefinition } from '../../commands.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { createMemberReport, type CreateReportResult } from '../../services/moderation/reportService.js';

const data = new SlashCommandBuilder()
  .setName('report')
  .setDescription('🚩 Signale un membre au staff du serveur')
  .addUserOption((opt) =>
    opt.setName('membre').setDescription('Le membre à signaler').setRequired(true))
  .addStringOption((opt) =>
    opt.setName('raison').setDescription('Raison du signalement').setRequired(true).setMaxLength(1000));

const contextData = new ContextMenuCommandBuilder()
  .setName('Signaler ce message')
  .setType(ApplicationCommandType.Message);

export function describeReportError(result: Extract<CreateReportResult, { ok: false }>): string {
  switch (result.error) {
    case 'DISABLED':
      return 'Les signalements ne sont pas activés sur ce serveur.';
    case 'NO_CHANNEL':
      return 'Aucun salon de signalements configuré. Contacte un administrateur.';
    case 'SELF_REPORT':
      return 'Tu ne peux pas te signaler toi-même. 🙃';
    case 'COOLDOWN':
      return `Merci d'attendre encore **${result.retryInSec}s** avant un nouveau signalement.`;
  }
}

async function executeSlash(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) return;
  const target = interaction.options.getUser('membre', true);
  const reason = interaction.options.getString('raison', true);

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const result = await createMemberReport({
    client: interaction.client,
    guild: interaction.guild,
    reporter: interaction.user,
    targetId: target.id,
    reason,
  });

  if (!result.ok) {
    await interaction.editReply({ embeds: [errorEmbed('Signalement impossible', describeReportError(result))] });
    return;
  }

  await interaction.editReply({
    embeds: [successEmbed('Signalement envoyé', 'Le staff a été notifié et examinera ton signalement. Merci de contribuer à la sécurité du serveur. 🙏')],
  });
}

/** Le menu contextuel ouvre un modal pour saisir la raison ; la création du report
 *  est finalisée dans interactionHandler (`report_modal:`). */
async function executeContext(interaction: MessageContextMenuCommandInteraction): Promise<void> {
  if (!interaction.guild) return;
  const message = interaction.targetMessage;

  const modal = new ModalBuilder()
    .setCustomId(`report_modal:${message.author.id}:${message.channelId}:${message.id}`)
    .setTitle('Signaler ce message')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Raison du signalement')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(1000)
          .setRequired(true)
          .setPlaceholder('Décris le problème (spam, insulte, arnaque…)')
      )
    );

  await interaction.showModal(modal);
}

export const reportCommand: SlashCommandDefinition = { data, execute: executeSlash };
export const reportMessageContextCommand: ContextCommandDefinition = {
  data: contextData,
  execute: executeContext,
};
