import { describe, expect, test } from 'bun:test';
import {
  advanceSession,
  createSession,
  deleteSession,
  getSession,
  sessionKey,
} from '../../handlers/keywordSessionStore';

describe('keywordSessionStore', () => {
  test('genere une cle stable', () => {
    expect(sessionKey('u1', 'i1')).toBe('u1::i1');
  });

  test('cree, lit, avance et supprime une session', () => {
    const key = sessionKey('user-a', 'item-a');

    createSession(key, {
      keywords: ['bun', 'typescript'],
      index: 0,
      feedId: 'feed-1',
      guildId: 'guild-1',
      mode: 'include',
      messageId: null,
    });

    const first = getSession(key);
    expect(first).toBeDefined();
    expect(first?.index).toBe(0);

    const next = advanceSession(key);
    expect(next?.index).toBe(1);

    deleteSession(key);
    expect(getSession(key)).toBeUndefined();
  });
});
