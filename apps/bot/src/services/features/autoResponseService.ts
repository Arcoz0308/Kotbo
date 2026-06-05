import { Client, Message, EmbedBuilder } from 'discord.js';
import prisma from '../../utils/db.js';
import { logger } from '../../utils/logger.js';

// Cache for triggers: key is guildId, value is list of auto responses
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
        // ── Filtres salon ──────────────────────────────────────────────
        const channelId = message.channelId;
        if (item.bannedChannelIds?.length && item.bannedChannelIds.includes(channelId)) continue;
        if (item.allowedChannelIds?.length && !item.allowedChannelIds.includes(channelId)) continue;

        // ── Filtres rôle ───────────────────────────────────────────────
        const member = message.member || await message.guild?.members.fetch(message.author.id).catch(() => null);
        if (item.bannedRoleIds?.length && member?.roles.cache.some((r: any) => item.bannedRoleIds.includes(r.id))) continue;
        if (item.allowedRoleIds?.length && !member?.roles.cache.some((r: any) => item.allowedRoleIds.includes(r.id))) continue;

        // 1. Actions sur les rôles
        if (member) {
          if (item.roleIdToAdd) {
            await member.roles.add(item.roleIdToAdd).catch((e) => {
              logger.error('AutoResponseService', `Impossible d'ajouter le rôle ${item.roleIdToAdd} au membre ${member.id}:`, e);
            });
          }
          if (item.roleIdToRemove) {
            await member.roles.remove(item.roleIdToRemove).catch((e) => {
              logger.error('AutoResponseService', `Impossible de retirer le rôle ${item.roleIdToRemove} du membre ${member.id}:`, e);
            });
          }
        }

        // 2. Suppression du message déclencheur si requis
        if (item.deleteTrigger) {
          await message.delete().catch((e) => {
            logger.error('AutoResponseService', `Impossible de supprimer le message déclencheur ${message.id}:`, e);
          });
        }

        // 3. Envoi de la réponse si elle existe
        const responseText = item.response;
        if (responseText && responseText.trim()) {
          const isJson = responseText.startsWith('{') && responseText.endsWith('}');
          let sendPayload: any = responseText;

          if (isJson) {
            try {
              const embedData = JSON.parse(responseText);
              const embed = new EmbedBuilder(embedData);
              sendPayload = { embeds: [embed] };
            } catch (e) {
              // Si parsing échoue, on envoie en brut
              sendPayload = responseText;
            }
          }

          if (item.deleteTrigger && 'send' in message.channel) {
            await (message.channel as any).send(sendPayload).catch(() => null);
          } else {
            await message.reply(sendPayload).catch(() => null);
          }
        }

        return;
      }
    }
  } catch (err) {
    logger.error('AutoResponseService', `Erreur lors de l'analyse du message pour auto-réponse:`, err);
  }
}
