import { Client, Events, Message, PartialMessage } from 'discord.js';
import { handleAutoMod, handleGhostPingDelete, handleGhostPingUpdate } from '../services/autoModService.js';
import { logger } from '../utils/logger.js';

export function registerAutoModListener(client: Client) {
  client.on(Events.MessageCreate, async (message: Message) => {
    // Exécuter AutoMod en priorité absolue
    await handleAutoMod(message, client);
  });

  client.on(Events.MessageDelete, async (message: Message | PartialMessage) => {
    await handleGhostPingDelete(message, client);
  });

  client.on(Events.MessageUpdate, async (oldMessage: Message | PartialMessage, newMessage: Message | PartialMessage) => {
    await handleGhostPingUpdate(oldMessage, newMessage, client);
  });

  logger.info('System', 'Écouteur AutoMod enregistré.');
}
