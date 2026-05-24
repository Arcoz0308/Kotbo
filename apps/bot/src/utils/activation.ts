import prisma from './db.js';
import { logger } from './logger.js';

export const activatedGuilds = new Set<string>();

/**
 * Loads all activated guilds from the database into the in-memory cache.
 */
export async function loadActivatedGuilds(): Promise<void> {
  try {
    const guilds = await prisma.guild.findMany({
      where: { activated: true },
      select: { id: true }
    });
    
    activatedGuilds.clear();
    for (const guild of guilds) {
      activatedGuilds.add(guild.id);
    }
    
    logger.success('Activation', `Chargement réussi : ${activatedGuilds.size} serveur(s) activé(s) mis en cache.`);
  } catch (error) {
    logger.error('Activation', 'Erreur lors du chargement des serveurs activés :', error);
    throw error;
  }
}

/**
 * Checks if a guild is activated in-memory.
 */
export function isGuildActivated(guildId: string): boolean {
  return activatedGuilds.has(guildId);
}

/**
 * Activates a guild in the database and updates the cache.
 */
export async function activateGuild(guildId: string, code: string): Promise<void> {
  const normalizedCode = code.trim().toUpperCase();

  // 1. Mark the code as used
  await prisma.activationCode.update({
    where: { code: normalizedCode },
    data: {
      usedAt: new Date(),
      usedByGuildId: guildId,
      isActive: false
    }
  });

  // 2. Activate the guild
  await prisma.guild.upsert({
    where: { id: guildId },
    update: {
      activated: true,
      activatedAt: new Date(),
      activationCode: normalizedCode
    },
    create: {
      id: guildId,
      activated: true,
      activatedAt: new Date(),
      activationCode: normalizedCode
    }
  });

  // 3. Update cache
  activatedGuilds.add(guildId);
  logger.success('Activation', `Le serveur ${guildId} a été activé avec le code ${normalizedCode}.`);
}

/**
 * Deactivates a guild.
 */
export async function deactivateGuild(guildId: string): Promise<void> {
  // Find code associated with the guild
  const dbGuild = await prisma.guild.findUnique({
    where: { id: guildId },
    select: { activationCode: true }
  });

  if (dbGuild?.activationCode) {
    // Reactivate the code so it is no longer marked used
    await prisma.activationCode.update({
      where: { code: dbGuild.activationCode },
      data: {
        usedAt: null,
        usedByGuildId: null,
        isActive: true
      }
    }).catch(() => null);
  }

  // Deactivate the guild
  await prisma.guild.update({
    where: { id: guildId },
    data: {
      activated: false,
      activatedAt: null,
      activationCode: null
    }
  });

  // Update cache
  activatedGuilds.delete(guildId);
  logger.success('Activation', `Le serveur ${guildId} a été désactivé.`);
}
