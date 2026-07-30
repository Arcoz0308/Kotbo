export type GuildScrapeOperation = 'members' | 'history' | 'full';

export interface GuildScrapeLock {
  readonly guildId: string;
  readonly operation: GuildScrapeOperation;
  readonly token: symbol;
}

const activeScrapes = new Map<string, GuildScrapeLock>();

export function acquireGuildScrapeLock(
  guildId: string,
  operation: GuildScrapeOperation,
): GuildScrapeLock | null {
  if (activeScrapes.has(guildId)) return null;

  const lock: GuildScrapeLock = {
    guildId,
    operation,
    token: Symbol(`${operation}:${guildId}`),
  };
  activeScrapes.set(guildId, lock);
  return lock;
}

export function ownsGuildScrapeLock(lock: GuildScrapeLock, guildId: string): boolean {
  return lock.guildId === guildId && activeScrapes.get(guildId)?.token === lock.token;
}

export function releaseGuildScrapeLock(lock: GuildScrapeLock): void {
  if (activeScrapes.get(lock.guildId)?.token === lock.token) {
    activeScrapes.delete(lock.guildId);
  }
}

export function getActiveGuildScrape(guildId: string): GuildScrapeOperation | null {
  return activeScrapes.get(guildId)?.operation ?? null;
}
