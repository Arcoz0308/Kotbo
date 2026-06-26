/**
 * Analytics Module — Bus-based subscriber
 *
 * Subscribes to KotboEventBus events and delegates to the existing
 * analytics + staff services. Runs independently of other modules;
 * if this module throws, leveling/moderation/etc. are unaffected.
 *
 * The legacy `registerAnalyticsListeners` (client.on) still runs in parallel
 * during the transition. Once validated, remove it and keep only this module.
 */

import type { Client } from 'discord.js';
import { kotboEventBus } from '@kotbo/core';
import {
  trackMessage,
  trackVoiceSession,
  trackMemberJoin,
  trackMemberLeave,
  trackReaction,
  trackThreadCreation,
  trackReply,
} from '../services/analytics/analyticsService.js';
import { logStaffVoiceSession } from '../services/staff/staffLeadershipService.js';
import { logger } from '../utils/logger.js';

const MODULE_NAME = 'analytics';

export function registerAnalyticsBusSubscribers(_client: Client): void {
  // ── Messages ──────────────────────────────────────────────────
  kotboEventBus.subscribe('message:new', async (payload) => {
    if (payload.isBot) return;

    await trackMessage(payload.guildId, payload.channelId, payload.authorId);
    if (payload.hasReference) {
      await trackReply(payload.guildId, payload.authorId);
    }
  }, MODULE_NAME);

  // ── Voice Sessions ────────────────────────────────────────────
  kotboEventBus.subscribe('voice:join', async (payload) => {
    await logStaffVoiceSession(
      payload.guildId,
      payload.userId,
      payload.channelId,
      payload.channelName,
      new Date(payload.timestamp),
    );
  }, MODULE_NAME);

  kotboEventBus.subscribe('voice:leave', async (payload) => {
    await logStaffVoiceSession(
      payload.guildId,
      payload.userId,
      payload.channelId,
      payload.channelName,
      payload.joinTimestamp ? new Date(payload.joinTimestamp) : new Date(),
      new Date(payload.timestamp),
    );

    if (payload.durationMs && payload.durationMs > 0) {
      const durationMinutes = Math.floor(payload.durationMs / 60000);
      if (durationMinutes > 0) {
        await trackVoiceSession(payload.guildId, payload.userId, durationMinutes);
      }
    }
  }, MODULE_NAME);

  kotboEventBus.subscribe('voice:move', async (payload) => {
    const now = new Date(payload.timestamp);
    await logStaffVoiceSession(
      payload.guildId,
      payload.userId,
      payload.fromChannelId,
      payload.fromChannelName,
      payload.joinTimestamp ? new Date(payload.joinTimestamp) : now,
      now,
    );
    await logStaffVoiceSession(
      payload.guildId,
      payload.userId,
      payload.toChannelId,
      payload.toChannelName,
      now,
    );
  }, MODULE_NAME);

  // ── Members ───────────────────────────────────────────────────
  kotboEventBus.subscribe('member:join', async (payload) => {
    if (payload.isBot) return;
    await trackMemberJoin(payload.guildId);
  }, MODULE_NAME);

  kotboEventBus.subscribe('member:leave', async (payload) => {
    if (payload.isBot) return;
    await trackMemberLeave(payload.guildId);
  }, MODULE_NAME);

  // ── Reactions ─────────────────────────────────────────────────
  kotboEventBus.subscribe('reaction:add', async (payload) => {
    await trackReaction(payload.guildId, payload.userId);
  }, MODULE_NAME);

  // ── Threads ───────────────────────────────────────────────────
  kotboEventBus.subscribe('thread:create', async (payload) => {
    if (payload.creatorId) {
      await trackThreadCreation(payload.guildId, payload.creatorId);
    }
  }, MODULE_NAME);

  logger.info('Modules', `Module "${MODULE_NAME}" enregistre sur le bus d'events.`);
}
