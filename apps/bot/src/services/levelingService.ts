import prisma from '../utils/db.js';
import { type Client, type Message } from 'discord.js';
import { logger } from '../utils/logger.js';

// Cooldown map to prevent XP spam
// Key format: "guildId:userId"
// Value: timestamp of last XP award
const xpCooldowns = new Map<string, number>();

// Periodically clean up entries older than 2 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of xpCooldowns.entries()) {
    if (now - timestamp > 120_000) {
      xpCooldowns.delete(key);
    }
  }
}, 300_000); // every 5 minutes

/**
 * Returns the XP required to level up from the given level.
 * Formula: 5 * (level * level) + 50 * level + 100
 */
export function getXpForLevel(level: number): number {
  return 5 * (level * level) + 50 * level + 100;
}

/**
 * Determines the level corresponding to a cumulative XP count.
 */
export function getLevelForCumulativeXp(cumulativeXp: number): number {
  let lvl = 1;
  let xpRequired = getXpForLevel(lvl);
  let tempXp = cumulativeXp;
  while (tempXp >= xpRequired) {
    tempXp -= xpRequired;
    lvl++;
    xpRequired = getXpForLevel(lvl);
  }
  return lvl;
}

/**
 * Returns detailed progress information for a cumulative XP count.
 */
export function getLevelProgress(cumulativeXp: number): {
  level: number;
  currentLevelXp: number;
  nextLevelXpNeeded: number;
} {
  let lvl = 1;
  let xpRequired = getXpForLevel(lvl);
  let tempXp = cumulativeXp;
  while (tempXp >= xpRequired) {
    tempXp -= xpRequired;
    lvl++;
    xpRequired = getXpForLevel(lvl);
  }
  return {
    level: lvl,
    currentLevelXp: tempXp,
    nextLevelXpNeeded: xpRequired,
  };
}

/**
 * Safely adds XP to a member profile, updates the database,
 * and alerts the channel on level up.
 */
export async function addXp(
  guildId: string,
  userId: string,
  amount: number,
  channelId?: string,
  client?: Client
): Promise<{ leveledUp: boolean; newLevel: number; oldLevel: number } | null> {
  try {
    // 1. Fetch guild config to see if leveling is enabled
    const guildConfig = await prisma.guild.findUnique({
      where: { id: guildId },
      select: { levelingEnabled: true },
    });

    if (guildConfig && !guildConfig.levelingEnabled) {
      return null;
    }

    // 2. Fetch or create member profile
    const profile = await prisma.memberProfile.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });

    const oldXp = profile?.xp ?? 0;
    const newXp = oldXp + amount;
    const oldLevel = profile?.level ?? 1;
    const newLevel = getLevelForCumulativeXp(newXp);
    const leveledUp = newLevel > oldLevel;

    // 3. Update database
    await prisma.memberProfile.upsert({
      where: { guildId_userId: { guildId, userId } },
      create: {
        guildId,
        userId,
        xp: newXp,
        level: newLevel,
      },
      update: {
        xp: newXp,
        level: newLevel,
      },
    });

    // 4. Send level up announcement if leveled up and channel is provided
    if (leveledUp && channelId && client) {
      const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
      if (guild) {
        const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
        if (channel && channel.isTextBased()) {
          await channel.send({
            content: `🎉 Félicitations <@${userId}>, tu viens de passer au niveau **${newLevel}** ! 🚀`,
          }).catch((err) => {
            logger.warn('Leveling', `Impossible d'envoyer le message de level up dans le salon ${channelId}:`, err);
          });
        }
      }
    }

    return { leveledUp, newLevel, oldLevel };
  } catch (error) {
    logger.error('Leveling', `Erreur lors de l'ajout d'XP pour ${guildId}:${userId}: ${String(error)}`);
    return null;
  }
}

/**
 * Handles incoming messages to award XP if cooldown allows.
 */
export async function handleMessageXp(message: Message, client: Client): Promise<void> {
  if (!message.guildId || message.author.bot || message.system) return;

  const key = `${message.guildId}:${message.author.id}`;
  const now = Date.now();
  const lastXp = xpCooldowns.get(key) ?? 0;

  // 60 seconds cooldown
  if (now - lastXp < 60_000) {
    return;
  }

  xpCooldowns.set(key, now);

  // Random XP between 15 and 25
  const xpAwarded = Math.floor(Math.random() * 11) + 15;

  await addXp(message.guildId, message.author.id, xpAwarded, message.channelId, client);
}
