import { AsyncLocalStorage } from 'node:async_hooks';

export interface GuildContext {
  guildId?: string;
  guildName?: string;
}

const key = Symbol.for('kotbo.guildContext');
if (!(key in globalThis)) {
  (globalThis as any)[key] = new AsyncLocalStorage<GuildContext>();
}

export const guildContextStorage: AsyncLocalStorage<GuildContext> = (globalThis as any)[key];

export function runWithGuildContext<T>(context: GuildContext, fn: () => T): T {
  return guildContextStorage.run(context, fn);
}

export function getGuildContext(): GuildContext | undefined {
  return guildContextStorage.getStore();
}
