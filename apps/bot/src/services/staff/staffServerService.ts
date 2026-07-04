import {
  type Client,
  type GuildMember,
  type Role,
  EmbedBuilder,
  TextChannel,
} from 'discord.js';
import prisma from '../../utils/db.js';
import { logger } from '../../utils/logger.js';
import { COLORS } from '../../utils/embeds.js';
import { cache } from '../../utils/cache.js';
import type { StaffServerLink, StaffServerRoleMapping } from '@prisma/client';

const TAG = 'StaffServer';

type StaffServerLinkWithMappings = StaffServerLink & {
  roleMappings: StaffServerRoleMapping[];
};

// ── Cache ───────────────────────────────────────────────────

function staffLinksCacheKey(guildId: string) {
  return `staffserverlinks:${guildId}`;
}

export async function getStaffLinksForGuild(guildId: string): Promise<StaffServerLinkWithMappings[]> {
  const key = staffLinksCacheKey(guildId);
  const cached = await cache.get<StaffServerLinkWithMappings[]>(key);
  if (cached) return cached;

  const links = await prisma.staffServerLink.findMany({
    where: {
      enabled: true,
      OR: [{ mainGuildId: guildId }, { staffGuildId: guildId }],
    },
    include: { roleMappings: true },
  });

  if (links.length > 0) {
    await cache.set(key, links, 120);
  }
  return links;
}

export async function invalidateStaffLinkCache(link: StaffServerLink) {
  await cache.delete(staffLinksCacheKey(link.mainGuildId));
  await cache.delete(staffLinksCacheKey(link.staffGuildId));
}

// ── Link management ─────────────────────────────────────────

export async function createStaffServerLink(opts: {
  mainGuildId: string;
  staffGuildId: string;
  syncMode: 'MAIN_TO_STAFF' | 'STAFF_TO_MAIN' | 'BIDIRECTIONAL';
  hierarchyId?: string;
  simpleStaffRoleId?: string;
  mainLogChannelId?: string;
  staffLogChannelId?: string;
  createdByUserId: string;
}): Promise<StaffServerLink | { error: string }> {
  if (opts.mainGuildId === opts.staffGuildId) {
    return { error: 'Le serveur principal et le serveur staff doivent être différents.' };
  }

  const existing = await prisma.staffServerLink.findFirst({
    where: {
      mainGuildId: opts.mainGuildId,
      staffGuildId: opts.staffGuildId,
      hierarchyId: opts.hierarchyId ?? null,
    },
  });

  if (existing) {
    return { error: 'Un lien staff existe déjà entre ces deux serveurs pour cette hiérarchie.' };
  }

  return prisma.staffServerLink.create({
    data: {
      mainGuildId: opts.mainGuildId,
      staffGuildId: opts.staffGuildId,
      syncMode: opts.syncMode,
      hierarchyId: opts.hierarchyId,
      simpleStaffRoleId: opts.simpleStaffRoleId,
      mainLogChannelId: opts.mainLogChannelId,
      staffLogChannelId: opts.staffLogChannelId,
      createdByUserId: opts.createdByUserId,
    },
  });
}

export async function removeStaffServerLink(linkId: string): Promise<StaffServerLink | null> {
  const link = await prisma.staffServerLink.findUnique({ where: { id: linkId } });
  if (!link) return null;

  await invalidateStaffLinkCache(link);
  return prisma.staffServerLink.delete({ where: { id: linkId } });
}

export async function listStaffServerLinks(guildId: string): Promise<StaffServerLinkWithMappings[]> {
  return prisma.staffServerLink.findMany({
    where: {
      OR: [{ mainGuildId: guildId }, { staffGuildId: guildId }],
    },
    include: { roleMappings: true },
    orderBy: { createdAt: 'desc' },
  });
}

// ── Role mapping management ─────────────────────────────────

export async function addRoleMapping(opts: {
  staffServerLinkId: string;
  staffRoleId?: string;
  mainDiscordRoleId?: string;
  staffDiscordRoleId?: string;
}): Promise<StaffServerRoleMapping> {
  const mapping = await prisma.staffServerRoleMapping.create({
    data: {
      staffServerLinkId: opts.staffServerLinkId,
      staffRoleId: opts.staffRoleId,
      mainDiscordRoleId: opts.mainDiscordRoleId,
      staffDiscordRoleId: opts.staffDiscordRoleId,
    },
  });

  const link = await prisma.staffServerLink.findUnique({ where: { id: opts.staffServerLinkId } });
  if (link) await invalidateStaffLinkCache(link);

  return mapping;
}

export async function removeRoleMapping(mappingId: string): Promise<void> {
  const mapping = await prisma.staffServerRoleMapping.findUnique({
    where: { id: mappingId },
    include: { staffServerLink: true },
  });
  if (!mapping) return;

  await prisma.staffServerRoleMapping.delete({ where: { id: mappingId } });
  await invalidateStaffLinkCache(mapping.staffServerLink);
}

// ── Role sync logic ─────────────────────────────────────────

export async function syncMemberRoles(
  member: GuildMember,
  oldRoles: string[],
  newRoles: string[],
  client: Client,
): Promise<void> {
  const guildId = member.guild.id;
  const links = await getStaffLinksForGuild(guildId);
  if (links.length === 0) return;

  const addedRoles = newRoles.filter((r) => !oldRoles.includes(r));
  const removedRoles = oldRoles.filter((r) => !newRoles.includes(r));

  if (addedRoles.length === 0 && removedRoles.length === 0) return;

  for (const link of links) {
    try {
      const isMainGuild = link.mainGuildId === guildId;
      const isStaffGuild = link.staffGuildId === guildId;
      if (!isMainGuild && !isStaffGuild) continue;

      const shouldSync = shouldSyncFromGuild(link.syncMode, isMainGuild);
      if (!shouldSync) continue;

      const otherGuildId = isMainGuild ? link.staffGuildId : link.mainGuildId;
      const otherGuild = client.guilds.cache.get(otherGuildId);
      if (!otherGuild) continue;

      let otherMember: GuildMember | null = null;
      try {
        otherMember = await otherGuild.members.fetch(member.user.id);
      } catch {
        continue;
      }

      if (link.syncMode === 'BIDIRECTIONAL' || hasMappingsForRoles(link, addedRoles, removedRoles, isMainGuild)) {
        await applyRoleSync(link, member, otherMember, addedRoles, removedRoles, isMainGuild, client);
      } else if (link.simpleStaffRoleId) {
        await applySimpleStaffRole(link, member, otherMember, addedRoles, removedRoles, isMainGuild);
      }
    } catch (err) {
      logger.error(TAG, `Erreur sync rôles pour ${member.user.tag} sur link ${link.id}`, err);
    }
  }
}

function shouldSyncFromGuild(syncMode: string, isMainGuild: boolean): boolean {
  if (syncMode === 'BIDIRECTIONAL') return true;
  if (syncMode === 'MAIN_TO_STAFF' && isMainGuild) return true;
  if (syncMode === 'STAFF_TO_MAIN' && !isMainGuild) return true;
  return false;
}

function hasMappingsForRoles(
  link: StaffServerLinkWithMappings,
  addedRoles: string[],
  removedRoles: string[],
  isMainGuild: boolean,
): boolean {
  const changedRoles = [...addedRoles, ...removedRoles];
  const roleField = isMainGuild ? 'mainDiscordRoleId' : 'staffDiscordRoleId';

  return link.roleMappings.some((m) => {
    const mappedRoleId = m[roleField];
    return mappedRoleId && changedRoles.includes(mappedRoleId);
  });
}

async function applyRoleSync(
  link: StaffServerLinkWithMappings,
  sourceMember: GuildMember,
  targetMember: GuildMember,
  addedRoles: string[],
  removedRoles: string[],
  sourceIsMain: boolean,
  client: Client,
): Promise<void> {
  const sourceField = sourceIsMain ? 'mainDiscordRoleId' : 'staffDiscordRoleId';
  const targetField = sourceIsMain ? 'staffDiscordRoleId' : 'mainDiscordRoleId';

  const rolesToAdd: string[] = [];
  const rolesToRemove: string[] = [];

  for (const mapping of link.roleMappings) {
    const sourceRoleId = mapping[sourceField];
    const targetRoleId = mapping[targetField];
    if (!sourceRoleId || !targetRoleId) continue;

    if (addedRoles.includes(sourceRoleId)) {
      rolesToAdd.push(targetRoleId);
    }
    if (removedRoles.includes(sourceRoleId)) {
      rolesToRemove.push(targetRoleId);
    }
  }

  const actions: string[] = [];

  for (const roleId of rolesToAdd) {
    const role = targetMember.guild.roles.cache.get(roleId);
    if (role && !targetMember.roles.cache.has(roleId)) {
      await targetMember.roles.add(role, 'Kotbo StaffServer: Sync automatique').catch((err) =>
        logger.warn(TAG, `Impossible d'ajouter le rôle ${roleId} à ${targetMember.user.tag}`, err),
      );
      actions.push(`➕ Rôle **${role.name}** ajouté`);
    }
  }

  for (const roleId of rolesToRemove) {
    const role = targetMember.guild.roles.cache.get(roleId);
    if (role && targetMember.roles.cache.has(roleId)) {
      await targetMember.roles.remove(role, 'Kotbo StaffServer: Sync automatique').catch((err) =>
        logger.warn(TAG, `Impossible de retirer le rôle ${roleId} à ${targetMember.user.tag}`, err),
      );
      actions.push(`➖ Rôle **${role.name}** retiré`);
    }
  }

  if (actions.length > 0) {
    await sendSyncLog(link, sourceMember, targetMember, actions, sourceIsMain, client);
  }
}

async function applySimpleStaffRole(
  link: StaffServerLinkWithMappings,
  sourceMember: GuildMember,
  targetMember: GuildMember,
  addedRoles: string[],
  removedRoles: string[],
  sourceIsMain: boolean,
): Promise<void> {
  if (!link.simpleStaffRoleId) return;

  const sourceField = sourceIsMain ? 'mainDiscordRoleId' : 'staffDiscordRoleId';

  const staffSourceRoleIds = link.roleMappings
    .map((m) => m[sourceField])
    .filter(Boolean) as string[];

  const hasAnyStaffRole = sourceMember.roles.cache.some((r) => staffSourceRoleIds.includes(r.id));

  const destGuild = targetMember.guild;

  if (sourceIsMain && link.syncMode === 'MAIN_TO_STAFF') {
    const simpleRole = destGuild.roles.cache.get(link.simpleStaffRoleId);
    if (!simpleRole) return;

    if (hasAnyStaffRole && !targetMember.roles.cache.has(simpleRole.id)) {
      await targetMember.roles.add(simpleRole, 'Kotbo StaffServer: Ajout rôle staff simple').catch(() => null);
    } else if (!hasAnyStaffRole && targetMember.roles.cache.has(simpleRole.id)) {
      await targetMember.roles.remove(simpleRole, 'Kotbo StaffServer: Retrait rôle staff simple').catch(() => null);
    }
  }
}

// ── Logging ─────────────────────────────────────────────────

async function sendSyncLog(
  link: StaffServerLinkWithMappings,
  sourceMember: GuildMember,
  targetMember: GuildMember,
  actions: string[],
  sourceIsMain: boolean,
  client: Client,
): Promise<void> {
  const embed = new EmbedBuilder()
    .setColor(COLORS.info)
    .setAuthor({
      name: `Sync Staff • ${sourceMember.user.displayName || sourceMember.user.username}`,
      iconURL: sourceMember.user.displayAvatarURL(),
    })
    .setDescription(
      `**Membre :** ${sourceMember.user.tag} (<@${sourceMember.user.id}>)\n` +
      `**Source :** ${sourceMember.guild.name}\n` +
      `**Cible :** ${targetMember.guild.name}\n\n` +
      actions.join('\n'),
    )
    .setTimestamp()
    .setFooter({ text: `StaffServer Link • ${link.syncMode}` });

  const logChannelIds = [link.mainLogChannelId, link.staffLogChannelId].filter(Boolean) as string[];

  for (const channelId of logChannelIds) {
    try {
      for (const guild of client.guilds.cache.values()) {
        const channel = guild.channels.cache.get(channelId);
        if (channel instanceof TextChannel) {
          await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => null);
          break;
        }
      }
    } catch {
      // Silent — log channel might not be accessible
    }
  }
}

// ── Auto-setup role mappings on link creation ──────────────

export async function autoSetupRoleMappings(
  link: StaffServerLink,
  client: Client,
): Promise<{ created: number; matched: number; failed: number }> {
  const mainGuild = client.guilds.cache.get(link.mainGuildId);
  const staffGuild = client.guilds.cache.get(link.staffGuildId);
  if (!mainGuild || !staffGuild) return { created: 0, matched: 0, failed: 0 };

  const staffRoles = await prisma.staffRole.findMany({
    where: {
      guildId: link.mainGuildId,
      enabled: true,
      ...(link.hierarchyId ? { hierarchyId: link.hierarchyId } : {}),
    },
    orderBy: { sortOrder: 'asc' },
  });

  let created = 0;
  let matched = 0;
  let failed = 0;

  for (const staffRole of staffRoles) {
    if (!staffRole.discordRoleId) continue;

    const mainDiscordRole = mainGuild.roles.cache.get(staffRole.discordRoleId);
    if (!mainDiscordRole) continue;

    try {
      let targetDiscordRoleId: string;

      const existingRole = staffGuild.roles.cache.find(
        (r) => r.name.toLowerCase() === mainDiscordRole.name.toLowerCase() && !r.managed,
      );

      if (existingRole) {
        targetDiscordRoleId = existingRole.id;
        matched++;
      } else {
        const newRole = await staffGuild.roles.create({
          name: mainDiscordRole.name,
          color: mainDiscordRole.color,
          hoist: mainDiscordRole.hoist,
          mentionable: mainDiscordRole.mentionable,
          reason: 'Kotbo StaffServer: Auto-création lors du setup',
        });
        targetDiscordRoleId = newRole.id;
        created++;
      }

      const existingMapping = await prisma.staffServerRoleMapping.findFirst({
        where: {
          staffServerLinkId: link.id,
          staffRoleId: staffRole.id,
        },
      });

      if (!existingMapping) {
        await prisma.staffServerRoleMapping.create({
          data: {
            staffServerLinkId: link.id,
            staffRoleId: staffRole.id,
            mainDiscordRoleId: staffRole.discordRoleId,
            staffDiscordRoleId: targetDiscordRoleId,
          },
        });
      }
    } catch (err) {
      logger.warn(TAG, `Impossible de mapper le rôle "${mainDiscordRole.name}" sur ${staffGuild.name}`, err);
      failed++;
    }
  }

  await invalidateStaffLinkCache(link);
  return { created, matched, failed };
}

// ── Member join sync ───────────────────────────────────────

export async function syncMemberOnJoin(
  member: GuildMember,
  client: Client,
): Promise<void> {
  const guildId = member.guild.id;
  const links = await getStaffLinksForGuild(guildId);
  if (links.length === 0) return;

  for (const link of links) {
    try {
      const isMainGuild = link.mainGuildId === guildId;
      const isStaffGuild = link.staffGuildId === guildId;
      if (!isMainGuild && !isStaffGuild) continue;

      const otherGuildId = isMainGuild ? link.staffGuildId : link.mainGuildId;
      const otherGuild = client.guilds.cache.get(otherGuildId);
      if (!otherGuild) continue;

      let otherMember: GuildMember | null = null;
      try {
        otherMember = await otherGuild.members.fetch(member.user.id);
      } catch {
        continue;
      }

      const sourceField = isMainGuild ? 'staffDiscordRoleId' : 'mainDiscordRoleId';
      const targetField = isMainGuild ? 'mainDiscordRoleId' : 'staffDiscordRoleId';

      if (!shouldSyncFromGuild(link.syncMode, !isMainGuild)) continue;

      for (const mapping of link.roleMappings) {
        const sourceRoleId = mapping[sourceField];
        const targetRoleId = mapping[targetField];
        if (!sourceRoleId || !targetRoleId) continue;

        if (otherMember.roles.cache.has(sourceRoleId)) {
          const role = member.guild.roles.cache.get(targetRoleId);
          if (role && !member.roles.cache.has(targetRoleId)) {
            await member.roles.add(role, 'Kotbo StaffServer: Sync à l\'arrivée').catch((err) =>
              logger.warn(TAG, `Impossible d'ajouter le rôle ${targetRoleId} à ${member.user.tag} à l'arrivée`, err),
            );
          }
        }
      }

      if (link.simpleStaffRoleId) {
        const otherRoleField = isMainGuild ? 'mainDiscordRoleId' : 'staffDiscordRoleId';
        const otherRoleIds = link.roleMappings
          .map((m) => m[otherRoleField])
          .filter(Boolean) as string[];
        const hasAnyStaffRole = otherMember.roles.cache.some((r) => otherRoleIds.includes(r.id));

        if (hasAnyStaffRole) {
          const simpleRole = member.guild.roles.cache.get(link.simpleStaffRoleId);
          if (simpleRole && !member.roles.cache.has(simpleRole.id)) {
            await member.roles.add(simpleRole, 'Kotbo StaffServer: Rôle staff simple à l\'arrivée').catch(() => null);
          }
        }
      }
    } catch (err) {
      logger.error(TAG, `Erreur sync à l'arrivée pour ${member.user.tag} sur link ${link.id}`, err);
    }
  }
}

// ── Full sync (manual trigger) ──────────────────────────────

export async function fullSyncStaffRoles(linkId: string, client: Client): Promise<{ synced: number; errors: number }> {
  const link = await prisma.staffServerLink.findUnique({
    where: { id: linkId },
    include: { roleMappings: true },
  });

  if (!link) return { synced: 0, errors: 0 };

  const mainGuild = client.guilds.cache.get(link.mainGuildId);
  const staffGuild = client.guilds.cache.get(link.staffGuildId);
  if (!mainGuild || !staffGuild) return { synced: 0, errors: 0 };

  const sourceGuild = link.syncMode === 'STAFF_TO_MAIN' ? staffGuild : mainGuild;
  const targetGuild = link.syncMode === 'STAFF_TO_MAIN' ? mainGuild : staffGuild;
  const sourceIsMain = link.syncMode !== 'STAFF_TO_MAIN';

  const sourceField = sourceIsMain ? 'mainDiscordRoleId' : 'staffDiscordRoleId';
  const targetField = sourceIsMain ? 'staffDiscordRoleId' : 'mainDiscordRoleId';

  let synced = 0;
  let errors = 0;

  let sourceMembers;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      sourceMembers = await sourceGuild.members.fetch();
      break;
    } catch (err: any) {
      if (err?.name === 'GatewayRateLimitError' && err?.data?.retry_after && attempt < 2) {
        await new Promise((r) => setTimeout(r, err.data.retry_after * 1000 + 500));
        continue;
      }
      throw err;
    }
  }
  if (!sourceMembers) return { synced: 0, errors: 0 };

  for (const [userId, sourceMember] of sourceMembers) {
    if (sourceMember.user.bot) continue;

    try {
      let targetMember: GuildMember;
      try {
        targetMember = await targetGuild.members.fetch(userId);
      } catch {
        continue;
      }

      for (const mapping of link.roleMappings) {
        const sourceRoleId = mapping[sourceField];
        const targetRoleId = mapping[targetField];
        if (!sourceRoleId || !targetRoleId) continue;

        const hasSourceRole = sourceMember.roles.cache.has(sourceRoleId);
        const hasTargetRole = targetMember.roles.cache.has(targetRoleId);

        if (hasSourceRole && !hasTargetRole) {
          const role = targetGuild.roles.cache.get(targetRoleId);
          if (role) {
            await targetMember.roles.add(role, 'Kotbo StaffServer: Sync complète');
            synced++;
          }
        } else if (!hasSourceRole && hasTargetRole) {
          const role = targetGuild.roles.cache.get(targetRoleId);
          if (role) {
            await targetMember.roles.remove(role, 'Kotbo StaffServer: Sync complète');
            synced++;
          }
        }
      }

      if (link.simpleStaffRoleId && link.syncMode !== 'BIDIRECTIONAL') {
        const staffRoleIds = link.roleMappings.map((m) => m[sourceField]).filter(Boolean) as string[];
        const hasAnyStaffRole = sourceMember.roles.cache.some((r) => staffRoleIds.includes(r.id));
        const simpleRole = targetGuild.roles.cache.get(link.simpleStaffRoleId);

        if (simpleRole) {
          if (hasAnyStaffRole && !targetMember.roles.cache.has(simpleRole.id)) {
            await targetMember.roles.add(simpleRole, 'Kotbo StaffServer: Sync complète');
            synced++;
          } else if (!hasAnyStaffRole && targetMember.roles.cache.has(simpleRole.id)) {
            await targetMember.roles.remove(simpleRole, 'Kotbo StaffServer: Sync complète');
            synced++;
          }
        }
      }
    } catch (err) {
      errors++;
      logger.warn(TAG, `Erreur sync complète pour ${userId}`, err);
    }
  }

  return { synced, errors };
}
