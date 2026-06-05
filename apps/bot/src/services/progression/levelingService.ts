import { Client, GuildMember, AttachmentBuilder } from 'discord.js';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import prisma from '../../utils/db.js';
import { logger } from '../../utils/logger.js';
import { cache } from '../../utils/cache.js';

// Cooldown map: key is "guildId:userId", value is timestamp when cooldown expires
const xpCooldowns = new Map<string, number>();

/**
 * Calcul l'XP nécessaire pour atteindre un niveau donné.
 * Formule standard : 100 * (level^2) + 200 * level
 */
export function getXpForLevel(level: number): number {
  if (level < 0) return 0;
  return 100 * Math.pow(level, 2) + 200 * level;
}

export async function getOrCreateLevelConfig(guildId: string) {
  const cacheKey = `guild:${guildId}:level_config`;
  let config = await cache.get<any>(cacheKey);

  if (config) return config;

  config = await prisma.levelConfig.findUnique({
    where: { guildId },
  });

  if (!config) {
    config = await prisma.levelConfig.create({
      data: {
        guildId,
        enabled: false,
        xpMin: 15,
        xpMax: 25,
        cooldownSeconds: 60,
        vocalXpPerMin: 5,
        levelUpMessage: "Félicitations {user} ! Tu passes au niveau **{level}** ! 🎉",
        stackRewards: false,
        ignoredChannels: [],
        ignoredRoles: [],
        xpMultipliers: {},
      },
    });
  }

  await cache.set(cacheKey, config, 60);
  return config;
}

/**
 * Ajoute de l'XP à un utilisateur (Textuel)
 */
export async function handleTextXp(guildId: string, userId: string, client: Client, channelId: string) {
  try {
    const config = await getOrCreateLevelConfig(guildId);
    if (!config.enabled) return;

    // Vérifier si le salon est exclu
    if (config.ignoredChannels && config.ignoredChannels.includes(channelId)) {
      return;
    }

    // Récupérer le membre Discord pour valider ses rôles
    const discordGuild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!discordGuild) return;
    const member = await discordGuild.members.fetch(userId).catch(() => null);
    if (!member) return;

    // Vérifier si le membre possède un rôle exclu
    if (config.ignoredRoles && (config.ignoredRoles as string[]).some(roleId => member.roles.cache.has(roleId))) {
      return;
    }

    const cooldownKey = `${guildId}:${userId}`;
    const now = Date.now();
    const cooldownEnd = xpCooldowns.get(cooldownKey) || 0;

    if (now < cooldownEnd) {
      return; // Toujours sous cooldown
    }

    // Définir le nouveau cooldown
    xpCooldowns.set(cooldownKey, now + (config.cooldownSeconds * 1000));

    // Calculer le multiplicateur d'XP par rôle
    let multiplier = 1.0;
    if (config.xpMultipliers && typeof config.xpMultipliers === 'object') {
      const multipliers = config.xpMultipliers as Record<string, number>;
      for (const [roleId, multValue] of Object.entries(multipliers)) {
        if (member.roles.cache.has(roleId)) {
          if (multValue > multiplier) {
            multiplier = multValue;
          }
        }
      }
    }

    // Assigner l'XP en appliquant le multiplicateur
    const baseGain = Math.floor(Math.random() * (config.xpMax - config.xpMin + 1)) + config.xpMin;
    const xpGain = Math.floor(baseGain * multiplier);
    
    if (xpGain > 0) {
      await addXp(guildId, userId, xpGain, client, channelId);
    }
  } catch (err) {
    logger.error('LevelingService', `Erreur lors de l'ajout d'XP texte pour ${userId} sur ${guildId}:`, err);
  }
}

/**
 * Ajoute de l'XP brute à un utilisateur et gère le passage de niveau
 */
export async function addXp(guildId: string, userId: string, amount: number, client: Client, channelId?: string) {
  const memberLevel = await prisma.memberLevel.upsert({
    where: { guildId_userId: { guildId, userId } },
    update: {
      xp: { increment: amount },
      lastXpGain: new Date(),
    },
    create: {
      guildId,
      userId,
      xp: amount,
      level: 0,
    },
  });

  let currentLevel = memberLevel.level;
  let currentXp = memberLevel.xp;

  // Calculer si passage de niveau
  let nextLevelXp = getXpForLevel(currentLevel);
  let leveledUp = false;

  while (currentXp >= nextLevelXp) {
    currentLevel++;
    nextLevelXp = getXpForLevel(currentLevel);
    leveledUp = true;
  }

  if (leveledUp) {
    // Mettre à jour en BDD
    await prisma.memberLevel.update({
      where: { guildId_userId: { guildId, userId } },
      data: { level: currentLevel },
    });

    // Envoyer la notification et attribuer les récompenses
    await processLevelUp(guildId, userId, currentLevel, client, channelId);
  }
}

/**
 * Gère les notifications de level up et l'attribution des rôles récompenses
 */
async function processLevelUp(guildId: string, userId: string, newLevel: number, client: Client, fallbackChannelId?: string) {
  try {
    const config = await getOrCreateLevelConfig(guildId);
    const discordGuild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!discordGuild) return;

    const member = await discordGuild.members.fetch(userId).catch(() => null);
    if (!member) return;

    // 1. Attribution des rôles de récompense
    const rewards = await prisma.levelRoleReward.findMany({
      where: { guildId },
      orderBy: { level: 'asc' },
    });

    if (rewards.length > 0) {
      const rolesToAdd: string[] = [];
      const rolesToRemove: string[] = [];

      for (const reward of rewards) {
        if (newLevel >= reward.level) {
          if (!member.roles.cache.has(reward.roleId)) {
            rolesToAdd.push(reward.roleId);
          }
        } else {
          // Si configuration de cumul de rôles désactivée, on pourrait enlever les rôles supérieurs.
          // Mais dans tous les cas, si le membre a perdu des niveaux, on retire.
          if (member.roles.cache.has(reward.roleId)) {
            rolesToRemove.push(reward.roleId);
          }
        }
      }

      // Optionnel: Garder uniquement la récompense la plus élevée si le cumul est désactivé
      if (!config.stackRewards) {
        const eligibleRewards = rewards.filter(r => newLevel >= r.level);
        if (eligibleRewards.length > 1) {
          const highestReward = eligibleRewards[eligibleRewards.length - 1];
          // Retirer tous les autres rôles récompenses plus bas
          for (const prevReward of eligibleRewards.slice(0, -1)) {
            if (member.roles.cache.has(prevReward.roleId) && !rolesToRemove.includes(prevReward.roleId)) {
              rolesToRemove.push(prevReward.roleId);
            }
            const addIdx = rolesToAdd.indexOf(prevReward.roleId);
            if (addIdx !== -1) rolesToAdd.splice(addIdx, 1);
          }
        }
      }

      // Appliquer les changements de rôles
      if (rolesToRemove.length > 0) {
        await member.roles.remove(rolesToRemove).catch(e => logger.warn('LevelingService', `Impossible de retirer les rôles récompenses à ${userId}:`, e));
      }
      if (rolesToAdd.length > 0) {
        await member.roles.add(rolesToAdd).catch(e => logger.warn('LevelingService', `Impossible d'ajouter les rôles récompenses à ${userId}:`, e));
      }
    }

    // 2. Envoi du message de félicitations
    const msgTemplate = config.levelUpMessage;
    const msg = msgTemplate
      .replace(/{user}/g, `<@${userId}>`)
      .replace(/{username}/g, member.user.username)
      .replace(/{level}/g, String(newLevel));

    if (config.levelUpChannelId === 'DM') {
      const dmChannel = await member.createDM().catch(() => null);
      if (dmChannel) {
        await dmChannel.send(msg).catch(() => null);
      }
    } else if (config.levelUpChannelId && config.levelUpChannelId !== 'current') {
      const targetChannel = discordGuild.channels.cache.get(config.levelUpChannelId);
      if (targetChannel?.isTextBased()) {
        await targetChannel.send(msg).catch(() => null);
      }
    } else if (fallbackChannelId) {
      const currentChannel = discordGuild.channels.cache.get(fallbackChannelId);
      if (currentChannel?.isTextBased()) {
        await currentChannel.send(msg).catch(() => null);
      }
    }
  } catch (err) {
    logger.error('LevelingService', `Erreur lors de la gestion du level up pour ${userId}:`, err);
  }
}

/**
 * Récupère le rang, l'XP et le niveau d'un membre
 */
export async function getMemberRankData(guildId: string, userId: string) {
  const levels = await prisma.memberLevel.findMany({
    where: { guildId },
    orderBy: { xp: 'desc' },
  });

  const rankIndex = levels.findIndex(l => l.userId === userId);
  const rank = rankIndex === -1 ? levels.length + 1 : rankIndex + 1;

  let memberLevel = levels.find(l => l.userId === userId);
  if (!memberLevel) {
    memberLevel = {
      id: '',
      guildId,
      userId,
      xp: 0,
      level: 0,
      lastXpGain: new Date(),
    };
  }

  const currentLevelXp = getXpForLevel(memberLevel.level - 1);
  const nextLevelXp = getXpForLevel(memberLevel.level);
  
  const xpInCurrentLevel = memberLevel.xp - currentLevelXp;
  const xpRequiredForNextLevel = nextLevelXp - currentLevelXp;

  return {
    level: memberLevel.level,
    xp: memberLevel.xp,
    xpInCurrentLevel: Math.max(0, xpInCurrentLevel),
    xpRequiredForNextLevel,
    rank,
    totalXp: memberLevel.xp,
  };
}

/**
 * Génère une carte de rang en image PNG sous forme de Buffer
 */
export async function generateRankCard(member: GuildMember, level: number, xp: number, rank: number): Promise<Buffer> {
  const W = 900, H = 250;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Arrière-plan dégradé vitreux sombre
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#10141f');
  bg.addColorStop(1, '#161b2a');
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, W, H, 20, bg);

  // Bordure lumineuse subtile
  ctx.strokeStyle = 'rgba(88, 101, 242, 0.25)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  // Halo lumineux bleu/violet
  const glow = ctx.createRadialGradient(W - 200, 125, 0, W - 200, 125, 300);
  glow.addColorStop(0, 'rgba(88, 101, 242, 0.15)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Avatar circulaire
  const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 256 });
  try {
    const avatarImg = await loadImage(avatarUrl);
    ctx.save();
    ctx.beginPath();
    ctx.arc(110, 125, 75, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatarImg, 35, 50, 150, 150);
    ctx.restore();
  } catch (e) {
    // Fallback si l'avatar ne peut pas être chargé
    ctx.fillStyle = '#5865f2';
    ctx.beginPath();
    ctx.arc(110, 125, 75, 0, Math.PI * 2);
    ctx.fill();
  }

  // Cercle de statut
  ctx.beginPath();
  ctx.arc(165, 180, 18, 0, Math.PI * 2);
  ctx.fillStyle = '#10141f';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(165, 180, 12, 0, Math.PI * 2);
  // Couleur selon la présence
  const status = member.presence?.status || 'offline';
  ctx.fillStyle = status === 'online' ? '#3ba55d' : status === 'idle' ? '#faa81a' : status === 'dnd' ? '#ed4245' : '#747f8d';
  ctx.fill();

  // Pseudo et Tag
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px sans-serif';
  ctx.fillText(member.displayName, 210, 85);

  ctx.fillStyle = '#8b949e';
  ctx.font = '20px sans-serif';
  ctx.fillText(`#${member.user.discriminator !== '0' ? member.user.discriminator : member.user.username}`, 210, 120);

  // Niveau et Rang
  ctx.textAlign = 'right';
  ctx.fillStyle = '#5865f2';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('RANG', W - 150, 70);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 44px sans-serif';
  ctx.fillText(`#${rank}`, W - 45, 70);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#57f287';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('NIVEAU', W - 320, 70);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 44px sans-serif';
  ctx.fillText(`${level}`, W - 230, 70);
  ctx.textAlign = 'left';

  // XP progression
  const prevXpNeeded = getXpForLevel(level - 1);
  const nextXpNeeded = getXpForLevel(level);
  const xpInCurrentLevel = xp - prevXpNeeded;
  const xpRequiredForNextLevel = nextXpNeeded - prevXpNeeded;
  const progressPercent = Math.min(1, Math.max(0, xpInCurrentLevel / xpRequiredForNextLevel));

  ctx.fillStyle = '#8b949e';
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${xpInCurrentLevel.toLocaleString('fr-FR')} / ${xpRequiredForNextLevel.toLocaleString('fr-FR')} XP`, W - 45, 155);
  ctx.textAlign = 'left';

  // Barre de progression
  const barX = 210, barY = 175, barW = W - 210 - 45, barH = 24, barR = 12;
  roundRect(ctx, barX, barY, barW, barH, barR, '#2f3136');
  
  if (progressPercent > 0) {
    const filledW = Math.max(barH, barW * progressPercent);
    const grad = ctx.createLinearGradient(barX, 0, barX + filledW, 0);
    grad.addColorStop(0, '#5865f2');
    grad.addColorStop(1, '#57f287');
    roundRect(ctx, barX, barY, filledW, barH, barR, grad);
  }

  return canvas.toBuffer('image/png');
}

// Helper pour dessiner des rectangles arrondis
function roundRect(ctx: any, x: number, y: number, w: number, h: number, r: number, fill: string | CanvasGradient) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}
