import { Client, Events, Message } from 'discord.js';
import { getCachedGuild } from '../utils/cache.js';
import {
  handleCountingMessage,
  handleOneWordStoryMessage,
  handleGuessNumberMessage
} from '../services/features/funService.js';
import { logger } from '../utils/logger.js';

/**
 * Registers the message listener for Fun Channels.
 */
export function registerFunEventsListener(client: Client) {
  client.on(Events.MessageCreate, async (message: Message) => {
    const guildId = message.guildId;
    
    // Ignore direct messages or messages from bots
    if (!guildId || message.author.bot) return;

    try {
      const guild = await getCachedGuild(guildId);
      
      // Ensure the Fun module is active for the server
      if (!guild || !guild.funEnabled) return;

      const channelId = message.channelId;

      if (guild.funCountingChannelId && channelId === guild.funCountingChannelId) {
        await handleCountingMessage(message, guildId);
      } else if (guild.funOneWordStoryChannelId && channelId === guild.funOneWordStoryChannelId) {
        await handleOneWordStoryMessage(message, guildId);
      } else if (guild.funGuessNumberChannelId && channelId === guild.funGuessNumberChannelId) {
        await handleGuessNumberMessage(message, guildId);
      }
    } catch (error) {
      logger.error('FunEvents', `Error processing message in fun channels:`, error);
    }
  });

  logger.info('System', 'Écouteur des Salons Fun enregistré.');
}
