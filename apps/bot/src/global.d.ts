import { IncomingMessage } from 'node:http';

declare module 'node:http' {
  interface IncomingMessage {
    bodyText?: string;
  }
}

declare global {
  var KOTBO_MAINTENANCE_MODE: boolean;
  var KOTBO_BLACKLIST: Set<string>;
  var KOTBO_WS_BROADCASTER: ((guildId: string, reason: string) => void) | undefined;
}

export {};
