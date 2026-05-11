import { 
  Client, 
  ChannelType, 
  GuildScheduledEventPrivacyLevel, 
  GuildScheduledEventEntityType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import prisma from '../utils/db.js';
import { logger } from '../utils/logger.js';
import type { 
  StaffAbsence, StaffMeeting, StaffMeetingPresence, 
  StaffManagerNote, StaffPoll, StaffPollOption, StaffPollVote,
  StaffProcedure, StaffProcedureRead
} from '@prisma/client';
import { getClient } from '../utils/client.js';

type AbsenceMutableStatus = 'PENDING' | 'ACKNOWLEDGED' | 'APPROVED' | 'REJECTED' | 'CANCELED' | 'ENDED';

export const getAbsences = async (guildId: string) => {
  const absences = await prisma.staffAbsence.findMany({
    where: { guildId },
    include: { staffMember: true },
    orderBy: { startDate: 'desc' },
  });

  // Fetch unique superior IDs (Discord IDs)
  const superiorUserIds = [...new Set(absences.map(a => a.superiorUserId).filter(Boolean))] as string[];

  if (superiorUserIds.length === 0) return absences;

  // Fetch superior staff members
  const superiors = await prisma.staffMember.findMany({
    where: {
      guildId,
      userId: { in: superiorUserIds }
    }
  });

  // Attach superior info and resolve display names
  return absences.map((absence) => {
    const staff = absence.staffMember;
    const superior = absence.superiorUserId ? superiors.find(s => s.userId === absence.superiorUserId) : null;

    // Helper to resolve display name: Pseudo > Tag > Username > Discord ID
    const resolveName = (m: any, defaultId: string) => {
      if (!m) return defaultId;
      return m.displayName || m.userTag || m.username || m.userId || defaultId;
    };

    return {
      ...absence,
      staffMember: {
        ...staff,
        displayName: resolveName(staff, absence.staffUserId),
      },
      superior: superior
        ? {
            ...superior,
            displayName: resolveName(superior, absence.superiorUserId!),
          }
        : null,
    };
  });
};



export const createAbsence = async (
  params: {
    guildId: string;
    staffMemberId: string;
    startDate: Date;
    endDate?: Date;
    reason: string;
    type: string;
    message?: string;
    superiorUserId: string;
  }
) => {
  const [requester, superior, allRoles] = await Promise.all([
    prisma.staffMember.findUnique({ where: { id: params.staffMemberId } }),
    prisma.staffMember.findUnique({ where: { userId: params.superiorUserId, guildId: params.guildId } }),
    prisma.staffRole.findMany({ where: { guildId: params.guildId, enabled: true } })
  ]);

  if (requester && superior && allRoles.length > 0) {
    const myRole = allRoles.find(r => r.name === requester.grade);
    const sRole = allRoles.find(r => r.name === superior.grade);
    
    if (myRole && sRole) {
      const isAdmin = myRole.level >= 100 || requester.grade === 'Admin'; // Fallback simplistic check
      const isSuperior = isAdmin ? (sRole.sortOrder <= myRole.sortOrder) : (sRole.sortOrder < myRole.sortOrder);
      
      if (!isSuperior) {
        throw new Error('Le responsable sélectionné doit avoir un grade supérieur ou égal au vôtre.');
      }
    }
  }

  const isIndefinite = !params.endDate;

  const absence = await prisma.staffAbsence.create({
    data: {
      guildId: params.guildId,
      staffUserId: params.staffMemberId,
      startDate: params.startDate,
      endDate: params.endDate,
      reason: params.reason,
      type: params.type,
      message: params.message,
      isIndefinite,
      superiorUserId: params.superiorUserId,
      superiorNotifiedAt: new Date(),
      status: 'ACKNOWLEDGED'
    }
  });

  // Notifier le responsable (superiorUserId)
  if (params.superiorUserId) {
    await createNotification(
      params.guildId,
      params.superiorUserId,
      'Validation d\'absence en attente',
      `Une absence a été soumise par un de vos subordonnés pour le motif: ${params.reason}.`,
      'WARNING',
      '/absences'
    ).catch(() => null);
  }

  // Notifier tous les managers/admins
  const managers = await prisma.staffMember.findMany({
    where: {
      guildId: params.guildId,
      grade: { in: ['Manager', 'Admin', 'Administrateur', 'Fondateur', 'Direction'] }
    }
  });
  
  if (managers.length > 0) {
    await Promise.all(managers
      .filter(m => m.userId !== params.superiorUserId)
      .map(m => createNotification(
        params.guildId,
        m.userId,
        'Nouvelle absence demandée',
        `Une absence a été soumise pour le motif: ${params.reason}.`,
        'INFO',
        '/absences'
      ).catch(() => null))
    );
  }

  return absence;
};

export const getAbsenceById = async (guildId: string, absenceId: string) => {
  return prisma.staffAbsence.findFirst({
    where: { id: absenceId, guildId },
    include: { staffMember: true },
  });
};

export const getLatestOpenAbsenceForMember = async (guildId: string, staffMemberId: string) => {
  return prisma.staffAbsence.findFirst({
    where: {
      guildId,
      staffUserId: staffMemberId,
      status: {
        in: ['PENDING', 'ACKNOWLEDGED', 'APPROVED'],
      },
      endedAt: null,
    },
    include: { staffMember: true },
    orderBy: { startDate: 'desc' },
  });
};

export const updateAbsenceStatus = async (
  id: string,
  status: AbsenceMutableStatus,
  decisionByUserId: string,
  decisionNote?: string
) => {
  const now = new Date();
  const result = await prisma.staffAbsence.update({
    where: { id },
    data: {
      status,
      decisionByUserId,
      decisionNote,
      decidedAt: now,
      endedByUserId: status === 'ENDED' || status === 'CANCELED' ? decisionByUserId : null,
      endedAt: status === 'ENDED' || status === 'CANCELED' ? now : null,
    }
  });

  // Notifier le demandeur
  const absence = await prisma.staffAbsence.findUnique({ where: { id } });
  if (absence && absence.staffUserId !== decisionByUserId) {
    await createNotification(
      absence.guildId,
      absence.staffUserId,
      'Mise à jour de votre absence',
      `Votre absence a été marquée comme: ${status}.`,
      status === 'APPROVED' ? 'SUCCESS' : (status === 'REJECTED' ? 'ERROR' : 'INFO'),
      '/absences'
    ).catch(() => null);
  }

  return result;
};

export const closeAbsence = async (
  absenceId: string,
  endedByUserId: string,
  closeNote?: string
) => {
  return prisma.staffAbsence.update({
    where: { id: absenceId },
    data: {
      status: 'ENDED',
      endedByUserId,
      endedAt: new Date(),
      decisionByUserId: endedByUserId,
      decisionNote: closeNote,
      decidedAt: new Date(),
    },
  });
};

export const getMeetings = async (guildId: string) => {
  return prisma.staffMeeting.findMany({
    where: { guildId },
    include: { presences: { include: { staffMember: { select: { username: true, displayName: true, avatarUrl: true, userId: true } } } } },
    orderBy: { scheduledAt: 'desc' },
  });
};

/**
 * Crée une réunion staff avec synchronisation Discord (Événement + Annonce).
 */
export const createMeeting = async (
  client: Client,
  guildId: string,
  createdByUserId: string,
  title: string,
  description: string,
  scheduledAt: Date,
  endedAt?: Date
) => {
  try {
    // 1. Récupération de la configuration Discord pour la guilde
    const guildConfig = await prisma.guild.findUnique({
      where: { id: guildId },
      select: {
        meetingAnnouncementChannelId: true,
        meetingVoiceChannelId: true,
      },
    });

    const announcementChannelId = guildConfig?.meetingAnnouncementChannelId;
    const voiceChannelId = guildConfig?.meetingVoiceChannelId;

    if (!announcementChannelId || !voiceChannelId) {
      throw new Error('Configurez les salons de réunion (annonce + vocal/conférence) dans la configuration staff avant de créer une réunion.');
    }

    // 2. Récupération de la guilde et des salons Discord
    const discordGuild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId).catch(() => null);
    if (!discordGuild) {
      throw new Error('Impossible d’accéder au serveur Discord pour créer la réunion.');
    }

    const announcementChannel = await client.channels.fetch(announcementChannelId).catch(() => null);
    if (!announcementChannel || (announcementChannel.type !== ChannelType.GuildText && announcementChannel.type !== ChannelType.GuildAnnouncement)) {
      throw new Error('Le salon d’annonce configuré est introuvable ou n’est pas un salon texte/annonces.');
    }

    const voiceChannel = await client.channels.fetch(voiceChannelId).catch(() => null);
    if (!voiceChannel || (voiceChannel.type !== ChannelType.GuildVoice && voiceChannel.type !== ChannelType.GuildStageVoice)) {
      throw new Error('Le salon vocal/conférence configuré est introuvable ou invalide.');
    }

    // 3. Création de l'événement programmé Discord
    const scheduledEvent = await discordGuild.scheduledEvents.create({
      name: title.trim().slice(0, 100),
      description: (description?.trim() || 'Réunion staff Kotbo').slice(0, 1000),
      scheduledStartTime: scheduledAt,
      scheduledEndTime: endedAt || new Date(scheduledAt.getTime() + 60 * 60 * 1000), // +1h par défaut
      privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
      entityType: GuildScheduledEventEntityType.Voice,
      channel: voiceChannel.id,
      reason: `Création via dashboard par ${createdByUserId}`,
    });

    // 4. Création de l'enregistrement en base de données
    const meeting = await prisma.staffMeeting.create({
      data: {
        guildId,
        createdByUserId,
        title,
        description,
        scheduledAt,
        endedAt: endedAt || new Date(scheduledAt.getTime() + 60 * 60 * 1000),
        discordEventId: scheduledEvent.id,
        status: 'SCHEDULED'
      }
    });

    // 5. Envoi du message d'annonce avec boutons de présence
    const embed = new EmbedBuilder()
      .setTitle(`📅 Nouvelle Réunion : ${title}`)
      .setDescription(description || 'Aucune description fournie.')
      .addFields(
        { name: 'Date & Heure', value: `<t:${Math.floor(scheduledAt.getTime() / 1000)}:F> (<t:${Math.floor(scheduledAt.getTime() / 1000)}:R>)`, inline: false },
        { name: 'Lieu', value: `<#${voiceChannel.id}>`, inline: true },
        { name: 'Organisateur', value: `<@${createdByUserId}>`, inline: true }
      )
      .setColor('#5865F2')
      .setTimestamp(scheduledAt);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`meeting_rsvp:${meeting.id}:PRESENT`)
        .setLabel('Présent')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId(`meeting_rsvp:${meeting.id}:EXCUSED`)
        .setLabel('S\'excuser')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('⏳'),
      new ButtonBuilder()
        .setCustomId(`meeting_rsvp:${meeting.id}:ABSENT`)
        .setLabel('Absent')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌')
    );

    const announcementMessage = await (announcementChannel as any).send({
      content: '📢 **Nouvelle réunion staff planifiée !** @everyone',
      embeds: [embed],
      components: [row]
    });

    // 6. Mise à jour du meeting avec l'ID du message Discord
    await prisma.staffMeeting.update({
      where: { id: meeting.id },
      data: { discordMessageId: announcementMessage.id }
    });

    // 7. Synchronisation automatique des absences (ceux déjà en congé sont marqués EXCUSED)
    await syncMeetingPresencesWithAbsences(client, meeting.id);

    // 8. Notifications internes (Dashboard Inbox + MP Discord)
    const staff = await prisma.staffMember.findMany({
      where: { guildId }
    });
    
    if (staff.length > 0) {
      await Promise.all(staff.map(m => createNotification(
        guildId,
        m.userId,
        'Nouvelle réunion planifiée',
        `La réunion "${title}" a été planifiée pour le ${scheduledAt.toLocaleString('fr-FR')}.`,
        'INFO',
        '/meetings'
      ).catch(() => null)));
    }

    // On met à jour l'annonce immédiatement pour afficher les stats initiales (ex: ceux déjà en congé)
    await updateMeetingAnnouncement(client, meeting.id);

    return { ...meeting, discordMessageId: announcementMessage.id };

  } catch (error) {
    logger.error('StaffLeadership', `Erreur lors de la création de la réunion: ${error instanceof Error ? error.message : error}`);
    throw error;
  }
};

export const updateMeetingStatus = async (id: string, status: 'SCHEDULED' | 'COMPLETED' | 'CANCELED') => {
  return prisma.staffMeeting.update({
    where: { id },
    data: { status }
  });
};

/**
 * Met à jour une réunion et synchronise les changements sur Discord.
 */
export const updateMeeting = async (
  client: Client,
  guildId: string,
  id: string,
  data: {
    title?: string;
    description?: string;
    scheduledAt?: Date;
    endedAt?: Date;
    status?: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED';
    discordMessageId?: string;
    discordEventId?: string;
  }
) => {
  const meeting = await prisma.staffMeeting.update({
    where: { id },
    data,
  });

  // Synchronisation Discord si nécessaire
  if (meeting.discordEventId && (data.title || data.description || data.scheduledAt || data.status)) {
    try {
      const discordGuild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId).catch(() => null);
      if (discordGuild) {
        const event = await discordGuild.scheduledEvents.fetch(meeting.discordEventId).catch(() => null);
        if (event) {
          await event.edit({
            name: meeting.title.trim().slice(0, 100),
            description: (meeting.description?.trim() || '').slice(0, 1000),
            scheduledStartTime: meeting.scheduledAt,
            scheduledEndTime: meeting.endedAt || new Date(meeting.scheduledAt.getTime() + 60 * 60 * 1000),
            status: data.status === 'COMPLETED' ? 3 : (data.status === 'CANCELED' ? 4 : (data.status === 'IN_PROGRESS' ? 2 : undefined)), // 3=Completed, 4=Canceled, 2=Active
          });
        } else {
          logger.warn('StaffLeadership', `Discord event ${meeting.discordEventId} not found for meeting ${meeting.id}`);
        }
      }
    } catch (err: any) {
      logger.error('StaffLeadership', `Failed to update Discord event ${meeting.discordEventId}: ${err.message}`, err.stack);
    }
  }

  // Optionnel : Mettre à jour l'embed de l'annonce si le message existe encore
  if (meeting.discordMessageId && (data.title || data.description || data.scheduledAt)) {
    try {
      const guildConfig = await prisma.guild.findUnique({
        where: { id: guildId },
        select: { meetingAnnouncementChannelId: true }
      });

      if (guildConfig?.meetingAnnouncementChannelId) {
        const channel = await client.channels.fetch(guildConfig.meetingAnnouncementChannelId).catch(() => null);
        if (channel?.isTextBased()) {
          const msg = await (channel as any).messages.fetch(meeting.discordMessageId).catch(() => null);
          if (msg) {
            const embed = EmbedBuilder.from(msg.embeds[0])
              .setTitle(`📅 Réunion : ${meeting.title}`)
              .setDescription(meeting.description || 'Aucune description fournie.')
              .setFields(
                { name: 'Date & Heure', value: `<t:${Math.floor(meeting.scheduledAt.getTime() / 1000)}:F> (<t:${Math.floor(meeting.scheduledAt.getTime() / 1000)}:R>)`, inline: false },
                { name: 'Lieu', value: msg.embeds[0].fields.find((f: any) => f.name === 'Lieu')?.value || 'Inconnu', inline: true },
                { name: 'Organisateur', value: msg.embeds[0].fields.find((f: any) => f.name === 'Organisateur')?.value || 'Inconnu', inline: true }
              );
            await msg.edit({ embeds: [embed] });
          }
        }
      }
    } catch (err) {
      logger.warn('StaffLeadership', `Impossible de mettre à jour l'annonce Discord ${meeting.discordMessageId}: ${err}`);
    }
  }

  return meeting;
};

/**
 * Supprime une réunion et annule optionnellement l'événement/message Discord associé.
 */
export const deleteMeeting = async (
  client: Client, 
  guildId: string, 
  id: string, 
  options: { deleteEvent?: boolean; deleteMessage?: boolean; deleteNotifications?: boolean } = { deleteEvent: true, deleteMessage: false, deleteNotifications: false }
) => {
  const meeting = await prisma.staffMeeting.findUnique({
    where: { id },
    select: { discordEventId: true, discordMessageId: true, title: true }
  });

  if (!meeting) return;

  // 1. Suppression de l'événement Discord
  if (options.deleteEvent && meeting.discordEventId) {
    try {
      const discordGuild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId).catch(() => null);
      if (discordGuild) {
        const event = await discordGuild.scheduledEvents.fetch(meeting.discordEventId).catch(() => null);
        if (event) {
          await event.delete().catch(() => null);
        }
      }
    } catch (err) {
      logger.warn('StaffLeadership', `Impossible d'annuler l'événement Discord ${meeting.discordEventId}: ${err}`);
    }
  }

  // 2. Suppression du message d'annonce
  if (options.deleteMessage && meeting.discordMessageId) {
    try {
      const guildConfig = await prisma.guild.findUnique({
        where: { id: guildId },
        select: { meetingAnnouncementChannelId: true }
      });
      if (guildConfig?.meetingAnnouncementChannelId) {
        const channel = await client.channels.fetch(guildConfig.meetingAnnouncementChannelId).catch(() => null);
        if (channel?.isTextBased()) {
          const msg = await (channel as any).messages.fetch(meeting.discordMessageId).catch(() => null);
          if (msg) {
            await msg.delete().catch(() => null);
          }
        }
      }
    } catch (err) {
      logger.warn('StaffLeadership', `Impossible de supprimer le message d'annonce ${meeting.discordMessageId}: ${err}`);
    }
  }

  // 3. Suppression des notifications internes
  if (options.deleteNotifications) {
    try {
      await prisma.notification.deleteMany({
        where: {
          guildId,
          title: 'Nouvelle réunion planifiée',
          message: { contains: `"${meeting.title}"` },
          link: '/meetings'
        }
      });
    } catch (err) {
      logger.warn('StaffLeadership', `Impossible de supprimer les notifications pour la réunion ${meeting.title}: ${err}`);
    }
  }

  return prisma.staffMeeting.delete({
    where: { id }
  });
};

export const checkInMeeting = async (
  client: Client,
  meetingId: string,
  staffUserId: string,
  status: 'PRESENT' | 'EXCUSED' | 'ABSENT',
  note?: string
) => {
  const result = await prisma.staffMeetingPresence.upsert({
    where: { meetingId_staffUserId: { meetingId, staffUserId } },
    update: {
      status,
      checkInAt: status === 'PRESENT' ? new Date() : null,
      note
    },
    create: {
      meetingId,
      staffUserId,
      status,
      checkInAt: status === 'PRESENT' ? new Date() : null,
      note
    },
    include: {
      meeting: true
    }
  });

  // Gérer la création d'une absence automatique si marqué comme ABSENT
  if (status === 'ABSENT') {
    await prisma.staffAbsence.create({
      data: {
        guildId: result.meeting.guildId,
        staffUserId: staffUserId,
        startDate: result.meeting.scheduledAt,
        endDate: new Date(result.meeting.scheduledAt.getTime() + 60 * 60 * 1000), // 1h par défaut
        reason: `Absent à la réunion : ${result.meeting.title}`,
        type: 'Réunion (Absent)',
        status: 'ACKNOWLEDGED'
      }
    });
  } else {
    // Si l'utilisateur re-change de statut, on pourrait supprimer l'absence automatique ?
    // Pour simplifier et éviter les erreurs, on ne supprime que si c'est exactement le même motif
    await prisma.staffAbsence.deleteMany({
      where: {
        staffUserId: staffUserId,
        type: 'Réunion (Absent)',
        reason: `Absent à la réunion : ${result.meeting.title}`
      }
    });
  }

  // Mettre à jour le message d'annonce Discord
  await updateMeetingAnnouncement(client, meetingId).catch(err => 
    logger.error('Meeting', `Failed to update announcement for ${meetingId}:`, err)
  );

  return result;
};

export const updateMeetingAnnouncement = async (client: any, meetingId: string) => {
  const meeting = await prisma.staffMeeting.findUnique({
    where: { id: meetingId },
    include: {
      presences: {
        include: {
          staffMember: true
        }
      }
    }
  });

  if (!meeting || !meeting.discordMessageId) return;

  const guildConfig = await prisma.guild.findUnique({
    where: { id: meeting.guildId },
    select: { meetingAnnouncementChannelId: true }
  });

  if (!guildConfig?.meetingAnnouncementChannelId) return;

  const channel = await client.channels.fetch(guildConfig.meetingAnnouncementChannelId).catch(() => null);
  if (!channel) return;

  const message = await channel.messages.fetch(meeting.discordMessageId).catch(() => null);
  if (!message) return;

  const presentCount = meeting.presences.filter(p => p.status === 'PRESENT').length;
  const excusedCount = meeting.presences.filter(p => p.status === 'EXCUSED').length;
  const absentCount = meeting.presences.filter(p => p.status === 'ABSENT').length;

  const embed = EmbedBuilder.from(message.embeds[0]);
  
  // Mettre à jour ou ajouter le champ de présence
  const presenceField = {
    name: '📊 État des présences',
    value: `✅ **Présents:** ${presentCount}\n⏳ **Excusés:** ${excusedCount}\n❌ **Absents:** ${absentCount}`,
    inline: false
  };

  const fields = [...message.embeds[0].fields];
  const presenceIdx = fields.findIndex(f => f.name === '📊 État des présences');
  if (presenceIdx !== -1) {
    fields[presenceIdx] = presenceField;
  } else {
    fields.push(presenceField);
  }

  // Ajouter les raisons d'excuses si présentes
  const excuses = meeting.presences
    .filter(p => p.status === 'EXCUSED' && p.note)
    .map(p => `- <@${p.staffMember.userId}> : *${p.note}*`)
    .join('\n');

  const excuseField = {
    name: '📝 Justifications',
    value: excuses || 'Aucune excuse fournie.',
    inline: false
  };

  const excuseIdx = fields.findIndex(f => f.name === '📝 Justifications');
  if (excuseIdx !== -1) {
    if (excuses) {
      fields[excuseIdx] = excuseField;
    } else {
      fields.splice(excuseIdx, 1);
    }
  } else if (excuses) {
    fields.push(excuseField);
  }

  embed.setFields(fields);

  await message.edit({ embeds: [embed] });
};

export const syncMeetingPresencesWithAbsences = async (client: Client, meetingId: string) => {
  const meeting = await prisma.staffMeeting.findUnique({
    where: { id: meetingId },
    select: { guildId: true, scheduledAt: true }
  });
  if (!meeting) return;

  const absences = await prisma.staffAbsence.findMany({
    where: {
      guildId: meeting.guildId,
      status: { in: ['APPROVED', 'ACKNOWLEDGED'] },
      startDate: { lte: meeting.scheduledAt },
      OR: [
        { endDate: { gte: meeting.scheduledAt } },
        { isIndefinite: true }
      ]
    }
  });

  for (const absence of absences) {
    await prisma.staffMeetingPresence.upsert({
      where: { meetingId_staffUserId: { meetingId, staffUserId: absence.staffUserId } },
      update: { status: 'EXCUSED', note: `Absence automatique (Staff Panel): ${absence.type} - ${absence.reason}` },
      create: { meetingId, staffUserId: absence.staffUserId, status: 'EXCUSED', note: `Absence automatique (Staff Panel): ${absence.type} - ${absence.reason}` }
    });
  }

  // Mettre à jour le message d'annonce Discord
  await updateMeetingAnnouncement(client, meetingId).catch(err => 
    logger.error('Meeting', `Failed to update announcement for ${meetingId}:`, err)
  );
};

export const getManagerNotes = async (guildId: string, staffUserId: string) => {
  return prisma.staffManagerNote.findMany({
    where: { guildId, staffUserId },
    include: { author: true },
    orderBy: { createdAt: 'desc' },
  });
};

export const createManagerNote = async (
  guildId: string,
  staffUserId: string,
  authorUserId: string,
  content: string
) => {
  const note = await prisma.staffManagerNote.create({
    data: {
      guildId,
      staffUserId,
      authorUserId,
      content
    }
  });

  // Notifier le staff concerné
  const author = await prisma.staffMember.findUnique({ where: { id: authorUserId } });
  const target = await prisma.staffMember.findUnique({ where: { id: staffUserId } });
  
  if (target) {
    await createNotification(
      guildId,
      target.userId,
      'Nouvelle note de management',
      `Une nouvelle note a été ajoutée à votre dossier par ${author?.displayName || 'un manager'}.`,
      'INFO',
      `/profile/${target.userId}`
    ).catch(() => null);
  }

  return note;
};

export const deleteManagerNote = async (id: string) => {
  return prisma.staffManagerNote.delete({
    where: { id }
  });
};

export const getPolls = async (guildId: string) => {
  return prisma.staffPoll.findMany({
    where: { guildId },
    include: {
      options: { include: { _count: { select: { votes: true } } } },
      author: { select: { username: true, displayName: true } },
      votes: { select: { staffUserId: true, weight: true } } // needed to compute results visually if access logic permits
    },
    orderBy: { createdAt: 'desc' },
  });
};

export const createPoll = async (
  guildId: string,
  authorUserId: string,
  title: string,
  description: string,
  options: string[],
  isAnonymous: boolean = true,
  closesAt?: Date
) => {
  const poll = await prisma.staffPoll.create({
    data: {
      guildId,
      authorUserId,
      title,
      description,
      isAnonymous,
      closesAt,
    }
  });

  if (options.length > 0) {
    await prisma.staffPollOption.createMany({
      data: options.map((opt, index) => ({
        pollId: poll.id,
        text: opt,
        sortOrder: index
      }))
    });
  }

  // Notifier tout le staff
  const staff = await prisma.staffMember.findMany({
    where: { guildId }
  });

  if (staff.length > 0) {
    await Promise.all(staff.map(m => createNotification(
      guildId,
      m.userId,
      'Nouveau sondage staff',
      `Un nouveau sondage est disponible : "${title}".`,
      'INFO',
      '/polls'
    ).catch(() => null)));
  }

  return poll;
};

export const castPollVote = async (
  pollId: string,
  staffUserId: string,
  optionId: string,
  weight: number = 1.0
) => {
  return prisma.staffPollVote.upsert({
    where: { pollId_staffUserId: { pollId, staffUserId } },
    update: {
      optionId,
      weight
    },
    create: {
      pollId,
      optionId,
      staffUserId,
      weight
    }
  });
};

export const getProcedures = async (guildId: string) => {
  return prisma.staffProcedure.findMany({
    where: { guildId },
    include: { reads: { select: { staffUserId: true, readAt: true } } },
    orderBy: { sortOrder: 'asc' },
  });
};

export const upsertProcedure = async (
  guildId: string,
  id: string | null,
  title: string,
  content: string,
  sortOrder: number
) => {
  if (id) {
    return prisma.staffProcedure.update({
      where: { id },
      data: { title, content, sortOrder }
    });
  } else {
    const procedure = await prisma.staffProcedure.create({
      data: { guildId, title, content, sortOrder }
    });

    // Notifier tout le staff
    const staff = await prisma.staffMember.findMany({ where: { guildId } });
    const notifsData = staff.map(m => ({
      guildId,
      userId: m.userId,
      title: 'Nouvelle procédure disponible',
      message: `Une nouvelle procédure intitulée "${title}" a été ajoutée. Veuillez en prendre connaissance.`,
      type: 'INFO',
      link: '/procedures',
      isRead: false
    }));

    if (notifsData.length > 0) {
      await prisma.notification.createMany({ data: notifsData });
    }

    return procedure;
  }
};

export const deleteProcedure = async (id: string) => {
  return prisma.staffProcedure.delete({
    where: { id }
  });
};

export const markProcedureAsRead = async (
  procedureId: string,
  staffUserId: string
) => {
  return prisma.staffProcedureRead.upsert({
    where: { procedureId_staffUserId: { procedureId, staffUserId } },
    update: { readAt: new Date() },
    create: { procedureId, staffUserId }
  });
};

export const getStaffAlertsAndProgression = async (guildId: string) => {
  const staff = await prisma.staffMember.findMany({
    where: { guildId },
    include: {
      activities: {
        where: {
          activityDate: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        }
      },
      warnings: {
        where: { isActive: true }
      },
      mentorReports: true
    }
  });

  return staff.map(member => {
    let progressionScore = 100;
    
    progressionScore -= member.warnings.length * 20;

    const positiveReports = member.mentorReports.filter(r => r.type === 'POSITIVE').length;
    const negativeReports = member.mentorReports.filter(r => r.type === 'NEGATIVE').length;
    progressionScore += positiveReports * 10;
    progressionScore -= negativeReports * 15;

    let hasInactivityAlert = false;
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const messages30d = member.activities.reduce((sum, a) => sum + a.messageCount, 0);
    const messages7d = member.activities.filter(a => a.activityDate >= sevenDaysAgo).reduce((sum, a) => sum + a.messageCount, 0);
    
    const avg30d = messages30d / 30;
    const avg7d = messages7d / 7;

    if (avg30d > 2 && avg7d < avg30d * 0.5) {
      hasInactivityAlert = true;
    }

    return {
      staffUserId: member.userId,
      progressionScore: Math.max(0, progressionScore),
      hasInactivityAlert,
      avg30d: Math.round(avg30d * 10) / 10,
      avg7d: Math.round(avg7d * 10) / 10
    };
  });
};

export const getNotifications = async (guildId: string, userId: string) => {
  return prisma.notification.findMany({
    where: { guildId, userId },
    orderBy: { createdAt: 'desc' },
    take: 50
  });
};

export const markNotificationRead = async (id: string, userId: string) => {
  return prisma.notification.update({
    where: { id, userId },
    data: { isRead: true }
  });
};

export const markAllNotificationsRead = async (guildId: string, userId: string) => {
  return prisma.notification.updateMany({
    where: { guildId, userId, isRead: false },
    data: { isRead: true }
  });
};

export const createNotification = async (
  guildId: string,
  userId: string,
  title: string,
  message: string,
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'CRITICAL' = 'INFO',
  link?: string,
  sendDm: boolean = true
) => {
  // 1. Vérifier si l'utilisateur est un membre du staff pour enregistrer la notification sur le dashboard
  const staff = await prisma.staffMember.findUnique({
    where: { guildId_userId: { guildId, userId } }
  });

  let notification = null;
  if (staff) {
    notification = await prisma.notification.create({
      data: {
        guildId,
        userId,
        title,
        message,
        type,
        link,
        isRead: false
      }
    });
  }

  // 2. Envoi d'un MP automatique (pour tout le monde, staff ou non)
  if (sendDm) {
    try {
      const client = getClient();
      const user = await client.users.fetch(userId).catch(() => null);
      if (user) {
        const typeEmoji = {
          'SUCCESS': '✅',
          'WARNING': '⚠️',
          'ERROR': '❌',
          'INFO': 'ℹ️',
          'CRITICAL': '🚨'
        }[type] || '🔔';

        const embed = new EmbedBuilder()
          .setTitle(`${typeEmoji} ${title}`)
          .setDescription(message)
          .setColor(type === 'ERROR' || type === 'CRITICAL' ? '#ED4245' : (type === 'WARNING' ? '#FEE75C' : (type === 'SUCCESS' ? '#57F287' : '#5865F2')))
          .setTimestamp();

        if (link && staff) { // Le lien vers le dashboard n'est utile que pour le staff
          const dashboardUrl = process.env.DASHBOARD_URL || 'http://localhost:5173';
          const fullLink = link.startsWith('http') ? link : `${dashboardUrl}${link}`;
          
          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setLabel('Voir sur le Dashboard')
              .setStyle(ButtonStyle.Link)
              .setURL(fullLink)
          );
          
          await user.send({ embeds: [embed], components: [row] }).catch(() => null);
        } else {
          await user.send({ embeds: [embed] }).catch(() => null);
        }
      }
    } catch (error) {
      logger.debug('Notification', `Impossible d'envoyer le MP à ${userId}: ${error}`);
    }
  }

  return notification;
};

/**
 * Notifie les participants d'une réunion au début et à la fin
 */
export const processMeetingNotifications = async () => {
  try {
    const now = new Date();
    const notificationWindow = 2 * 60 * 1000; // 2 minutes de fenêtre

    // 1. Vérifier les réunions qui commencent (dans les 2 minutes)
    const meetingsStarting = await prisma.staffMeeting.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledAt: {
          gte: new Date(now.getTime() - 1 * 60 * 1000), // 1 minute avant
          lte: new Date(now.getTime() + notificationWindow), // 2 minutes après
        },
      },
      include: {
        presences: {
          include: {
            staffMember: true
          }
        },
        guild: { select: { id: true, name: true } }
      }
    });

    for (const meeting of meetingsStarting) {
      // Vérifier si la notification de début a déjà été envoyée
      const hasStartNotification = meeting.notificationSentAt 
        && meeting.notificationSentAt.getTime() > new Date(now.getTime() - 5 * 60 * 1000).getTime();
      
      if (!hasStartNotification) {
        // Envoyer les notifications de début
        const participants = meeting.presences.map(p => p.staffMember);
        const notificationTasks = participants.map((member) =>
          createNotification(
            meeting.guildId,
            member.userId,
            '📅 Réunion en cours',
            `La réunion ${meeting.title} commence maintenant!`,
            'INFO',
            `/meetings?id=${meeting.id}`,
            true
          )
        );
        
        await Promise.all(notificationTasks);
        
        // Mettre à jour la notification date
        await prisma.staffMeeting.update({
          where: { id: meeting.id },
          data: { notificationSentAt: now }
        });
      }
    }

    // 2. Vérifier les réunions qui se terminent (30 min après + 2 min fenêtre)
    const meetingsEnding = await prisma.staffMeeting.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledAt: {
          gte: new Date(now.getTime() - 32 * 60 * 1000), // 32 minutes avant (30min + 2min)
          lte: new Date(now.getTime() - 30 * 60 * 1000 + notificationWindow), // 30min + 2min après
        },
      },
      include: {
        presences: {
          include: {
            staffMember: true
          }
        },
        guild: { select: { id: true, name: true } }
      }
    });

    for (const meeting of meetingsEnding) {
      // Vérifier si la notification de fin a déjà été envoyée (30min après le début)
      const endNotificationTime = new Date(meeting.scheduledAt.getTime() + 30 * 60 * 1000);
      const hasEndNotification = meeting.notificationEndSentAt 
        && meeting.notificationEndSentAt.getTime() > endNotificationTime.getTime() - 5 * 60 * 1000;
      
      if (!hasEndNotification && meeting.status === 'SCHEDULED') {
        // Envoyer les notifications de fin
        const participants = meeting.presences.map(p => p.staffMember);
        const notificationTasks = participants.map((member) =>
          createNotification(
            meeting.guildId,
            member.userId,
            '📅 Réunion terminée',
            `La réunion ${meeting.title} est terminée.`,
            'INFO',
            `/meetings?id=${meeting.id}`,
            true
          )
        );
        
        await Promise.all(notificationTasks);
        
        // Mettre à jour la notification end date et marquer comme complétée
        await prisma.staffMeeting.update({
          where: { id: meeting.id },
          data: {
            notificationEndSentAt: now,
            status: 'COMPLETED'
          }
        });
      }
    }
  } catch (error) {
    logger.error('Meeting Notifications', 'Erreur lors du traitement des notifications de réunion:', error);
  }
};

/**
 * Enregistre une session vocale pour un membre du staff
 */
export const logStaffVoiceSession = async (
  guildId: string,
  userId: string,
  channelId: string,
  channelName: string | null,
  joinedAt: Date,
  leftAt?: Date
) => {
  try {
    // Vérifier si c'est bien un membre du staff
    const staff = await prisma.staffMember.findUnique({
      where: { guildId_userId: { guildId, userId } }
    });

    if (!staff) return;

    const durationSeconds = leftAt 
      ? Math.floor((leftAt.getTime() - joinedAt.getTime()) / 1000) 
      : null;

    if (leftAt) {
      // Session terminée : on essaie de mettre à jour la session en cours ou d'en créer une nouvelle
      const lastSession = await prisma.staffVoiceSession.findFirst({
        where: {
          guildId,
          staffUserId: staff.id,
          channelId,
          leftAt: null
        },
        orderBy: { joinedAt: 'desc' }
      });

      if (lastSession) {
        return prisma.staffVoiceSession.update({
          where: { id: lastSession.id },
          data: {
            leftAt,
            durationSeconds
          }
        });
      }
    }

    // Création d'une nouvelle session (ouverte ou fermée)
    return prisma.staffVoiceSession.create({
      data: {
        guildId,
        staffUserId: staff.id,
        channelId,
        channelName,
        joinedAt,
        leftAt,
        durationSeconds
      }
    });
  } catch (error) {
    logger.error('StaffLeadership', `Erreur lors du logging de la session vocale staff: ${error}`);
  }
};

/**
 * Récupère les données du calendrier pour le staff (absences + vocal)
 */
export const getStaffCalendarData = async (guildId: string, start: Date, end: Date, staffUserIds?: string[]) => {
  let absences: any[] = [];
  let voiceSessions: any[] = [];

  try {
    absences = await prisma.staffAbsence.findMany({
      where: {
        guildId,
        status: { in: ['APPROVED', 'ACKNOWLEDGED', 'PENDING'] },
        OR: [
          { startDate: { gte: start, lte: end } },
          { endDate: { gte: start, lte: end } },
          { isIndefinite: true, startDate: { lte: end } }
        ],
        ...(staffUserIds ? { staffUserId: { in: staffUserIds } } : {})
      },
      include: { staffMember: true }
    });
  } catch (err: any) {
    logger.error('StaffLeadership', `Error fetching absences: ${err.message}`);
    // Non-fatal, just return empty absences
  }

  try {
    voiceSessions = await prisma.staffVoiceSession.findMany({
      where: {
        guildId,
        joinedAt: { gte: start, lte: end },
        ...(staffUserIds ? { staffUserId: { in: staffUserIds } } : {})
      },
      include: { staffMember: true }
    });
  } catch (err: any) {
    logger.error('StaffLeadership', `Error fetching voice sessions: ${err.message}`);
  }

  let meetings: any[] = [];
  try {
    meetings = await prisma.staffMeeting.findMany({
      where: {
        guildId,
        scheduledAt: { gte: start, lte: end }
      },
      include: {
        presences: {
          include: {
            staffMember: true
          }
        }
      }
    });
  } catch (err: any) {
    logger.error('StaffLeadership', `Error fetching meetings: ${err.message}`);
  }

  return { absences, voiceSessions, meetings };
};
