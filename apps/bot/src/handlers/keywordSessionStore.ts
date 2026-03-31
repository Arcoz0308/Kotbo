/**
 * In-memory session store for keyword moderation dialogs.
 * Each session stores the keywords to review and the current index.
 * Sessions expire after 10 minutes of inactivity.
 */

export interface KeywordSession {
  keywords: string[];
  index: number;
  feedId: string;
  guildId: string;
  /** 'exclude' for rejected articles, 'include' for approved articles */
  mode: 'exclude' | 'include';
  messageId: string | null;
  expiresAt: number;
}

const sessions = new Map<string, KeywordSession>();

const TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Session key: userId + itemId */
export function sessionKey(userId: string, itemId: string): string {
  return `${userId}::${itemId}`;
}

export function createSession(
  key: string,
  data: Omit<KeywordSession, 'expiresAt'>,
): KeywordSession {
  const session: KeywordSession = { ...data, expiresAt: Date.now() + TTL_MS };
  sessions.set(key, session);
  return session;
}

export function getSession(key: string): KeywordSession | undefined {
  const s = sessions.get(key);
  if (!s) return undefined;
  if (Date.now() > s.expiresAt) {
    sessions.delete(key);
    return undefined;
  }
  s.expiresAt = Date.now() + TTL_MS; // refresh TTL on access
  return s;
}

export function deleteSession(key: string): void {
  sessions.delete(key);
}

export function advanceSession(key: string): KeywordSession | undefined {
  const s = getSession(key);
  if (!s) return undefined;
  s.index += 1;
  return s;
}
