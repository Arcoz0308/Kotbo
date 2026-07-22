import type { SlashCommandDefinition } from '../../commands.js';
import {
  SlashCommandBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { errorContainer, infoContainer, kotboContainer, successContainer } from '../../utils/embeds.js';
import { E } from '../../utils/emojis.js';
import { checkInMeeting, getMeetings, createMeeting, syncMeetingPresencesWithAbsences } from '../../services/staff/staffLeadershipService.js';
import { getStaffMember } from '../../services/staff/staffManagementService.js';
import { logger } from '../../utils/logger.js';
import { separator, v2Message } from '@arcscord/components';

const data = new SlashCommandBuilder()
  .setName('meeting')
  .setDescription('Outils de gestion de réunion Staff.')
  .addSubcommand(sub =>
    sub.setName('checkin')
      .setDescription('Confirme manuellement votre présence à la réunion en cours.'))
  .addSubcommand(sub =>
    sub.setName('list')
      .setDescription('Liste les prochaines réunions staff.'))
  .addSubcommand(sub =>
    sub.setName('sync')
      .setDescription('Forces the sync of staff absences for the next meeting.'))
  .addSubcommand(sub =>
    sub.setName('create')
      .setDescription('Planifie une nouvelle réunion staff.')
      .addStringOption(opt => opt.setName('title').setDescription('Titre de la réunion').setRequired(true))
      .addStringOption(opt => opt.setName('date').setDescription('Date et heure (format: YYYY-MM-DD HH:mm)').setRequired(true))
      .addStringOption(opt => opt.setName('description').setDescription('Sujet ou ordre du jour').setRequired(false)));

async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) return;

  const staff = await getStaffMember(interaction.guildId, interaction.user.id);
  if (!staff) {
    await interaction.reply(v2Message(
      { flags: MessageFlags.Ephemeral },
      errorContainer('Accès refusé', "Vous ne faites pas partie de l'équipe Staff."),
    ));
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'checkin') {
    const meetings = await getMeetings(interaction.guildId);
    const now = new Date();
    const activeMeeting = meetings.find(m => m.status === 'SCHEDULED' && Math.abs(m.scheduledAt.getTime() - now.getTime()) < 6 * 60 * 60 * 1000);

    if (!activeMeeting) {
      await interaction.reply(v2Message(
        { flags: MessageFlags.Ephemeral },
        errorContainer('Aucune réunion', 'Aucune réunion Staff prévue ou en cours.'),
      ));
      return;
    }

    await checkInMeeting(interaction.client, activeMeeting.id, staff.id, 'PRESENT');
    await interaction.reply(v2Message(
      { flags: MessageFlags.Ephemeral },
      successContainer('Présence validée', `Présence validée pour: **${activeMeeting.title}**`),
    ));
  }

  else if (subcommand === 'list') {
    const meetings = await getMeetings(interaction.guildId);
    const upcoming = meetings.filter(m => m.scheduledAt.getTime() > Date.now() - 2 * 60 * 60 * 1000).slice(0, 5);

    if (upcoming.length === 0) {
      await interaction.reply(v2Message(
        { flags: MessageFlags.Ephemeral },
        infoContainer('Aucune réunion', 'Aucune réunion prévue prochainement.'),
      ));
      return;
    }

    const lines = upcoming.map((m) => {
      const timestamp = Math.floor(m.scheduledAt.getTime() / 1000);
      return `${E.dot} **${m.title}**: <t:${timestamp}:F> (<t:${timestamp}:R>)\n-# Statut: ${m.status}`;
    });

    await interaction.reply(v2Message(
      { flags: MessageFlags.Ephemeral },
      kotboContainer({
        color: 'info',
        title: `${E.calendar} Réunions Staff Prévues`,
        fields: [
          separator({ divider: true, spacing: 'small' }),
          ...lines,
        ],
      }),
    ));
  }

  else if (subcommand === 'sync') {
    const meetings = await getMeetings(interaction.guildId);
    const now = new Date();
    const nearest = meetings.find(m => m.status === 'SCHEDULED' && Math.abs(m.scheduledAt.getTime() - now.getTime()) < 24 * 60 * 60 * 1000);

    if (!nearest) {
      await interaction.reply(v2Message(
        { flags: MessageFlags.Ephemeral },
        errorContainer('Aucune réunion', 'Aucune réunion proche trouvée pour la synchronisation.'),
      ));
      return;
    }

    await syncMeetingPresencesWithAbsences(interaction.client, nearest.id);
    await interaction.reply(v2Message(
      { flags: MessageFlags.Ephemeral },
      successContainer('Synchronisation effectuée', `Synchronisation des absences effectuée pour: **${nearest.title}**.`),
    ));
  }

  else if (subcommand === 'create') {
    const title = interaction.options.getString('title', true);
    const dateStr = interaction.options.getString('date', true);
    const description = interaction.options.getString('description') || '';

    const scheduledAt = new Date(dateStr);
    if (isNaN(scheduledAt.getTime())) {
      await interaction.reply(v2Message(
        { flags: MessageFlags.Ephemeral },
        errorContainer('Format invalide', 'Format de date invalide. Utilisez `YYYY-MM-DD HH:mm` (ex: 2024-05-20 21:00).'),
      ));
      return;
    }

    try {
      const _meeting = await createMeeting(interaction.client, interaction.guildId, interaction.user.id, title, description, scheduledAt);

      await interaction.reply(v2Message(
        { flags: MessageFlags.Ephemeral },
        successContainer('Réunion planifiée', `Réunion planifiée: **${title}** pour le <t:${Math.floor(scheduledAt.getTime()/1000)}:F>.\nL'événement Discord a été créé et l'annonce a été postée.`),
      ));
    } catch (err) {
      if (err instanceof Error && err.message.includes('Configurez')) {
        logger.warn('MeetingCmd', `Error creating meeting: ${err.message}`);
        await interaction.reply(v2Message(
          { flags: MessageFlags.Ephemeral },
          errorContainer('Erreur de configuration', err.message),
        ));
      } else {
        logger.error('MeetingCmd', 'Error creating meeting:', err);
        await interaction.reply(v2Message(
          { flags: MessageFlags.Ephemeral },
          errorContainer('Erreur', 'Erreur lors de la création de la réunion.'),
        ));
      }
    }
  }
}

export const meetingCommand = { data, execute } satisfies SlashCommandDefinition;
