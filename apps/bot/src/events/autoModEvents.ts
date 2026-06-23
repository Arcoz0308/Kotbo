import { Client, Events, GuildMember, Message, PartialMessage } from 'discord.js';
import { handleAutoMod, handleGhostPingDelete, handleGhostPingUpdate, handleAntiBotAdd } from '../services/moderation/autoModService.js';
import { logger } from '../utils/logger.js';

export function registerAutoModListener(client: Client) {
  client.on(Events.MessageCreate, async (message: Message) => {
    await handleAutoMod(message, client);
  });

  client.on(Events.MessageDelete, async (message: Message | PartialMessage) => {
    await handleGhostPingDelete(message, client);
  });

  client.on(Events.MessageUpdate, async (oldMessage: Message | PartialMessage, newMessage: Message | PartialMessage) => {
    await handleGhostPingUpdate(oldMessage, newMessage, client);
  });

  client.on(Events.GuildMemberAdd, async (member: GuildMember) => {
    await handleAntiBotAdd(member, client);
  });

  logger.info('System', 'Écouteur AutoMod enregistré.');
}
