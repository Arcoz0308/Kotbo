import { SlashCommandBuilder, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { createAbsence } from '../services/staffLeadershipService.js';
import { getStaffMember } from '../services/staffManagementService.js';

export const data = new SlashCommandBuilder()
  .setName('absent')
  .setDescription('Déclare une période d\'absence ou de congés pour le Staff.')
  .addStringOption(option => 
    option.setName('debut')
      .setDescription('Date de début (ex: YYYY-MM-DD)')
      .setRequired(true))
  .addStringOption(option => 
    option.setName('fin')
      .setDescription('Date de fin (ex: YYYY-MM-DD)')
      .setRequired(true))
  .addStringOption(option => 
    option.setName('raison')
      .setDescription('Motif de l\'absence')
      .setRequired(true));

export const execute = async (interaction: ChatInputCommandInteraction) => {
  if (!interaction.guildId) return;

  const debutStr = interaction.options.getString('debut', true);
  const finStr = interaction.options.getString('fin', true);
  const raison = interaction.options.getString('raison', true);

  const debutDate = new Date(debutStr);
  const finDate = new Date(finStr);

  if (isNaN(debutDate.getTime()) || isNaN(finDate.getTime())) {
    await interaction.reply({ content: '❌ Format de date invalide. Veuillez utiliser YYYY-MM-DD.', flags: [MessageFlags.Ephemeral] });
    return;
  }

  const staff = await getStaffMember(interaction.guildId, interaction.user.id);
  if (!staff) {
    await interaction.reply({ content: '❌ Vous ne faites pas partie de l\'équipe Staff.', flags: [MessageFlags.Ephemeral] });
    return;
  }

  await createAbsence(interaction.guildId, interaction.user.id, debutDate, finDate, raison);
  
  await interaction.reply({ content: '✅ Votre absence a été soumise à validation.', flags: [MessageFlags.Ephemeral] });
};
