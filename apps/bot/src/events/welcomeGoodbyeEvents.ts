import { Client, Events, GuildMember } from 'discord.js';
import { handleGuildMemberAdd, handleGuildMemberRemove } from '../services/welcomeGoodbyeService.js';
import { checkMemberCountTriggers } from '../services/ctfTriggerService.js';
import { logger } from '../utils/logger.js';

export function registerWelcomeGoodbyeListener(client: Client) {
  // Entrée d'un membre
  client.on(Events.GuildMemberAdd, async (member: GuildMember) => {
    await handleGuildMemberAdd(member, client);
    await checkMemberCountTriggers(member.guild, client);
  });

  // Départ d'un membre
  client.on(Events.GuildMemberRemove, async (member: any) => {
    // Si c'est un départ, discord.js envoie un GuildMember partiel ou complet
    await handleGuildMemberRemove(member, client);
  });

  logger.info('System', 'Écouteurs d\'Accueil & Départ enregistrés.');
}
