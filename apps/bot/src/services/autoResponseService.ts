import { Client, Message, EmbedBuilder } from 'discord.js';
import prisma from '../utils/db.js';
import { logger } from '../utils/logger.js';

// Cache for auto-responses: key is guildId, value is list of auto responses
const responsesCache = new Map<string, any[]>();

/**
 * Invalide le cache des auto-réponses pour une guilde donnée
 */
export function invalidateAutoResponseCache(guildId: string) {
  responsesCache.delete(guildId);
}

/**
 * Charge ou récupère depuis le cache les auto-réponses d'une guilde
 */
export async function getAutoResponsesForGuild(guildId: string) {
  let list = responsesCache.get(guildId);
  if (!list) {
    list = await prisma.autoResponse.findMany({
      where: { guildId, enabled: true },
    });
    responsesCache.set(guildId, list);
  }
  return list;
}

/**
 * Analyse un message et envoie une réponse automatique si un mot-clé correspond
 */
export async function handleAutoResponse(message: Message) {
  if (!message.guildId || message.author.bot) return;

  try {
    const responses = await getAutoResponsesForGuild(message.guildId);
    if (responses.length === 0) return;

    const content = message.content.trim();
    const contentLower = content.toLowerCase();

    for (const item of responses) {
      let isMatch = false;

      if (item.matchType === 'EXACT') {
        isMatch = contentLower === item.trigger.toLowerCase();
      } else if (item.matchType === 'CONTAINS') {
        isMatch = contentLower.includes(item.trigger.toLowerCase());
      } else if (item.matchType === 'REGEX') {
        try {
          const regex = new RegExp(item.trigger, 'i');
          isMatch = regex.test(content);
        } catch (e) {
          logger.warn('AutoResponseService', `Regex invalide pour l'auto-réponse ${item.id}:`, e);
        }
      }

      if (isMatch) {
        // Déclencher la réponse
        const responseText = item.response;

        // Détection de format JSON pour l'envoi d'embeds riches
        if (responseText.startsWith('{') && responseText.endsWith('}')) {
          try {
            const embedData = JSON.parse(responseText);
            const embed = new EmbedBuilder(embedData);
            await message.reply({ embeds: [embed] }).catch(() => null);
            return;
          } catch (e) {
            // Si le parsing JSON échoue, on renvoie simplement en tant que texte brut
            await message.reply(responseText).catch(() => null);
            return;
          }
        } else {
          await message.reply(responseText).catch(() => null);
          return;
        }
      }
    }
  } catch (err) {
    logger.error('AutoResponseService', `Erreur lors de l'analyse du message pour auto-réponse:`, err);
  }
}
