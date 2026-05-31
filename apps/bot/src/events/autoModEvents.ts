import { Client, Events, Message } from 'discord.js';
import { handleAutoMod } from '../services/autoModService.js';
import { logger } from '../utils/logger.js';

export function registerAutoModListener(client: Client) {
  client.on(Events.MessageCreate, async (message: Message) => {
    // Exécuter AutoMod en priorité absolue
    await handleAutoMod(message, client);
  });

  logger.info('System', 'Écouteur AutoMod enregistré.');
}
