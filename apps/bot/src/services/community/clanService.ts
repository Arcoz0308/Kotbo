import { Client } from 'discord.js';
import prisma from '../../utils/db.js';
import { logger } from '../../utils/logger.js';
import { pushAudit } from '../../api/shared.js';

export const clanTasks = new Map<string, { type: 'distribute' | 'clear'; processed: number; total: number }>();

export async function runDistribution(guildId: string, client: Client, initiatorName: string): Promise<string> {
  if (clanTasks.has(guildId)) {
    throw new Error('Une opération de masse est déjà en cours sur ce serveur.');
  }

  const clans = await prisma.clan.findMany({ where: { guildId } });
  if (clans.length === 0) {
    throw new Error('Veuillez configurer au moins un clan avant de lancer la distribution.');
  }

  const discordGuild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  if (!discordGuild) {
    throw new Error('Serveur introuvable sur Discord.');
  }

  // Récupérer tous les membres
  const allMembers = await discordGuild.members.fetch().catch(() => null);
  if (!allMembers) {
    throw new Error('Impossible de récupérer la liste des membres Discord.');
  }

  const clanRoleIds = clans.map((c) => c.roleId);
  
  // Filtrer les humains qui n'ont pas encore de rôle de clan
  const membersWithoutClan = allMembers.filter((member) => {
    if (member.user.bot) return false;
    return !member.roles.cache.some((r) => clanRoleIds.includes(r.id));
  });

  if (membersWithoutClan.size === 0) {
    return 'Tous les membres ont déjà un clan.';
  }

  const targetList = [...membersWithoutClan.values()];
  
  // Démarrer la tâche asynchrone bridée
  clanTasks.set(guildId, { type: 'distribute', processed: 0, total: targetList.length });

  // Lancement asynchrone non-bloquant
  (async () => {
    logger.info('ClanService', `Lancement de la distribution aléatoire pour ${targetList.length} membres dans "${discordGuild.name}" par ${initiatorName}`);
    
    for (let i = 0; i < targetList.length; i++) {
      const currentTask = clanTasks.get(guildId);
      if (!currentTask || currentTask.type !== 'distribute') break;

      const member = targetList[i];
      const randomClan = clans[Math.floor(Math.random() * clans.length)];

      try {
        await member.roles.add(randomClan.roleId, 'Distribution globale et aléatoire des clans');
      } catch (e) {
        logger.warn('ClanService', `Impossible d'attribuer le clan à ${member.user.tag}:`, e);
      }

      clanTasks.set(guildId, {
        type: 'distribute',
        processed: i + 1,
        total: targetList.length,
      });

      await new Promise((resolve) => setTimeout(resolve, 450));
    }

    logger.info('ClanService', `Distribution aléatoire terminée pour "${discordGuild.name}"`);
    clanTasks.delete(guildId);
  })().catch((e) => logger.error('ClanService', 'Erreur critique dans le thread de distribution:', e));

  await pushAudit(guildId, {
    user: initiatorName,
    action: 'Lancement distribution de clans',
    context: discordGuild.name,
    module: 'Clans',
    eventType: 'Manuel',
    details: `Distribution aléatoire lancée pour ${targetList.length} membres.`,
    channelId: null,
  }).catch(() => null);

  return `La distribution aléatoire des clans à ${targetList.length} membres a commencé en arrière-plan. Cette opération s'effectue progressivement pour respecter les limites de requêtes de Discord et peut prendre plusieurs minutes. Vous pouvez suivre l'avancement sur le Dashboard.`;
}

export async function runClear(guildId: string, client: Client, initiatorName: string): Promise<string> {
  if (clanTasks.has(guildId)) {
    throw new Error('Une opération de masse est déjà en cours sur ce serveur.');
  }

  const clans = await prisma.clan.findMany({ where: { guildId } });
  if (clans.length === 0) {
    throw new Error('Aucun clan n\'est configuré sur ce serveur.');
  }

  const discordGuild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  if (!discordGuild) {
    throw new Error('Serveur introuvable sur Discord.');
  }

  const clanRoleIds = clans.map((c) => c.roleId);

  // Récupérer les membres
  const allMembers = await discordGuild.members.fetch().catch(() => null);
  if (!allMembers) {
    throw new Error('Impossible de récupérer la liste des membres.');
  }

  // Filtrer les membres qui ont au moins un rôle de clan
  const membersWithClan = allMembers.filter((member) => {
    return member.roles.cache.some((r) => clanRoleIds.includes(r.id));
  });

  if (membersWithClan.size === 0) {
    return 'Aucun membre ne possède de rôle de clan.';
  }

  const targetList = [...membersWithClan.values()];

  // Démarrer la tâche
  clanTasks.set(guildId, { type: 'clear', processed: 0, total: targetList.length });

  // Lancement asynchrone
  (async () => {
    logger.info('ClanService', `Lancement du retrait de tous les clans pour ${targetList.length} membres dans "${discordGuild.name}" par ${initiatorName}`);

    for (let i = 0; i < targetList.length; i++) {
      const currentTask = clanTasks.get(guildId);
      if (!currentTask || currentTask.type !== 'clear') break;

      const member = targetList[i];
      const rolesToRemove = member.roles.cache.filter((r) => clanRoleIds.includes(r.id)).map((r) => r.id);

      try {
        await member.roles.remove(rolesToRemove, 'Retrait global de tous les rôles de clan');
      } catch (e) {
        logger.warn('ClanService', `Impossible de retirer les clans de ${member.user.tag}:`, e);
      }

      clanTasks.set(guildId, {
        type: 'clear',
        processed: i + 1,
        total: targetList.length,
      });

      await new Promise((resolve) => setTimeout(resolve, 450));
    }

    logger.info('ClanService', `Retrait de tous les clans terminé pour "${discordGuild.name}"`);
    clanTasks.delete(guildId);
  })().catch((e) => logger.error('ClanService', 'Erreur critique dans le thread de retrait:', e));

  await pushAudit(guildId, {
    user: initiatorName,
    action: 'Lancement retrait de clans',
    context: discordGuild.name,
    module: 'Clans',
    eventType: 'Manuel',
    details: `Retrait des clans lancé pour ${targetList.length} membres.`,
    channelId: null,
  }).catch(() => null);

  return `Le retrait de tous les clans pour ${targetList.length} membres a commencé en arrière-plan. Cette opération s'effectue progressivement pour respecter les limites de requêtes de Discord et peut prendre plusieurs minutes. Vous pouvez suivre l'avancement sur le Dashboard.`;
}
