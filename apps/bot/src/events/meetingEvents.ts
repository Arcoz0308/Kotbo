import { Client, Events, VoiceState } from 'discord.js';
import prisma from '../utils/db.js';
import { logger } from '../utils/logger.js';
import { checkInMeeting } from '../services/staff/staffLeadershipService.js';

/**
 * Enregistre les événements liés aux réunions (pointage automatique en vocal).
 */
export function registerMeetingEvents(client: Client) {
  client.on(Events.VoiceStateUpdate, async (oldState: VoiceState, newState: VoiceState) => {
    const { member, guild, channelId } = newState;
    if (!member || member.user.bot || !guild) return;

    // On s'intéresse uniquement aux connexions à un salon (pas aux mutes/déconnexions pures)
    if (!channelId || channelId === oldState.channelId) return;

    // Récupération de la configuration pour voir si c'est le salon de réunion
    const guildConfig = await prisma.guild.findUnique({
      where: { id: guild.id },
      select: { meetingVoiceChannelId: true }
    });

    if (!guildConfig?.meetingVoiceChannelId || channelId !== guildConfig.meetingVoiceChannelId) {
      return;
    }

    // Recherche d'une réunion en cours ou imminente
    // On considère une fenêtre de 30min avant et 4h après l'heure prévue
    const now = new Date();
    const startTimeThreshold = new Date(now.getTime() + 30 * 60 * 1000);
    const endTimeThreshold = new Date(now.getTime() - 4 * 60 * 60 * 1000);

    const meeting = await prisma.staffMeeting.findFirst({
      where: {
        guildId: guild.id,
        status: 'SCHEDULED',
        scheduledAt: {
          lte: startTimeThreshold,
          gte: endTimeThreshold
        }
      }
    });

    if (!meeting) return;

    // Vérifier si c'est un membre du staff
    const staffMember = await prisma.staffMember.findFirst({
      where: { guildId: guild.id, userId: member.id }
    });

    if (!staffMember) return;

    try {
      // Pointage automatique
      await checkInMeeting(client, meeting.id, staffMember.id, 'PRESENT', 'Pointage automatique (Vocal)');
      logger.info('Meeting', `Pointage automatique réussi pour ${member.user.tag} (${member.id}) - Réunion: ${meeting.title}`);
    } catch (err) {
      logger.error('Meeting', `Erreur lors du pointage automatique pour ${member.user.id}:`, err);
    }
  });
}
