import type { SlashCommandDefinition } from '../../commands.js';
import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
} from 'discord.js';
import prisma from '../../utils/db.js';
import { getStaffMember } from '../../services/staff/staffManagementService.js';

const data = new SlashCommandBuilder()
  .setName('demission')
  .setDescription('Soumet une demande de démission du staff avec un motif.');

async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) return;

  const staff = await getStaffMember(interaction.guildId, interaction.user.id);
  if (!staff) {
    await interaction.reply({ content: '❌ Vous ne faites pas partie de l\'équipe Staff.', flags: [MessageFlags.Ephemeral] });
    return;
  }

  // Vérifier si une demande de démission est déjà en cours
  const pending = await prisma.staffResignation.findFirst({
    where: {
      guildId: interaction.guildId,
      staffUserId: staff.id,
      status: 'PENDING'
    }
  });

  if (pending) {
    await interaction.reply({ content: '❌ Vous avez déjà une demande de démission en attente d\'approbation.', flags: [MessageFlags.Ephemeral] });
    return;
  }

  // Afficher le modal pour renseigner le motif
  const modal = new ModalBuilder()
    .setCustomId('modal:resignation:open')
    .setTitle('Demande de démission');

  const reasonInput = new TextInputBuilder()
    .setCustomId('reason')
    .setLabel('Raison / Motif de la démission')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Veuillez expliquer brièvement les raisons de votre départ...')
    .setRequired(true)
    .setMaxLength(500);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput));
  await interaction.showModal(modal);
}

export const demissionCommand = { data, execute } satisfies SlashCommandDefinition;
