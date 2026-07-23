import crypto from 'node:crypto';
import prisma from './db.js';
import { logger } from './logger.js';
import { getClient } from './client.js';

function hashActivationCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

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

  await prisma.$transaction(async (tx) => {
    const activationCode = await tx.activationCode.findUnique({
      where: { code: normalizedCode },
    });

    if (!activationCode || !activationCode.isActive || activationCode.usedAt) {
      throw new Error('Code invalide, déjà utilisé ou expiré.');
    }

    await tx.activationCode.update({
      where: { code: normalizedCode },
      data: {
        usedAt: new Date(),
        usedByGuildId: guildId,
        isActive: false,
      },
    });

    await tx.guild.upsert({
      where: { id: guildId },
      update: {
        activated: true,
        activatedAt: new Date(),
        activationCode: hashActivationCode(normalizedCode),
        activatedViaStaffLink: false,
      },
      create: {
        id: guildId,
        activated: true,
        activatedAt: new Date(),
        activationCode: hashActivationCode(normalizedCode),
        activatedViaStaffLink: false,
      },
    });
  });

  logger.success('Activation', `Le serveur ${guildId} a été activé.`);

  await broadcastActivationChange(guildId, true);

  // Ce serveur peut être le principal d'un ou plusieurs serveurs staff en attente.
  await cascadeToLinkedStaffGuilds(guildId);
}

async function broadcastActivationChange(guildId: string, activated: boolean): Promise<void> {
  if (activated) {
    activatedGuilds.add(guildId);
  } else {
    activatedGuilds.delete(guildId);
  }

  try {
    const client = getClient();
    if (client.shard) {
      const activationPath = import.meta.url;
      await client.shard.broadcastEval((c: unknown, context: { id: string; activationPath: string; activated: boolean }) => {
        import(context.activationPath).then((m) => {
          if (context.activated) {
            m.activatedGuilds.add(context.id);
          } else {
            m.activatedGuilds.delete(context.id);
          }
        }).catch(() => {});
      }, { context: { id: guildId, activationPath, activated } }).catch((err: unknown) => {
        logger.error('Activation', `Failed to broadcast activation change for ${guildId}:`, err);
      });
    }
  } catch {
    // client might not be initialized yet in some contexts (e.g. CLI seed scripts)
  }
}

export type StaffGuildReconcileResult = 'activated' | 'deactivated' | 'unchanged';

/**
 * Réconcilie l'activation d'un serveur staff avec celle de son/ses serveur(s) principal(aux) lié(s).
 * Un serveur staff n'a pas son propre code : il hérite de l'activation du principal tant qu'un
 * StaffServerLink actif existe. Ne touche jamais une guilde activée directement par son propre code.
 */
export async function reconcileStaffGuildActivation(staffGuildId: string): Promise<StaffGuildReconcileResult> {
  const links = await prisma.staffServerLink.findMany({
    where: { staffGuildId, enabled: true },
    include: { mainGuild: { select: { id: true, activated: true, activationCode: true } } },
  });

  const activeMain = links.find((l) => l.mainGuild.activated);
  const shouldBeActive = !!activeMain;

  const current = await prisma.guild.findUnique({
    where: { id: staffGuildId },
    select: { activated: true, activatedViaStaffLink: true },
  });

  if (shouldBeActive && !current?.activated) {
    await prisma.guild.upsert({
      where: { id: staffGuildId },
      update: {
        activated: true,
        activatedAt: new Date(),
        activationCode: activeMain!.mainGuild.activationCode,
        activatedViaStaffLink: true,
      },
      create: {
        id: staffGuildId,
        activated: true,
        activatedAt: new Date(),
        activationCode: activeMain!.mainGuild.activationCode,
        activatedViaStaffLink: true,
      },
    });

    await broadcastActivationChange(staffGuildId, true);
    logger.success('Activation', `Le serveur staff ${staffGuildId} a été activé automatiquement via le lien avec ${activeMain!.mainGuild.id}.`);

    await applyStaffServerFeatureDefaults(staffGuildId);
    return 'activated';
  }

  if (!shouldBeActive && current?.activated && current.activatedViaStaffLink) {
    await prisma.guild.update({
      where: { id: staffGuildId },
      data: {
        activated: false,
        activatedAt: null,
        activationCode: null,
        activatedViaStaffLink: false,
      },
    });

    await broadcastActivationChange(staffGuildId, false);
    logger.success('Activation', `Le serveur staff ${staffGuildId} a été désactivé (plus aucun serveur principal lié activé).`);
    return 'deactivated';
  }

  return 'unchanged';
}

/**
 * Désactive par défaut les modules communautaires (économie, leveling) sur un serveur staff
 * qui vient d'être activé pour la première fois via un lien. Défaut appliqué une seule fois :
 * un admin peut les réactiver manuellement ensuite sans que le bot ne les réimpose.
 */
async function applyStaffServerFeatureDefaults(guildId: string): Promise<void> {
  await prisma.economyConfig.upsert({
    where: { guildId },
    update: { enabled: false, rpgEnabled: false, shopEnabled: false, guildsEnabled: false },
    create: { guildId, enabled: false, rpgEnabled: false, shopEnabled: false, guildsEnabled: false },
  }).catch((err) => logger.warn('Activation', `Impossible d'appliquer les défauts économie sur ${guildId}:`, err));

  await prisma.levelConfig.upsert({
    where: { guildId },
    update: { enabled: false },
    create: { guildId, enabled: false },
  }).catch((err) => logger.warn('Activation', `Impossible d'appliquer les défauts leveling sur ${guildId}:`, err));
}

/**
 * Quand une guilde (potentiellement "principale") change d'état d'activation, propage la
 * réconciliation vers tous les serveurs staff qui lui sont liés.
 */
async function cascadeToLinkedStaffGuilds(mainGuildId: string): Promise<void> {
  const links = await prisma.staffServerLink.findMany({
    where: { mainGuildId, enabled: true },
    select: { staffGuildId: true },
  });

  for (const link of links) {
    await reconcileStaffGuildActivation(link.staffGuildId).catch((err) =>
      logger.error('Activation', `Erreur de réconciliation pour le serveur staff ${link.staffGuildId}:`, err),
    );
  }
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
      activationCode: null,
      activatedViaStaffLink: false,
    }
  });

  logger.success('Activation', `Le serveur ${guildId} a été désactivé.`);

  await broadcastActivationChange(guildId, false);

  // Ce serveur peut être le principal d'un ou plusieurs serveurs staff : ils perdent leur activation cascadée.
  await cascadeToLinkedStaffGuilds(guildId);
}
