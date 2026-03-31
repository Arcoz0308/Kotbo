import { Collection } from 'discord.js';

interface NewsSession {
  url: string;
  metadata: {
    title: string | null;
    description: string | null;
    imageUrl: string | null;
    rssUrl: string | null;
  };
  guildId: string;
  userId: string;
  expiresAt: number;
}

const sessions = new Collection<string, NewsSession>();

export function createNewsSession(id: string, data: Omit<NewsSession, 'expiresAt'>): void {
  sessions.set(id, { ...data, expiresAt: Date.now() + 10 * 60 * 1000 }); // 10 minutes
}

export function getNewsSession(id: string): NewsSession | undefined {
  const session = sessions.get(id);
  if (session && session.expiresAt > Date.now()) {
    return session;
  }
  sessions.delete(id);
  return undefined;
}

export function deleteNewsSession(id: string): void {
  sessions.delete(id);
}

// Cleanup expired sessions every minute
setInterval(() => {
  const now = Date.now();
  sessions.sweep((s) => s.expiresAt < now);
}, 60 * 1000);
