/**
 * Tests unitaires pour resolveEventGuildId (garde d'activation centrale).
 */

import { describe, it, expect } from 'bun:test';
import { resolveEventGuildId } from '../../utils/eventGuild.js';

/** Reproduit une instance `Guild` : discord.js expose `name` et `roles`. */
function fakeGuild(id: string) {
  return { id, name: 'Serveur de test', roles: { cache: new Map() } };
}

describe('resolveEventGuildId', () => {
  it('lit `guild.id` sur le premier argument', () => {
    expect(resolveEventGuildId([{ id: 'msg-1', guild: { id: '111' } }])).toBe('111');
  });

  it('lit `guildId` sur le premier argument', () => {
    expect(resolveEventGuildId([{ id: 'interaction-1', guildId: '222' }])).toBe('222');
  });

  it('reconnaît une guilde passée en premier argument', () => {
    expect(resolveEventGuildId([fakeGuild('333')])).toBe('333');
  });

  it('reconnaît une guilde passée en second argument (GuildAuditLogEntryCreate)', () => {
    const auditLogEntry = { id: 'entry-1', action: 30, executorId: '999' };
    expect(resolveEventGuildId([auditLogEntry, fakeGuild('444')])).toBe('444');
  });

  it("retourne null quand aucun argument ne porte de serveur", () => {
    const user = { id: '555', username: 'kotbo' };
    expect(resolveEventGuildId([user, 'texte', null, undefined])).toBeNull();
  });

  it("n'assimile pas un utilisateur à une guilde", () => {
    expect(resolveEventGuildId([{ id: '666', username: 'kotbo', bot: false }])).toBeNull();
  });
});
