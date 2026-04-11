import { SlashCommandBuilder, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { checkInMeeting, getMeetings } from '../services/staffLeadershipService.js';
import { getStaffMember } from '../services/staffManagementService.js';

export const data = new SlashCommandBuilder()
  .setName('meeting')
  .setDescription('Outils de gestion de réunion Staff.')
  .addSubcommand(sub => 
    sub.setName('checkin')
      .setDescription('Confirme automatique votre présence à la réunion en cours.'));

export const execute = async (interaction: ChatInputCommandInteraction) => {
  if (!interaction.guildId) return;

  const staff = await getStaffMember(interaction.guildId, interaction.user.id);
  if (!staff) {
    await interaction.reply({ content: '❌ Vous ne faites pas partie de l\'équipe Staff.', flags: [MessageFlags.Ephemeral] });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'checkin') {
    // find nearest active meeting
    const meetings = await getMeetings(interaction.guildId);
    const now = new Date();
    // look for a meeting scheduled around now (+/- 12 hours max) that is 'SCHEDULED'
    const activeMeeting = meetings.find(m => m.status === 'SCHEDULED' && Math.abs(m.scheduledAt.getTime() - now.getTime()) < 12 * 60 * 60 * 1000);

    if (!activeMeeting) {
       await interaction.reply({ content: '❌ Aucune réunion Staff prévue en ce moment.', flags: [MessageFlags.Ephemeral] });
       return;
    }

    await checkInMeeting(activeMeeting.id, interaction.user.id, 'PRESENT');
    await interaction.reply({ content: `✅ Résence validée pour: **${activeMeeting.title}**`, flags: [MessageFlags.Ephemeral] });
  }
};
