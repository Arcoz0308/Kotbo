import { beforeEach, describe, expect, test } from 'bun:test';
import {
  acquireGuildScrapeLock,
  getActiveGuildScrape,
  ownsGuildScrapeLock,
  releaseGuildScrapeLock,
} from '../../services/analytics/guildScrapeLock';

describe('guildScrapeLock', () => {
  const guildId = 'guild-sync-test';

  beforeEach(() => {
    const existing = acquireGuildScrapeLock(guildId, 'full');
    if (existing) releaseGuildScrapeLock(existing);
  });

  test('serializes every scraper for the same guild', () => {
    const fullLock = acquireGuildScrapeLock(guildId, 'full');
    expect(fullLock).not.toBeNull();
    expect(getActiveGuildScrape(guildId)).toBe('full');

    expect(acquireGuildScrapeLock(guildId, 'members')).toBeNull();
    expect(acquireGuildScrapeLock(guildId, 'history')).toBeNull();

    releaseGuildScrapeLock(fullLock!);
    expect(getActiveGuildScrape(guildId)).toBeNull();
  });

  test('does not let an unrelated token release the active lock', () => {
    const lock = acquireGuildScrapeLock(guildId, 'members')!;
    const otherGuildLock = acquireGuildScrapeLock('other-guild', 'history')!;

    expect(ownsGuildScrapeLock(lock, guildId)).toBeTrue();
    expect(ownsGuildScrapeLock(otherGuildLock, guildId)).toBeFalse();

    releaseGuildScrapeLock(otherGuildLock);
    expect(getActiveGuildScrape(guildId)).toBe('members');

    releaseGuildScrapeLock(lock);
  });
});
