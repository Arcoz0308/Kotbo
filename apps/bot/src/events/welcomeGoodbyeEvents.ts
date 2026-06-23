import { Client, Events, GuildMember } from 'discord.js';
import {
  handleGuildMemberAdd,
  handleGuildMemberRemove,
  handleGuildBoost,
  applyJoinAutoRole,
  applyTagAutoRole,
} from '../services/features/welcomeGoodbyeService.js';
import { checkMemberCountTriggers } from '../services/core/ctfTriggerService.js';
import { logger } from '../utils/logger.js';

export function registerWelcomeGoodbyeListener(client: Client) {
  // Entrée d'un membre
  client.on(Events.GuildMemberAdd, async (member: GuildMember) => {
    await applyJoinAutoRole(member);
    await applyTagAutoRole(member);
    await handleGuildMemberAdd(member, client);
    await checkMemberCountTriggers(member.guild, client);
  });

  // Départ d'un membre
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client.on(Events.GuildMemberRemove, async (member: any) => {
    // Si c'est un départ, discord.js envoie un GuildMember partiel ou complet
    await handleGuildMemberRemove(member, client);
  });

  // Boost ou changement de profil / pseudo d'un membre
  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    if (oldMember.partial || newMember.partial) return;

    // Détection du Boost
    if (!oldMember.premiumSince && newMember.premiumSince) {
      await handleGuildBoost(newMember, client);
    }

    // Détection changement pseudo/surnom pour l'auto-rôle tag
    const oldName = oldMember.nickname ?? oldMember.user.username;
    const newName = newMember.nickname ?? newMember.user.username;
    if (oldName !== newName) {
      await applyTagAutoRole(newMember);
    }
  });

  // Changement de pseudo global sur Discord
  client.on(Events.UserUpdate, async (oldUser, newUser) => {
    if (oldUser.username === newUser.username) return;

    // Parcourir les serveurs mutuels pour actualiser l'auto-rôle tag
    const mutualGuilds = client.guilds.cache.filter((g) => g.members.cache.has(newUser.id));
    for (const guild of mutualGuilds.values()) {
      const member = await guild.members.fetch(newUser.id).catch(() => null);
      if (member) {
        await applyTagAutoRole(member);
      }
    }
  });

  logger.info('System', "Écouteurs d\'Accueil, Départ & Boost enregistrés.");
}
