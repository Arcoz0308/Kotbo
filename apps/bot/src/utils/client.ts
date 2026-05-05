import type { Client } from 'discord.js';

let clientInstance: Client | null = null;

export function setClient(client: Client) {
  clientInstance = client;
}

export function getClient(): Client {
  if (!clientInstance) {
    throw new Error('Discord client has not been initialized yet.');
  }
  return clientInstance;
}
