import { Events, type Client, type VoiceState, type Message, type GuildMember } from 'discord.js';
import { trackMessage, trackVoiceSession, trackMemberJoin, trackMemberLeave, trackReaction, trackThreadCreation, trackReply } from '../services/analytics/analyticsService.js';
import { logStaffVoiceSession } from '../services/staff/staffLeadershipService.js';
import { incrementQuestProgress } from '../services/community/questService.js';
import { logger } from '../utils/logger.js';

// In-memory store for voice sessions
// Key: `${guildId}-${userId}`, Value: { joinTime (ms), channelId }
const voiceSessions = new Map<string, { joinTime: number; channelId: string }>();

export function registerAnalyticsListeners(client: Client): void {
  // 1 & 7. Messages & Replies
  client.on(Events.MessageCreate, async (message: Message) => {
    if (!message.inGuild() || message.author.bot) return;

    try {
      await trackMessage(message.guildId, message.channelId, message.author.id);
      incrementQuestProgress(message.guildId, message.author.id, 'SEND_MESSAGES').catch(() => {});
      if (message.reference) {
        await trackReply(message.guildId, message.author.id);
        incrementQuestProgress(message.guildId, message.author.id, 'REPLY_MESSAGES').catch(() => {});
      }
    } catch (error) {
      logger.error('Analytics', `Erreur lors du tracking de message/reply pour ${message.author.id}:`, error);
    }
  });

  // 2. Voice State
  client.on(Events.VoiceStateUpdate, async (oldState: VoiceState, newState: VoiceState) => {
    if (!newState.guild || (newState.member && newState.member.user.bot)) return;

    const guildId = newState.guild.id;
    const userId = newState.id;
    const sessionKey = `${guildId}-${userId}`;

    const joinedVoice = !oldState.channelId && newState.channelId;
    const leftVoice = oldState.channelId && !newState.channelId;
    const movedVoice = oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId;

    if (joinedVoice) {
      voiceSessions.set(sessionKey, { joinTime: Date.now(), channelId: newState.channelId! });
      // Log staff session start
      await logStaffVoiceSession(guildId, userId, newState.channelId!, newState.channel?.name || null, new Date());
    } else if (leftVoice) {
      const session = voiceSessions.get(sessionKey);
      // Log staff session end
      await logStaffVoiceSession(guildId, userId, oldState.channelId!, oldState.channel?.name || null, session ? new Date(session.joinTime) : new Date(), new Date());

      if (session) {
        const durationMs = Date.now() - session.joinTime;
        const durationMinutes = Math.floor(durationMs / 60000);

        try {
          if (durationMinutes > 0) {
            await trackVoiceSession(guildId, userId, durationMinutes, oldState.channelId!);
            incrementQuestProgress(guildId, userId, 'VOICE_MINUTES', durationMinutes).catch(() => {});
          }
        } catch (error) {
          logger.error('Analytics', `Erreur lors du tracking vocal pour ${userId}:`, error);
        }

        voiceSessions.delete(sessionKey);
      }
    } else if (movedVoice) {
      const session = voiceSessions.get(sessionKey);
      const now = new Date();
      await logStaffVoiceSession(guildId, userId, oldState.channelId!, oldState.channel?.name || null, session ? new Date(session.joinTime) : now, now);
      await logStaffVoiceSession(guildId, userId, newState.channelId!, newState.channel?.name || null, now);

      if (session) {
        const durationMs = now.getTime() - session.joinTime;
        const durationMinutes = Math.floor(durationMs / 60000);
        if (durationMinutes > 0) {
          trackVoiceSession(guildId, userId, durationMinutes, oldState.channelId!).catch(() => {});
        }
      }

      voiceSessions.set(sessionKey, { joinTime: now.getTime(), channelId: newState.channelId! });
    }
  });

  // 3. Member Joins
  client.on(Events.GuildMemberAdd, async (member: GuildMember) => {
    if (member.user.bot) return;

    try {
      await trackMemberJoin(member.guild.id);
    } catch (error) {
      logger.error('Analytics', `Erreur lors du tracking de join pour ${member.id}:`, error);
    }
  });

  // 4. Member Leaves
  client.on(Events.GuildMemberRemove, async (member) => {
    if (member.user.bot) return;

    try {
      await trackMemberLeave(member.guild.id);
    } catch (error) {
      logger.error('Analytics', `Erreur lors du tracking de leave pour ${member.id}:`, error);
    }
  });

  // 5. Message Reactions
  client.on(Events.MessageReactionAdd, async (reaction) => {
    try {
      // Fetch user from reaction if needed
      const user = reaction.users.cache.last();
      if (!user || user.bot) return;

      if (reaction.message.inGuild()) {
        await trackReaction(reaction.message.guildId, user.id);
        incrementQuestProgress(reaction.message.guildId, user.id, 'REACT_MESSAGES').catch(() => {});
      }
    } catch (error) {
      logger.error('Analytics', `Erreur lors du tracking de réaction:`, error);
    }
  });

  // 6. Thread Creation
  client.on(Events.ThreadCreate, async (thread) => {
    if (!thread.guild) return;

    try {
      // Thread creator is usually available
      const creatorId = thread.ownerId;
      if (creatorId) {
        await trackThreadCreation(thread.guildId, creatorId);
        incrementQuestProgress(thread.guildId, creatorId, 'CREATE_THREADS').catch(() => {});
      }
    } catch (error) {
      logger.error('Analytics', `Erreur lors du tracking de thread:`, error);
    }
  });


}
