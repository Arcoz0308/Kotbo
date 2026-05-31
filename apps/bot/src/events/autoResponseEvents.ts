import { Client, Events, Message } from 'discord.js';
import { handleAutoResponse } from '../services/autoResponseService.js';
import { logger } from '../utils/logger.js';

export function registerAutoResponseListener(client: Client) {
  client.on(Events.MessageCreate, async (message: Message) => {
    await handleAutoResponse(message);
  });

  logger.info('System', 'Écouteur Auto-Réponses enregistré.');
}
