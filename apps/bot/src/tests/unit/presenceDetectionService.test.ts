import { describe, expect, test } from 'bun:test';
import { resolveOnlineMembersCount } from '../../services/presenceDetectionService';

describe('presenceDetectionService', () => {
  test('utilise le compte de presence approximate quand le cache dit 0 en ligne', async () => {
    let calls = 0;

    const onlineMembers = await resolveOnlineMembersCount({
      totalMembers: 42,
      onlineMembersFromCache: 0,
      fetchApproximatePresenceCount: async () => {
        calls += 1;
        return 11;
      },
    });

    expect(onlineMembers).toBe(11);
    expect(calls).toBe(1);
  });

  test('ne fait pas de fetch si le cache a deja des membres en ligne', async () => {
    let calls = 0;

    const onlineMembers = await resolveOnlineMembersCount({
      totalMembers: 42,
      onlineMembersFromCache: 7,
      fetchApproximatePresenceCount: async () => {
        calls += 1;
        return 11;
      },
    });

    expect(onlineMembers).toBe(7);
    expect(calls).toBe(0);
  });

  test('retourne le cache si le fetch de presence echoue', async () => {
    const onlineMembers = await resolveOnlineMembersCount({
      totalMembers: 42,
      onlineMembersFromCache: 0,
      fetchApproximatePresenceCount: async () => {
        throw new Error('boom');
      },
    });

    expect(onlineMembers).toBe(0);
  });
});