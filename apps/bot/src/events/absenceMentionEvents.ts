import { Client, Events, EmbedBuilder, type Message } from 'discord.js';
import prisma from '../utils/db.js';
import { logger } from '../utils/logger.js';
import { COLORS_RAW } from '../utils/embeds.js';

// Anti-spam: Set de clés "guildId:absentUserId:mentionerUserId" déjà notifiées
// Nettoyé périodiquement pour éviter les fuites mémoire
const notifiedPairs = new Set<string>();
const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1h

const cleanupTimer = setInterval(() => {
  notifiedPairs.clear();
}, CLEANUP_INTERVAL);
cleanupTimer.unref();

export function clearAbsenceMentionCache(guildId: string, userId: string): void {
  for (const key of notifiedPairs) {
    if (key.startsWith(`${guildId}:${userId}:`)) {
      notifiedPairs.delete(key);
    }
  }
}

const getActiveAbsencesWithMentionNotify = async (guildId: string, userIds: string[]) => {
  if (userIds.length === 0) return [];

  const now = new Date();
  return prisma.staffAbsence.findMany({
    where: {
      guildId,
      notifyOnMention: true,
      status: { in: ['PENDING', 'ACKNOWLEDGED', 'APPROVED'] },
      endedAt: null,
      startDate: { lte: now },
      OR: [
        { endDate: { gte: now } },
        { isIndefinite: true },
      ],
      staffMember: {
        userId: { in: userIds },
      },
    },
    include: {
      staffMember: true,
    },
  });
};

export function registerAbsenceMentionListener(client: Client): void {
  client.on(Events.MessageCreate, async (message: Message) => {
    if (message.author.bot || !message.guildId) return;

    const mentionedUserIds = new Set<string>();

    // Mentions directes (@user)
    for (const user of message.mentions.users.values()) {
      if (user.id !== message.author.id) {
        mentionedUserIds.add(user.id);
      }
    }

    // Réponse à un message
    if (message.reference?.messageId) {
      try {
        const repliedMessage = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
        if (repliedMessage && !repliedMessage.author.bot && repliedMessage.author.id !== message.author.id) {
          mentionedUserIds.add(repliedMessage.author.id);
        }
      } catch {
        // Message référencé introuvable
      }
    }

    if (mentionedUserIds.size === 0) return;

    // Filtrer ceux déjà notifiés pour cet auteur
    const toCheck: string[] = [];
    for (const userId of mentionedUserIds) {
      const key = `${message.guildId}:${userId}:${message.author.id}`;
      if (!notifiedPairs.has(key)) {
        toCheck.push(userId);
      }
    }

    if (toCheck.length === 0) return;

    try {
      const absences = await getActiveAbsencesWithMentionNotify(message.guildId, toCheck);

      for (const absence of absences) {
        const key = `${message.guildId}:${absence.staffMember.userId}:${message.author.id}`;
        if (notifiedPairs.has(key)) continue;
        notifiedPairs.add(key);

        // Ne pas notifier si c'est le staff absent lui-même qui envoie un message
        if (absence.staffMember.userId === message.author.id) continue;

        const displayName = absence.staffMember.displayName || absence.staffMember.username || absence.staffMember.userTag || `<@${absence.staffMember.userId}>`;
        const endLabel = absence.isIndefinite || !absence.endDate
          ? 'Indéterminée'
          : `<t:${Math.floor(absence.endDate.getTime() / 1000)}:R>`;

        const embed = new EmbedBuilder()
          .setTitle('🔕 Membre absent')
          .setDescription(`**${displayName}** est actuellement en absence et ne pourra pas répondre immédiatement.`)
          .addFields(
            { name: 'Type', value: absence.type || 'Absence', inline: true },
            { name: 'Retour prévu', value: endLabel, inline: true },
          )
          .setColor(COLORS_RAW.warning)
          .setFooter({ text: 'Notification automatique d\'absence' })
          .setTimestamp();

        await message.channel.send({ embeds: [embed] }).catch(() => null);
      }
    } catch (err) {
      logger.debug('AbsenceMention', `Erreur lors de la vérification des absences: ${err}`);
    }
  });

  logger.success('AbsenceMention', 'Écouteur notifications de mention d\'absents enregistré.');
}
