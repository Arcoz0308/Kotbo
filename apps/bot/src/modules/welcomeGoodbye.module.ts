/**
 * Welcome/Goodbye Module — Bus-based subscriber
 *
 * Handles member join/leave/boost events via the bus.
 * Some operations (applyJoinAutoRole, applyTagAutoRole) need the full
 * GuildMember object, so they fetch from Discord cache/API as needed.
 *
 * UserUpdate (global username change) stays on client.on() because
 * it doesn't map to a bus event type (it's cross-guild).
 */

import type { Client } from 'discord.js';
import { Events } from 'discord.js';
import { kotboEventBus } from '@kotbo/core';
import {
  handleGuildMemberAdd,
  handleGuildMemberRemove,
  handleGuildBoost,
  applyJoinAutoRole,
  applyTagAutoRole,
} from '../services/features/welcomeGoodbyeService.js';
import { checkMemberCountTriggers } from '../services/core/ctfTriggerService.js';
import { logger } from '../utils/logger.js';

const MODULE_NAME = 'welcome-goodbye';

export function registerWelcomeGoodbyeBusSubscribers(client: Client): void {
  // ── Member Join ───────────────────────────────────────────────
  kotboEventBus.subscribe('member:join', async (payload) => {
    if (payload.isBot) return;

    const guild = client.guilds.cache.get(payload.guildId);
    if (!guild) return;

    const member = guild.members.cache.get(payload.userId)
      ?? await guild.members.fetch(payload.userId).catch(() => null);
    if (!member) return;

    await applyJoinAutoRole(member);
    await applyTagAutoRole(member);
    await handleGuildMemberAdd(member, client);
    await checkMemberCountTriggers(guild, client);
  }, MODULE_NAME);

  // ── Member Leave ──────────────────────────────────────────────
  kotboEventBus.subscribe('member:leave', async (payload) => {
    const guild = client.guilds.cache.get(payload.guildId);
    if (!guild) return;

    const partialMember = {
      id: payload.userId,
      guild,
      user: { id: payload.userId, tag: payload.userTag, bot: payload.isBot },
    };

    await handleGuildMemberRemove(partialMember, client);
  }, MODULE_NAME);

  // ── Member Update (boost detection) ───────────────────────────
  kotboEventBus.subscribe('member:update', async (payload) => {
    if (!payload.isBoosting) return;

    const guild = client.guilds.cache.get(payload.guildId);
    if (!guild) return;

    const member = guild.members.cache.get(payload.userId)
      ?? await guild.members.fetch(payload.userId).catch(() => null);
    if (!member) return;

    await handleGuildBoost(member, client);
  }, MODULE_NAME);

  // ── Nickname changes for tag auto-role (via member:update) ────
  kotboEventBus.subscribe('member:update', async (payload) => {
    if (payload.oldNickname === payload.newNickname) return;

    const guild = client.guilds.cache.get(payload.guildId);
    if (!guild) return;

    const member = guild.members.cache.get(payload.userId)
      ?? await guild.members.fetch(payload.userId).catch(() => null);
    if (!member) return;

    await applyTagAutoRole(member);
  }, MODULE_NAME);

  // ── UserUpdate (global username change) — stays on client.on ──
  client.on(Events.UserUpdate, async (oldUser, newUser) => {
    if (oldUser.username === newUser.username) return;

    const mutualGuilds = client.guilds.cache.filter((g) => g.members.cache.has(newUser.id));
    const fetches = mutualGuilds.map(async (guild) => {
      const member = guild.members.cache.get(newUser.id)
        ?? await guild.members.fetch(newUser.id).catch(() => null);
      if (member) await applyTagAutoRole(member);
    });
    await Promise.all(fetches);
  });

  logger.info('Modules', `Module "${MODULE_NAME}" enregistre sur le bus d'events.`);
}
