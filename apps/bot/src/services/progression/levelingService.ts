import { Client, GuildMember } from 'discord.js';
import { createCanvas, loadImage, GlobalFonts, type Image, type SKRSContext2D } from '@napi-rs/canvas';
import type { LevelConfig } from '@prisma/client';
import { fileURLToPath } from 'node:url';
import {
  getRankCardBackground,
  getRankCardFont,
  rankCardEmojiCodePoint,
  rankCardFontStack,
  RANK_CARD_FONTS,
  RANK_CARD_HEIGHT,
  RANK_CARD_WIDTH,
  DEFAULT_LEVEL_CURVE,
  grantedWithinDailyCap,
  levelFromXp,
  normalizeLevelCurve,
  xpForLevel,
  type LevelCurve,
  type RankCardCustomization,
} from '@kotbo/shared';
import { ensureCanvasFonts } from '../../utils/canvasFonts.js';
import { getRankCardCustomization } from './rankCardService.js';
import prisma from '../../utils/db.js';
import { logger } from '../../utils/logger.js';
import { cache, getCachedGuild } from '../../utils/cache.js';

// Cooldown map: key is "guildId:userId", value is timestamp when cooldown expires
const xpCooldowns = new Map<string, number>();
const MAX_XP_COOLDOWNS = 100_000;
let xpCooldownChecks = 0;

function maintainXpCooldowns(now: number): void {
  xpCooldownChecks++;
  if (xpCooldownChecks % 2_048 !== 0 && xpCooldowns.size < MAX_XP_COOLDOWNS) return;

  for (const [key, cooldownEnd] of xpCooldowns) {
    if (cooldownEnd <= now) xpCooldowns.delete(key);
  }
  while (xpCooldowns.size >= MAX_XP_COOLDOWNS) {
    const oldest = xpCooldowns.keys().next().value as string | undefined;
    if (!oldest) break;
    xpCooldowns.delete(oldest);
  }
}

/**
 * Calcul l'XP nécessaire pour atteindre un niveau donné.
 *
 * La courbe est propre à chaque guilde : tout appel qui connaît la guilde doit
 * lui passer sa courbe (`getGuildLevelCurve`). Sans courbe, on retombe sur la
 * formule historique, qui reste le défaut de `LevelConfig`.
 */
export function getXpForLevel(level: number, curve: LevelCurve = DEFAULT_LEVEL_CURVE): number {
  return xpForLevel(level, curve);
}

/**
 * Dérive le niveau à partir de l'XP totale.
 * L'XP est la source de vérité : le niveau en est toujours déduit, ce qui
 * permet d'auto-réparer les lignes incohérentes (ex. données importées d'un
 * autre bot avec une courbe différente).
 */
export function getLevelFromXp(xp: number, curve: LevelCurve = DEFAULT_LEVEL_CURVE): number {
  return levelFromXp(xp, curve);
}

export function levelCurveFromConfig(config: Pick<LevelConfig, 'curveBaseXp' | 'curveLinearXp' | 'curveExponent' | 'maxLevel'>): LevelCurve {
  return normalizeLevelCurve({
    baseXp: config.curveBaseXp,
    linearXp: config.curveLinearXp,
    exponent: config.curveExponent,
    maxLevel: config.maxLevel,
  });
}

/**
 * Courbe d'une guilde, tolérante à l'échec : un module qui n'arrive pas à lire
 * la config doit afficher un niveau plausible plutôt que planter.
 */
export async function getGuildLevelCurve(guildId: string): Promise<LevelCurve> {
  const config = await getOrCreateLevelConfig(guildId).catch(() => null);
  return config ? levelCurveFromConfig(config) : DEFAULT_LEVEL_CURVE;
}

export async function getOrCreateLevelConfig(guildId: string) {
  const cacheKey = `guild:${guildId}:level_config`;
  let config = await cache.get<LevelConfig>(cacheKey);

  if (config) return config;

  config = await prisma.levelConfig.findUnique({
    where: { guildId },
  });

  if (!config) {
    // Ensure the Guild row exists before creating the FK-dependent LevelConfig
    await prisma.guild.upsert({
      where: { id: guildId },
      update: {},
      create: { id: guildId },
    });

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
        lengthBonusEnabled: false,
        lengthBonusThreshold: 200,
        lengthBonusMaxMultiplier: 2.0,
        curveBaseXp: DEFAULT_LEVEL_CURVE.baseXp,
        curveLinearXp: DEFAULT_LEVEL_CURVE.linearXp,
        curveExponent: DEFAULT_LEVEL_CURVE.exponent,
        maxLevel: DEFAULT_LEVEL_CURVE.maxLevel,
        voiceRequireUnmuted: true,
        voiceRequireUndeafened: true,
        voiceIgnoreAfkChannel: true,
        voiceMinMembers: 1,
        dailyXpCap: 0,
      },
    });
  }

  await cache.set(cacheKey, config, 60);
  return config;
}

/**
 * Réaligne la colonne `level` sur l'XP totale après un changement de courbe.
 *
 * Le niveau est normalement auto-réparé, mais seulement quand le membre regagne
 * de l'XP ou consulte son rang. Sans ce rattrapage, tout ce qui lit la colonne
 * telle quelle - les archives de fin de saison en particulier - resterait sur
 * l'ancienne courbe pour les membres devenus inactifs.
 *
 * Le réalignement se fait par tranche de niveau et non membre par membre : une
 * guilde de 50 000 membres tient dans une requête par niveau occupé.
 */
export async function resyncGuildLevels(guildId: string, curve: LevelCurve): Promise<number> {
  const top = await prisma.memberLevel.findFirst({
    where: { guildId },
    orderBy: { xp: 'desc' },
    select: { xp: true },
  });
  if (!top) return 0;

  const highestLevel = getLevelFromXp(top.xp, curve);
  let updated = 0;

  for (let level = 1; level <= highestLevel; level++) {
    // La dernière tranche reste ouverte : au niveau maximum d'une guilde
    // plafonnée, l'XP continue de monter sans borne supérieure.
    const xpRange = level === highestLevel
      ? { gte: getXpForLevel(level - 1, curve) }
      : { gte: getXpForLevel(level - 1, curve), lt: getXpForLevel(level, curve) };

    const result = await prisma.memberLevel.updateMany({
      where: { guildId, level: { not: level }, xp: xpRange },
      data: { level },
    });
    updated += result.count;
  }

  return updated;
}

/**
 * À appeler après toute écriture de `LevelConfig` : la courbe et le plafond
 * quotidien sont lus à chaque gain d'XP, laisser expirer le TTL ferait tourner
 * la guilde sur ses anciens réglages pendant une minute.
 */
export async function invalidateLevelConfigCache(guildId: string): Promise<void> {
  await cache.delete(`guild:${guildId}:level_config`);
}

/**
 * Calcule le facteur multiplicateur d'XP en fonction de la longueur du message.
 * Progression linéaire de 1.0 (message vide/court) jusqu'à `maxMultiplier`
 * atteint à `threshold` caractères, puis plafonné.
 */
export function computeLengthBonusFactor(
  messageLength: number,
  enabled: boolean,
  threshold: number,
  maxMultiplier: number,
): number {
  if (!enabled) return 1;
  if (!threshold || threshold <= 0) return 1;
  if (!maxMultiplier || maxMultiplier <= 1) return 1;
  const ratio = Math.min(1, Math.max(0, messageLength / threshold));
  return 1 + ratio * (maxMultiplier - 1);
}

/**
 * Ajoute de l'XP à un utilisateur (Textuel)
 */
export async function handleTextXp(guildId: string, userId: string, client: Client, channelId: string, messageLength = 0) {
  try {
    const config = await getOrCreateLevelConfig(guildId);
    if (!config.enabled) return;

    // Vérifier si le salon est exclu
    if (config.ignoredChannels && config.ignoredChannels.includes(channelId)) {
      return;
    }

    const cooldownKey = `${guildId}:${userId}`;
    const now = Date.now();
    maintainXpCooldowns(now);
    const cooldownEnd = xpCooldowns.get(cooldownKey) || 0;
    if (now < cooldownEnd) return;

    // Récupérer le membre Discord pour valider ses rôles
    const discordGuild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!discordGuild) return;
    const member = await discordGuild.members.fetch(userId).catch(() => null);
    if (!member) return;

    // Vérifier si le membre possède un rôle exclu
    if (config.ignoredRoles && (config.ignoredRoles as string[]).some(roleId => member.roles.cache.has(roleId))) {
      return;
    }

    // Définir le nouveau cooldown
    xpCooldowns.delete(cooldownKey);
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

    // Bonus selon la longueur du message (plus le message est long, plus le gain est élevé)
    const lengthFactor = computeLengthBonusFactor(
      messageLength,
      Boolean(config.lengthBonusEnabled),
      Number(config.lengthBonusThreshold ?? 0),
      Number(config.lengthBonusMaxMultiplier ?? 1),
    );

    // Assigner l'XP en appliquant le multiplicateur de rôle puis le bonus de longueur
    const baseGain = Math.floor(Math.random() * (config.xpMax - config.xpMin + 1)) + config.xpMin;
    const xpGain = Math.floor(baseGain * multiplier * lengthFactor);

    if (xpGain > 0) {
      await addXp(guildId, userId, xpGain, client, channelId, { applyDailyCap: true });
    }
  } catch (err) {
    logger.error('LevelingService', `Erreur lors de l'ajout d'XP texte pour ${userId} sur ${guildId}:`, err);
  }
}

function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Décompte `amount` du quota quotidien et renvoie la part réellement accordée.
 *
 * Le compteur vit sur la ligne du membre : elle est déjà écrite à chaque gain,
 * et une table dédiée aurait eu la même cardinalité tout en demandant sa propre
 * purge. Le compteur d'un autre jour est remis à zéro avant l'incrément, puis
 * le total est ramené au plafond en cas de dépassement : deux gains concurrents
 * ne peuvent donc pas le franchir ensemble, là où un `read then write` le
 * permettrait.
 */
async function consumeDailyXpAllowance(guildId: string, userId: string, amount: number, cap: number): Promise<number> {
  if (cap <= 0) return amount;

  const dateKey = utcDateKey(new Date());
  const where = { guildId_userId: { guildId, userId } };

  // `not` seul ne retiendrait pas les lignes à NULL : en SQL, `NULL <> 'x'`
  // ne vaut pas vrai. Les deux cas sont donc listés explicitement.
  await prisma.memberLevel.updateMany({
    where: { guildId, userId, OR: [{ dailyXpDate: null }, { dailyXpDate: { not: dateKey } }] },
    data: { dailyXp: 0, dailyXpDate: dateKey },
  });

  const counter = await prisma.memberLevel.upsert({
    where,
    update: { dailyXp: { increment: amount } },
    create: { guildId, userId, xp: 0, level: 0, dailyXp: amount, dailyXpDate: dateKey },
  });

  if (counter.dailyXp <= cap) return amount;

  await prisma.memberLevel.update({ where, data: { dailyXp: cap } }).catch(() => null);
  return grantedWithinDailyCap(counter.dailyXp, amount, cap);
}

/**
 * Ajoute de l'XP brute à un utilisateur et gère le passage de niveau.
 *
 * `applyDailyCap` n'est activé que pour les gains d'activité (texte, vocal) :
 * un octroi manuel de staff ou une récompense de quête ne doit pas être rogné
 * par le plafond quotidien.
 */
export async function addXp(
  guildId: string,
  userId: string,
  amount: number,
  client: Client,
  channelId?: string,
  options: { applyDailyCap?: boolean } = {},
) {
  if (amount <= 0) return;

  const config = await getOrCreateLevelConfig(guildId).catch(() => null);
  const curve = config ? levelCurveFromConfig(config) : DEFAULT_LEVEL_CURVE;

  let finalAmount = amount;
  try {
    // Lecture mise en cache : `addXp` est appelée à chaque message, et le clan
    // vainqueur comme son bonus ne changent qu'à la clôture d'une saison.
    const guildSettings = await getCachedGuild(guildId);

    if (guildSettings?.clanRewardXpBoost && guildSettings.lastWinningClanId) {
      const winnerIds = guildSettings.lastWinningClanId.split(',');
      const winningClans = await prisma.clan.findMany({
        where: { id: { in: winnerIds } },
        select: { roleId: true },
      });

      if (winningClans.length > 0) {
        const discordGuild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
        if (discordGuild) {
          const member = discordGuild.members.cache.get(userId) || await discordGuild.members.fetch(userId).catch(() => null);
          if (member && winningClans.some((c) => member.roles.cache.has(c.roleId))) {
            finalAmount = Math.round(amount * guildSettings.clanRewardXpBoostRate);
          }
        }
      }
    }
  } catch (err) {
    logger.error('LevelingService', `Erreur lors de l'application du multiplicateur d'XP de clan pour ${userId}:`, err);
  }

  // Le plafond se décompte après le boost de clan : il porte sur l'XP réellement
  // créditée, sinon un membre boosté le dépasserait de son propre multiplicateur.
  if (options.applyDailyCap && config && config.dailyXpCap > 0) {
    finalAmount = await consumeDailyXpAllowance(guildId, userId, finalAmount, config.dailyXpCap);
    if (finalAmount <= 0) return;
  }

  const memberLevel = await prisma.memberLevel.upsert({
    where: { guildId_userId: { guildId, userId } },
    update: {
      xp: { increment: finalAmount },
      lastXpGain: new Date(),
    },
    create: {
      guildId,
      userId,
      xp: finalAmount,
      level: 0,
    },
  });



  const previousLevel = memberLevel.level;
  // Le niveau est toujours recalculé depuis l'XP totale : ça gère les montées
  // de niveau et auto-répare les lignes dont le niveau était incohérent.
  const newLevel = getLevelFromXp(memberLevel.xp, curve);

  if (newLevel !== previousLevel) {
    if (newLevel > previousLevel) {
      // Le niveau et la récompense en KotboCoins doivent être commis ensemble : sinon un
      // échec du crédit (module économie momentanément indisponible, etc.) laisserait le
      // niveau monté sans aucune compensation.
      const coinReward = await getLevelUpCoinReward(guildId, newLevel);
      await prisma.$transaction(async (tx) => {
        await tx.memberLevel.update({
          where: { guildId_userId: { guildId, userId } },
          data: { level: newLevel },
        });
        if (coinReward) {
          await tx.rpgProfile.upsert({
            where: { guildId_userId: { guildId, userId } },
            update: { balance: { increment: coinReward.amount } },
            create: {
              guildId,
              userId,
              balance: coinReward.amount,
              level: 1,
              xp: 0,
              health: 100,
              maxHealth: 100,
              energy: 100,
              attack: 10,
              defense: 10,
              speed: 10,
            },
          });
        }
      });

      // Notification + récompenses annexes (rôles, points de clan) : best-effort, le
      // niveau et les pièces sont déjà garantis commis à ce stade.
      await processLevelUp(guildId, userId, newLevel, client, channelId, coinReward);
    } else {
      await prisma.memberLevel.update({
        where: { guildId_userId: { guildId, userId } },
        data: { level: newLevel },
      });
      // Correction vers le bas : on retire les rôles attribués en trop, sans message
      await updateMemberLevelRoles(guildId, userId, newLevel, client).catch(() => null);
    }
  }
}

/**
 * Calcule (sans l'appliquer) la récompense en KotboCoins due pour une montée de niveau.
 */
async function getLevelUpCoinReward(guildId: string, newLevel: number): Promise<{ amount: number; currencyEmoji: string; currencyName: string } | null> {
  try {
    const { getOrCreateEconomyConfig } = await import('../features/economyService.js');
    const econConfig = await getOrCreateEconomyConfig(guildId).catch(() => null);
    if (!econConfig || !econConfig.enabled) return null;
    return {
      amount: newLevel * 20,
      currencyEmoji: econConfig.currencyEmoji,
      currencyName: econConfig.currencyName,
    };
  } catch (err) {
    logger.error('LevelingService', "Erreur lors du calcul du bonus d'économie pour le level up :", err);
    return null;
  }
}

/**
 * Fixe l'XP totale d'un utilisateur à une valeur donnée (au lieu de l'incrémenter)
 * et gère le passage/la perte de niveau qui en découle.
 */
export async function setXp(guildId: string, userId: string, newXp: number, client: Client, channelId?: string) {
  const clampedXp = Math.max(0, Math.floor(newXp));

  const memberLevel = await prisma.memberLevel.upsert({
    where: { guildId_userId: { guildId, userId } },
    update: { xp: clampedXp },
    create: {
      guildId,
      userId,
      xp: clampedXp,
      level: 0,
    },
  });

  const previousLevel = memberLevel.level;
  const newLevel = getLevelFromXp(clampedXp, await getGuildLevelCurve(guildId));

  if (newLevel !== previousLevel) {
    if (newLevel > previousLevel) {
      // Voir addXp() : niveau et récompense en KotboCoins doivent être commis ensemble.
      const coinReward = await getLevelUpCoinReward(guildId, newLevel);
      await prisma.$transaction(async (tx) => {
        await tx.memberLevel.update({
          where: { guildId_userId: { guildId, userId } },
          data: { level: newLevel },
        });
        if (coinReward) {
          await tx.rpgProfile.upsert({
            where: { guildId_userId: { guildId, userId } },
            update: { balance: { increment: coinReward.amount } },
            create: {
              guildId,
              userId,
              balance: coinReward.amount,
              level: 1,
              xp: 0,
              health: 100,
              maxHealth: 100,
              energy: 100,
              attack: 10,
              defense: 10,
              speed: 10,
            },
          });
        }
      });
      await processLevelUp(guildId, userId, newLevel, client, channelId, coinReward);
    } else {
      await prisma.memberLevel.update({
        where: { guildId_userId: { guildId, userId } },
        data: { level: newLevel },
      });
      await updateMemberLevelRoles(guildId, userId, newLevel, client).catch(() => null);
    }
  }

  return { xp: clampedXp, level: newLevel };
}

/**
 * Gère les notifications de level up et l'attribution des rôles récompenses
 */
async function processLevelUp(guildId: string, userId: string, newLevel: number, client: Client, fallbackChannelId?: string, coinReward?: { amount: number; currencyEmoji: string; currencyName: string } | null) {
  try {
    const config = await getOrCreateLevelConfig(guildId);
    const discordGuild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!discordGuild) return;

    const member = await discordGuild.members.fetch(userId).catch(() => null);
    if (!member) return;

    // 0. Attribution des points de clan pour la montée de niveau si activé
    try {
      const guildConfig = await prisma.guild.findUnique({
        where: { id: guildId },
        select: { clansEnabled: true, currentClanSeason: true, clanXpFromLevelUp: true, clanXpPerLevelUp: true }
      });
      if (guildConfig?.clansEnabled && guildConfig?.clanXpFromLevelUp && guildConfig?.clanXpPerLevelUp > 0) {
        const clans = await prisma.clan.findMany({
          where: { guildId },
          select: { id: true, roleId: true }
        });
        if (clans.length > 0) {
          const clanRoleIds = clans.map(c => c.roleId);
          const memberClanRole = member.roles.cache.find(r => clanRoleIds.includes(r.id));
          if (memberClanRole) {
            const clan = clans.find(c => c.roleId === memberClanRole.id);
            if (clan) {
              const { getAllLinkedUserIds } = await import('../moderation/altAccountService.js');
              const linkedIds = await getAllLinkedUserIds(guildId, userId).catch(() => [userId]);
              const canonicalUserId = linkedIds.sort()[0];

              await prisma.clanMemberContribution.upsert({
                where: {
                  guildId_clanId_userId_season: {
                    guildId,
                    clanId: clan.id,
                    userId: canonicalUserId,
                    season: guildConfig.currentClanSeason
                  }
                },
                update: {
                  xp: { increment: guildConfig.clanXpPerLevelUp }
                },
                create: {
                  guildId,
                  clanId: clan.id,
                  userId: canonicalUserId,
                  season: guildConfig.currentClanSeason,
                  xp: guildConfig.clanXpPerLevelUp
                }
              });

              // Journaliser le gain pour le flux public « derniers scores »
              const { logClanContribution } = await import('../community/clanService.js');
              await logClanContribution(guildId, clan.id, canonicalUserId, guildConfig.clanXpPerLevelUp, 'XP', guildConfig.currentClanSeason);

              logger.info('LevelingService', `Points de clan (${guildConfig.clanXpPerLevelUp} XP) attribués à ${member.user.tag} pour son passage au niveau ${newLevel} dans le clan "${clan.id}"`);
            }
          }
        }
      }
    } catch (clanErr) {
      logger.error('LevelingService', `Erreur lors de l'attribution des points de clan pour le level up de ${userId}:`, clanErr);
    }

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
          const _highestReward = eligibleRewards[eligibleRewards.length - 1];
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

    // 1.5. Le crédit des KotboCoins a déjà été commis atomiquement avec le niveau (voir
    // addXp/setXp) ; on ne fait ici que construire le texte de notification.
    const coinRewardText = coinReward
      ? ` Tu as également gagné **${coinReward.amount}** ${coinReward.currencyEmoji} **${coinReward.currencyName}** !`
      : '';

    // 2. Envoi du message de félicitations
    const msgTemplate = config.levelUpMessage;
    const msg = msgTemplate
      .replace(/{user}/g, `<@${userId}>`)
      .replace(/{username}/g, member.user.username)
      .replace(/{level}/g, String(newLevel)) + coinRewardText;

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

  // L'XP est la source de vérité : on recalcule le niveau et on auto-répare la
  // ligne si elle est incohérente (ex. niveau importé d'un autre bot).
  const curve = await getGuildLevelCurve(guildId);
  const correctLevel = getLevelFromXp(memberLevel.xp, curve);
  if (memberLevel.id && correctLevel !== memberLevel.level) {
    memberLevel.level = correctLevel;
    prisma.memberLevel
      .update({
        where: { guildId_userId: { guildId, userId } },
        data: { level: correctLevel },
      })
      .catch(err => logger.error('LevelingService', `Auto-réparation du niveau échouée pour ${userId}:`, err));
  }

  const currentLevelXp = getXpForLevel(memberLevel.level - 1, curve);
  const nextLevelXp = getXpForLevel(memberLevel.level, curve);

  const xpRequiredForNextLevel = nextLevelXp - currentLevelXp;
  // Au niveau maximum l'XP continue de monter sans palier suivant : borner la
  // part du niveau en cours évite que les barres de progression construites
  // depuis ce ratio dépassent 100 %.
  const xpInCurrentLevel = Math.min(Math.max(0, memberLevel.xp - currentLevelXp), xpRequiredForNextLevel);

  return {
    level: memberLevel.level,
    xp: memberLevel.xp,
    xpInCurrentLevel,
    xpRequiredForNextLevel,
    rank,
    totalXp: memberLevel.xp,
  };
}

export type RankCardSubject = {
  userId: string;
  displayName: string;
  username: string;
  discriminator: string;
  avatarUrl: string;
  status: string;
};

export async function generateRankCard(
  member: GuildMember,
  level: number,
  xp: number,
  rank: number,
  customization?: RankCardCustomization,
  curve?: LevelCurve,
): Promise<Buffer> {
  return renderRankCard(
    {
      userId: member.id,
      displayName: member.displayName,
      username: member.user.username,
      discriminator: member.user.discriminator,
      avatarUrl: member.user.displayAvatarURL({ extension: 'png', size: 256 }),
      status: member.presence?.status ?? 'offline',
    },
    level,
    xp,
    rank,
    customization,
    curve ?? await getGuildLevelCurve(member.guild.id),
  );
}

/**
 * Rendu détaché de discord.js : le dashboard prévisualise la même carte sans
 * qu'un `GuildMember` soit disponible.
 */
export async function renderRankCard(
  subject: RankCardSubject,
  level: number,
  xp: number,
  rank: number,
  customization?: RankCardCustomization,
  curve: LevelCurve = DEFAULT_LEVEL_CURVE,
): Promise<Buffer> {
  const W = RANK_CARD_WIDTH, H = RANK_CARD_HEIGHT;
  const custom = customization ?? await getRankCardCustomization(subject.userId);
  const preset = getRankCardBackground(custom.backgroundId);
  const accentStart = preset.accentBar[0].color;
  const accentEnd = preset.accentBar[preset.accentBar.length - 1].color;
  ensureCanvasFonts();
  ensureRankCardFonts();
  const fontStack = rankCardFontStack(getRankCardFont(custom.fontId));
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  for (const stop of preset.gradient) bg.addColorStop(stop.offset, stop.color);
  roundRect(ctx, 0, 0, W, H, 22, bg);

  // Accent bar (top)
  const topBar = ctx.createLinearGradient(0, 0, W, 0);
  for (const stop of preset.accentBar) topBar.addColorStop(stop.offset, stop.color);
  ctx.fillStyle = topBar;
  ctx.fillRect(0, 0, W, 3);

  // Glows
  for (const glow of preset.glows) {
    const cx = W * glow.x, cy = H * glow.y;
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, glow.radius);
    gradient.addColorStop(0, glow.color);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);
  }

  // Avatar
  const avatarUrl = subject.avatarUrl;
  const avatarCX = 115, avatarCY = 130, avatarR = 62;

  // Avatar ring
  const ringGrad = ctx.createLinearGradient(avatarCX - avatarR, avatarCY - avatarR, avatarCX + avatarR, avatarCY + avatarR);
  ringGrad.addColorStop(0, accentStart);
  ringGrad.addColorStop(1, accentEnd);
  ctx.beginPath();
  ctx.arc(avatarCX, avatarCY, avatarR + 4, 0, Math.PI * 2);
  ctx.fillStyle = ringGrad;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(avatarCX, avatarCY, avatarR + 1, 0, Math.PI * 2);
  ctx.fillStyle = preset.avatarBackdrop;
  ctx.fill();

  try {
    const avatarImg = await loadRankCardAvatar(avatarUrl);
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarCX, avatarCY, avatarR, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatarImg, avatarCX - avatarR, avatarCY - avatarR, avatarR * 2, avatarR * 2);
    ctx.restore();
  } catch {
    ctx.fillStyle = accentStart;
    ctx.beginPath();
    ctx.arc(avatarCX, avatarCY, avatarR, 0, Math.PI * 2);
    ctx.fill();
  }

  // Status indicator
  const status = subject.status;
  const statusColor = status === 'online' ? '#3ba55d' : status === 'idle' ? '#faa81a' : status === 'dnd' ? '#ed4245' : '#747f8d';
  ctx.beginPath();
  ctx.arc(avatarCX + 45, avatarCY + 45, 14, 0, Math.PI * 2);
  ctx.fillStyle = preset.avatarBackdrop;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(avatarCX + 45, avatarCY + 45, 10, 0, Math.PI * 2);
  ctx.fillStyle = statusColor;
  ctx.fill();

  // Bloc RANG / NIVEAU : mesuré avant d'être tracé, car sa bordure gauche borne
  // la place du pseudo. Les deux partagent la même ligne, et la police du pseudo
  // étant au choix du membre, sa largeur ne peut plus être devinée.
  const rankVal = `#${rank}`;
  const levelVal = `${level}`;
  ctx.font = 'bold 38px sans-serif';
  const rankValW = ctx.measureText(rankVal).width;
  const levelValW = ctx.measureText(levelVal).width;
  ctx.font = 'bold 14px sans-serif';
  const rankLabelW = ctx.measureText('RANG ').width;
  const levelLabelW = ctx.measureText('NIVEAU ').width;
  const levelX = W - 45 - rankValW - rankLabelW - 28;
  const rightBlockLeft = levelX - levelValW - levelLabelW;

  // Name & tag
  const nameX = 210;
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 30px ${fontStack}`;
  ctx.fillText(fitText(ctx, subject.displayName, rightBlockLeft - nameX - 24), nameX, 80);

  // Le tag garde la police neutre : seule la graisse Bold des familles du
  // catalogue est embarquee, et un 17px normal retomberait de toute facon sur
  // le repli. C est aussi la ligne secondaire, elle n a pas a etre decoree.
  const tagText = subject.discriminator !== '0' ? `#${subject.discriminator}` : `@${subject.username}`;
  ctx.fillStyle = '#6e7681';
  ctx.font = '17px sans-serif';
  const emojiBandW = rankCardEmojiBandWidth(custom.emojis.length);
  const fittedTag = fitText(ctx, tagText, W - 45 - nameX - emojiBandW);
  ctx.fillText(fittedTag, nameX, 106);
  const tagWidth = ctx.measureText(fittedTag).width;

  await drawRankCardEmojis(ctx, custom.emojis, nameX + tagWidth + 16, 99);

  // Rank & Level (right side)
  ctx.textAlign = 'right';

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 38px sans-serif';
  ctx.fillText(rankVal, W - 45, 72);

  ctx.fillStyle = accentStart;
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('RANG ', W - 45 - rankValW, 72);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 38px sans-serif';
  ctx.fillText(levelVal, levelX, 72);

  ctx.fillStyle = accentEnd;
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('NIVEAU ', levelX - levelValW, 72);

  ctx.textAlign = 'left';

  // XP text
  const safeLevel = getLevelFromXp(xp, curve);
  const prevXpNeeded = getXpForLevel(safeLevel - 1, curve);
  const nextXpNeeded = getXpForLevel(safeLevel, curve);
  const xpRequiredForNextLevel = Math.max(1, nextXpNeeded - prevXpNeeded);
  // Bornée au palier : au niveau maximum l'XP continue de monter alors que le
  // palier suivant n'existe plus, et la carte afficherait « 150 000 / 30 000 ».
  const xpInCurrentLevel = Math.min(Math.max(0, xp - prevXpNeeded), xpRequiredForNextLevel);
  const progressPercent = Math.min(1, Math.max(0, xpInCurrentLevel / xpRequiredForNextLevel));

  ctx.fillStyle = '#6e7681';
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${xpInCurrentLevel.toLocaleString('fr-FR')} / ${xpRequiredForNextLevel.toLocaleString('fr-FR')} XP`, W - 45, 155);
  ctx.textAlign = 'left';

  // Progress bar
  const barX = nameX, barY = 175, barW = W - nameX - 45, barH = 22, barR = 11;
  roundRect(ctx, barX, barY, barW, barH, barR, 'rgba(255,255,255,0.06)');

  if (progressPercent > 0) {
    const filledW = Math.max(barH, barW * progressPercent);
    const grad = ctx.createLinearGradient(barX, 0, barX + filledW, 0);
    grad.addColorStop(0, accentStart);
    grad.addColorStop(1, accentEnd);
    roundRect(ctx, barX, barY, filledW, barH, barR, grad);
  }

  // Bottom text
  ctx.fillStyle = '#3b4048';
  ctx.font = '11px sans-serif';
  ctx.fillText('Kotbo · Progression', nameX, barY + barH + 28);

  ctx.textAlign = 'right';
  const totalXpText = `${xp.toLocaleString('fr-FR')} XP total`;
  ctx.fillText(totalXpText, W - 45, barY + barH + 28);
  ctx.textAlign = 'left';

  // Bottom accent bar
  const bottomBar = ctx.createLinearGradient(0, 0, W, 0);
  for (const stop of preset.accentBar) bottomBar.addColorStop(stop.offset, stop.color);
  ctx.save();
  // Le liseré du bas s'estompe sur les bords : on reprend le dégradé du haut
  // avec un masque d'opacité plutôt que de dupliquer les couleurs en rgba.
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = bottomBar;
  ctx.fillRect(0, H - 2, W, 2);
  ctx.restore();

  return canvas.toBuffer('image/png');
}

// L URL porte deja le hash d avatar : un changement de photo produit une autre
// cle, le TTL ne sert qu a borner la taille du cache. L apercu du dashboard
// rerend a chaque frappe, sans quoi chaque rendu repayait un aller-retour CDN.
const AVATAR_CACHE_TTL_MS = 10 * 60 * 1000;
const AVATAR_CACHE_MAX = 200;
const avatarImageCache = new Map<string, { image: Image; expiresAt: number }>();

async function loadRankCardAvatar(url: string): Promise<Image> {
  const now = Date.now();
  const cached = avatarImageCache.get(url);
  if (cached && cached.expiresAt > now) return cached.image;

  const image = await loadImage(url);

  if (avatarImageCache.size >= AVATAR_CACHE_MAX) {
    for (const [key, entry] of avatarImageCache) {
      if (entry.expiresAt <= now) avatarImageCache.delete(key);
    }
    // Insertion ordonnee : a defaut d entrees expirees, on evince la plus ancienne.
    if (avatarImageCache.size >= AVATAR_CACHE_MAX) {
      const oldest = avatarImageCache.keys().next().value;
      if (oldest !== undefined) avatarImageCache.delete(oldest);
    }
  }

  avatarImageCache.set(url, { image, expiresAt: now + AVATAR_CACHE_TTL_MS });
  return image;
}

const RANK_FONT_DIR = fileURLToPath(new URL('../../../assets/rank-fonts/', import.meta.url));

let rankFontsRegistered = false;

/**
 * Enregistre les polices du catalogue auprès du canvas. Une police absente ou
 * illisible est seulement journalisée : la pile de familles retombe alors sur
 * DejaVu, ce qui donne une carte moins jolie mais jamais une carte cassée.
 */
function ensureRankCardFonts(): void {
  if (rankFontsRegistered) return;
  rankFontsRegistered = true;

  for (const font of RANK_CARD_FONTS) {
    if (!font.family) continue;
    const file = `${RANK_FONT_DIR}${font.id}.ttf`;
    try {
      if (!GlobalFonts.registerFromPath(file, font.family)) {
        logger.warn('RankCard', `Police ${font.id} refusée par le canvas (${file})`);
      }
    } catch (error) {
      logger.warn('RankCard', `Police ${font.id} illisible:`, error);
    }
  }
}

const RANK_EMOJI_SIZE = 26, RANK_EMOJI_GAP = 8;

function rankCardEmojiBandWidth(count: number): number {
  if (count <= 0) return 0;
  // Le decalage de 16 px qui separe le tag de la bande est compte ici, pour que
  // l appelant n ait qu une seule largeur a reserver.
  return 16 + count * RANK_EMOJI_SIZE + (count - 1) * RANK_EMOJI_GAP;
}

/**
 * Tronque au caractère près pour tenir dans `maxWidth`, ellipse comprise.
 *
 * Le découpage passe par les points de code et non par `slice` : un pseudo peut
 * contenir des emojis, et couper au milieu d'une paire de substitution
 * afficherait un caractère de remplacement. `ctx.font` doit être positionné
 * avant l'appel, la mesure en dépend.
 */
function fitText(ctx: SKRSContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;

  const chars = [...text];
  while (chars.length > 1) {
    chars.pop();
    const candidate = `${chars.join('')}…`;
    if (ctx.measureText(candidate).width <= maxWidth) return candidate;
  }
  return '…';
}

const RANK_EMOJI_DIR = fileURLToPath(new URL('../../../assets/rank-emojis/', import.meta.url));

// `null` memorise un asset manquant : sans lui, un fichier absent relancait un
// acces disque a chaque carte rendue.
const emojiImageCache = new Map<string, Image | null>();

async function loadRankCardEmoji(emoji: string): Promise<Image | null> {
  const codePoint = rankCardEmojiCodePoint(emoji);
  if (!codePoint) return null;

  const cached = emojiImageCache.get(codePoint);
  if (cached !== undefined) return cached;

  try {
    const image = await loadImage(`${RANK_EMOJI_DIR}${codePoint}.png`);
    emojiImageCache.set(codePoint, image);
    return image;
  } catch (error) {
    logger.warn('RankCard', `Asset emoji ${codePoint}.png illisible:`, error);
    emojiImageCache.set(codePoint, null);
    return null;
  }
}

async function drawRankCardEmojis(
  ctx: SKRSContext2D,
  emojis: string[],
  startX: number,
  centerY: number,
): Promise<void> {
  let x = startX;

  for (const emoji of emojis) {
    const image = await loadRankCardEmoji(emoji);
    if (!image) continue;

    ctx.drawImage(image, x, centerY - RANK_EMOJI_SIZE / 2, RANK_EMOJI_SIZE, RANK_EMOJI_SIZE);
    x += RANK_EMOJI_SIZE + RANK_EMOJI_GAP;
  }
}

// Helper pour dessiner des rectangles arrondis
function roundRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number, fill: string | CanvasGradient) {
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

/**
 * Met à jour les rôles de récompense pour un utilisateur en fonction de son niveau,
 * sans envoyer de message dans le chat (utile pour les imports).
 */
export async function updateMemberLevelRoles(guildId: string, userId: string, level: number, client: Client) {
  try {
    const config = await getOrCreateLevelConfig(guildId);
    const discordGuild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!discordGuild) return;

    const member = await discordGuild.members.fetch(userId).catch(() => null);
    if (!member) return;

    const rewards = await prisma.levelRoleReward.findMany({
      where: { guildId },
      orderBy: { level: 'asc' },
    });

    if (rewards.length > 0) {
      const rolesToAdd: string[] = [];
      const rolesToRemove: string[] = [];

      for (const reward of rewards) {
        if (level >= reward.level) {
          if (!member.roles.cache.has(reward.roleId)) {
            rolesToAdd.push(reward.roleId);
          }
        } else {
          if (member.roles.cache.has(reward.roleId)) {
            rolesToRemove.push(reward.roleId);
          }
        }
      }

      if (!config.stackRewards) {
        const eligibleRewards = rewards.filter(r => level >= r.level);
        if (eligibleRewards.length > 1) {
          const _highestReward = eligibleRewards[eligibleRewards.length - 1];
          for (const prevReward of eligibleRewards.slice(0, -1)) {
            if (member.roles.cache.has(prevReward.roleId) && !rolesToRemove.includes(prevReward.roleId)) {
              rolesToRemove.push(prevReward.roleId);
            }
            const addIdx = rolesToAdd.indexOf(prevReward.roleId);
            if (addIdx !== -1) rolesToAdd.splice(addIdx, 1);
          }
        }
      }

      if (rolesToRemove.length > 0) {
        await member.roles.remove(rolesToRemove).catch(e => logger.warn('LevelingService', `Impossible de retirer les rôles récompenses à ${userId}:`, e));
      }
      if (rolesToAdd.length > 0) {
        await member.roles.add(rolesToAdd).catch(e => logger.warn('LevelingService', `Impossible d'ajouter les rôles récompenses à ${userId}:`, e));
      }
    }
  } catch (err) {
    logger.error('LevelingService', `Erreur lors de la mise à jour des rôles de niveau pour ${userId}:`, err);
  }
}
