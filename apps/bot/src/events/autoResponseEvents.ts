import { Client, Events, Message } from 'discord.js';
import { handleAutoResponse } from '../services/features/autoResponseService.js';
import { logger } from '../utils/logger.js';

export function registerAutoResponseListener(client: Client) {
  client.on(Events.MessageCreate, async (message: Message) => {
    try {
      await handleAutoResponse(message);
    } catch (err) {
      logger.error('AutoResponse', 'Erreur lors du traitement des auto-réponses :', err);
    }
  });

  logger.info('System', 'Écouteur Auto-Réponses enregistré.');
}
