import { Client, Events, type GuildMember, type PartialGuildMember } from 'discord.js';
import { logger } from '../utils/logger.js';
import { syncMemberRoles } from '../services/staff/staffServerService.js';

export function registerStaffServerListener(client: Client): void {
  client.on(Events.GuildMemberUpdate, async (oldMember: GuildMember | PartialGuildMember, newMember: GuildMember) => {
    if (newMember.user.bot) return;

    const oldRoles = oldMember.partial
      ? []
      : [...oldMember.roles.cache.keys()];
    const newRoles = [...newMember.roles.cache.keys()];

    if (oldRoles.length === newRoles.length && oldRoles.every((r) => newRoles.includes(r))) return;

    try {
      await syncMemberRoles(newMember, oldRoles, newRoles, client);
    } catch (err) {
      logger.error('StaffServer', `Erreur sync rôles pour ${newMember.user.tag}`, err);
    }
  });

  logger.success('StaffServer', 'Écouteur StaffServer enregistré (guildMemberUpdate)');
}
