import { Message, EmbedBuilder, Client, TextChannel } from 'discord.js';
import prisma from '../../utils/db.js';
import { logger } from '../../utils/logger.js';

interface AutoResponse {
  id: string;
  guildId: string;
  triggerType: string;
  trigger: string;
  response: string | null;
  matchType: string;
  enabled: boolean;
  roleIdToAdd: string | null;
  roleIdToRemove: string | null;
  deleteTrigger: boolean;
  allowedRoleIds: string[];
  bannedRoleIds: string[];
  allowedChannelIds: string[];
  bannedChannelIds: string[];
  formId: string | null;
  formQuestionLabel: string | null;
  ticketTypeId: string | null;
  ticketQuestionLabel: string | null;
  closeTicket: boolean;
  rejectForm: boolean;
}

// Cache for triggers: key is guildId, value is list of auto responses
const responsesCache = new Map<string, AutoResponse[]>();

/**
 * Invalide le cache des auto-réponses pour une guilde donnée
 */
export function invalidateAutoResponseCache(guildId: string) {
  responsesCache.delete(guildId);
}

/**
 * Charge ou récupère depuis le cache les auto-réponses d'une guilde
 */
export async function getAutoResponsesForGuild(guildId: string): Promise<AutoResponse[]> {
  let list = responsesCache.get(guildId);
  if (!list) {
    const dbList = await prisma.autoResponse.findMany({
      where: { guildId, enabled: true },
    });
    list = dbList as unknown as AutoResponse[];
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
      // Ignorer les triggers qui ne sont pas de type MESSAGE
      if (item.triggerType && item.triggerType !== 'MESSAGE') continue;

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
        if (item.bannedRoleIds?.length && member?.roles.cache.some((r) => item.bannedRoleIds.includes(r.id))) continue;
        if (item.allowedRoleIds?.length && !member?.roles.cache.some((r) => item.allowedRoleIds.includes(r.id))) continue;

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
          let sendPayload: string | { embeds: EmbedBuilder[] } = responseText;

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

          if (item.deleteTrigger && message.channel instanceof TextChannel) {
            await message.channel.send(sendPayload).catch(() => null);
          } else {
            await message.reply(sendPayload).catch(() => null);
          }
        }

        // 4. Fermeture du ticket si requis
        if (item.closeTicket) {
          const ticket = await prisma.ticket.findFirst({
            where: {
              guildId: message.guildId,
              status: 'OPEN',
              OR: [
                { channelId: message.channelId },
                { threadId: message.channelId }
              ]
            }
          });
          if (ticket) {
            const { closeTicket: performClose } = await import('./ticketService.js');
            await performClose(message.client, ticket.id, message.author.id, message.author.username).catch(err => {
              logger.error('AutoResponseService', `Erreur lors de la fermeture automatique du ticket ${ticket.id} via message:`, err);
            });
          }
        }

        return;
      }
    }
  } catch (err) {
    logger.error('AutoResponseService', `Erreur lors de l'analyse du message pour auto-réponse:`, err);
  }
}

/**
 * Exécute les déclencheurs de formulaires
 */
export async function handleFormTrigger(
  guildId: string,
  userId: string,
  formId: string,
  answers: Record<string, string>,
  client: Client
) {
  try {
    const responses = await getAutoResponsesForGuild(guildId);
    const triggers = responses.filter(
      (item) => item.enabled && item.triggerType === 'FORM' && item.formId === formId
    );

    if (triggers.length === 0) return;

    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;

    const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);

    for (const item of triggers) {
      if (!item.formQuestionLabel) continue;

      // Recherche de la réponse de la question par libellé (insensible à la casse)
      const questionKeys = Object.keys(answers);
      const matchedKey = questionKeys.find(
        (k) => k.toLowerCase() === item.formQuestionLabel!.toLowerCase() || answers[k] === item.formQuestionLabel
      );

      if (!matchedKey) continue;
      const answerValue = answers[matchedKey];
      if (!answerValue) continue;

      let isMatch = false;
      const triggerLower = item.trigger.toLowerCase();
      const answerLower = answerValue.toLowerCase();

      if (item.matchType === 'EXACT') {
        isMatch = answerLower === triggerLower;
      } else if (item.matchType === 'CONTAINS') {
        isMatch = answerLower.includes(triggerLower);
      } else if (item.matchType === 'REGEX') {
        try {
          const regex = new RegExp(item.trigger, 'i');
          isMatch = regex.test(answerValue);
        } catch (e) {
          logger.warn('AutoResponseService', `Regex invalide pour l'auto-réponse formulaire ${item.id}:`, e);
        }
      }

      if (isMatch) {
        // Exécuter les actions
        if (member) {
          if (item.roleIdToAdd) {
            await member.roles.add(item.roleIdToAdd).catch((e) => {
              logger.error('AutoResponseService', `Impossible d'ajouter le rôle ${item.roleIdToAdd} au membre ${member.id} via formulaire:`, e);
            });
          }
          if (item.roleIdToRemove) {
            await member.roles.remove(item.roleIdToRemove).catch((e) => {
              logger.error('AutoResponseService', `Impossible de retirer le rôle ${item.roleIdToRemove} du membre ${member.id} via formulaire:`, e);
            });
          }
        }

        // Nouvelle action : Rejeter le formulaire / la candidature
        if (item.rejectForm) {
          const candidature = await prisma.recruitmentCandidature.findFirst({
            where: {
              guildId,
              discordId: userId,
              status: 'PENDING',
              OR: [
                { formId: formId },
                { customFormId: formId }
              ]
            },
            orderBy: { createdAt: 'desc' }
          });

          if (candidature) {
            const { rejectCandidature: performReject } = await import('../staff/recruitmentService.js');
            await performReject(
              client,
              guildId,
              candidature.id,
              item.response || 'Rejet automatique via déclencheur',
              client.user?.id || 'system'
            ).catch(err => {
              logger.error('AutoResponseService', `Erreur lors du rejet de la candidature ${candidature.id}:`, err);
            });
          }
        } else if (item.response && item.response.trim()) {
          // Envoyer la réponse par DM à l'utilisateur
          try {
            const discordUser = await client.users.fetch(userId);
            if (discordUser) {
              const isJson = item.response.startsWith('{') && item.response.endsWith('}');
              let sendPayload: string | { embeds: EmbedBuilder[] } = item.response;

              if (isJson) {
                try {
                  const embedData = JSON.parse(item.response);
                  const embed = new EmbedBuilder(embedData);
                  sendPayload = { embeds: [embed] };
                } catch {
                  sendPayload = item.response;
                }
              }
              await discordUser.send(sendPayload).catch(() => null);
            }
          } catch (e) {
            logger.error('AutoResponseService', `Impossible d'envoyer la réponse DM pour trigger de formulaire:`, e);
          }
        }
      }
    }
  } catch (err) {
    logger.error('AutoResponseService', 'Erreur lors du traitement des déclencheurs de formulaires:', err);
  }
}

/**
 * Exécute les déclencheurs de tickets
 */
export async function handleTicketTrigger(
  guildId: string,
  userId: string,
  ticketTypeId: string | null,
  reason: string,
  description: string,
  client: Client,
  ticketId?: string
) {
  try {
    const responses = await getAutoResponsesForGuild(guildId);
    const triggers = responses.filter(
      (item) => item.enabled && item.triggerType === 'TICKET'
    );

    if (triggers.length === 0) return;

    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;

    const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);

    for (const item of triggers) {
      // Filtrer par type de ticket si configuré
      if (item.ticketTypeId && item.ticketTypeId !== ticketTypeId) continue;

      // Choisir le champ à vérifier (raison par défaut, ou description)
      const fieldToCheck = item.ticketQuestionLabel === 'description' ? description : reason;
      if (!fieldToCheck) continue;

      let isMatch = false;
      const triggerLower = item.trigger.toLowerCase();
      const valueLower = fieldToCheck.toLowerCase();

      if (item.matchType === 'EXACT') {
        isMatch = valueLower === triggerLower;
      } else if (item.matchType === 'CONTAINS') {
        isMatch = valueLower.includes(triggerLower);
      } else if (item.matchType === 'REGEX') {
        try {
          const regex = new RegExp(item.trigger, 'i');
          isMatch = regex.test(fieldToCheck);
        } catch (e) {
          logger.warn('AutoResponseService', `Regex invalide pour l'auto-réponse ticket ${item.id}:`, e);
        }
      }

      if (isMatch) {
        // Exécuter les actions
        if (member) {
          if (item.roleIdToAdd) {
            await member.roles.add(item.roleIdToAdd).catch((e) => {
              logger.error('AutoResponseService', `Impossible d'ajouter le rôle ${item.roleIdToAdd} au membre ${member.id} via ticket:`, e);
            });
          }
          if (item.roleIdToRemove) {
            await member.roles.remove(item.roleIdToRemove).catch((e) => {
              logger.error('AutoResponseService', `Impossible de retirer le rôle ${item.roleIdToRemove} du membre ${member.id} via ticket:`, e);
            });
          }
        }

        // Envoyer la réponse par DM à l'utilisateur
        if (item.response && item.response.trim()) {
          try {
            const discordUser = await client.users.fetch(userId);
            if (discordUser) {
              const isJson = item.response.startsWith('{') && item.response.endsWith('}');
              let sendPayload: string | { embeds: EmbedBuilder[] } = item.response;

              if (isJson) {
                try {
                  const embedData = JSON.parse(item.response);
                  const embed = new EmbedBuilder(embedData);
                  sendPayload = { embeds: [embed] };
                } catch {
                  sendPayload = item.response;
                }
              }
              await discordUser.send(sendPayload).catch(() => null);
            }
          } catch (e) {
            logger.error('AutoResponseService', `Impossible d'envoyer la réponse DM pour trigger de ticket:`, e);
          }
        }

        // Nouvelle action : Fermer le ticket
        if (item.closeTicket && ticketId) {
          const { closeTicket: performClose } = await import('./ticketService.js');
          await performClose(client, ticketId, client.user?.id || 'system', client.user?.username || 'System').catch(err => {
            logger.error('AutoResponseService', `Erreur lors de la fermeture automatique du ticket ${ticketId}:`, err);
          });
        }
      }
    }
  } catch (err) {
    logger.error('AutoResponseService', 'Erreur lors du traitement des déclencheurs de tickets:', err);
  }
}
