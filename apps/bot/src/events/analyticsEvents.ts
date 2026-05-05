import { Events, type Client, type VoiceState, type Message, type GuildMember } from 'discord.js';
import { trackMessage, trackVoiceSession, trackMemberJoin, trackMemberLeave, trackReaction, trackThreadCreation, trackReply } from '../services/analyticsService.js';
import { logger } from '../utils/logger.js';

// In-memory store for voice sessions
// Key: `${guildId}-${userId}`, Value: timestamp (ms)
const voiceSessions = new Map<string, number>();

export function registerAnalyticsListeners(client: Client): void {
  // 1. Messages
  client.on(Events.MessageCreate, async (message: Message) => {
    if (!message.inGuild() || message.author.bot) return;

    try {
      await trackMessage(message.guildId, message.channelId, message.author.id);
    } catch (error) {
      logger.error('Analytics', `Erreur lors du tracking de message pour ${message.author.id}:`, error);
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
      voiceSessions.set(sessionKey, Date.now());
    } else if (leftVoice) {
      const joinTime = voiceSessions.get(sessionKey);
      if (joinTime) {
        const durationMs = Date.now() - joinTime;
        const durationMinutes = Math.floor(durationMs / 60000); // Convert to minutes

        try {
          if (durationMinutes > 0) {
            await trackVoiceSession(guildId, userId, durationMinutes);
          }
        } catch (error) {
          logger.error('Analytics', `Erreur lors du tracking vocal pour ${userId}:`, error);
        }

        voiceSessions.delete(sessionKey);
      }
    }
    // Note: If movedVoice, we keep the original join time running.
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
      }
    } catch (error) {
      logger.error('Analytics', `Erreur lors du tracking de thread:`, error);
    }
  });

  // 7. Message Reply
  client.on(Events.MessageCreate, async (message: Message) => {
    if (!message.inGuild() || message.author.bot) return;

    try {
      // Check if this message is a reply
      if (message.reference) {
        await trackReply(message.guildId, message.author.id);
      }
    } catch (error) {
      logger.error('Analytics', `Erreur lors du tracking de reply:`, error);
    }
  });
}
