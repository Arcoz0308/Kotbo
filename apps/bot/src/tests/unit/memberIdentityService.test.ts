import { describe, expect, mock, test, beforeEach } from 'bun:test';
import { Collection } from 'discord.js';
import path from 'node:path';

type UpdateManyArgs = {
  where?: { guildId?: string; userId?: string; username?: null };
  data?: { username?: string; displayName?: string; avatarUrl?: string };
};

const mockDb = {
  memberProfile: {
    updateMany: mock(async (_args: UpdateManyArgs) => ({ count: 1 })),
  },
};

const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  success: () => {},
  debug: () => {},
};

for (const suffix of ['../../utils/db.ts', '../../utils/db.js']) {
  mock.module(path.resolve(__dirname, suffix), () => ({
    default: mockDb,
    prisma: mockDb,
    prismaRead: mockDb,
  }));
}

for (const suffix of ['../../utils/logger.ts', '../../utils/logger.js']) {
  mock.module(path.resolve(__dirname, suffix), () => ({
    logger: silentLogger,
  }));
}

const { resolveMissingMemberIdentities } = await import('../../services/moderation/memberIdentityService');

function cachedMember(id: string, username: string) {
  return {
    id,
    displayName: `Surnom ${username}`,
    user: {
      id,
      username,
      globalName: null,
      displayAvatarURL: () => `https://cdn.example/${id}.png`,
    },
  };
}

function createClient(cached: Array<ReturnType<typeof cachedMember>>) {
  const memberCache = new Collection<string, ReturnType<typeof cachedMember>>();
  for (const member of cached) memberCache.set(member.id, member);

  const guildMembersFetch = mock(async () => memberCache);
  const usersFetch = mock(async (userId: string) => ({
    id: userId,
    username: `parti-${userId}`,
    globalName: null,
    displayAvatarURL: () => `https://cdn.example/${userId}.png`,
  }));

  const guild = {
    id: 'guild-1',
    members: { cache: memberCache, fetch: guildMembersFetch },
  };

  const client = {
    guilds: { cache: new Collection([[guild.id, guild]]) },
    users: { fetch: usersFetch },
  };

  return { client, guildMembersFetch, usersFetch };
}

describe('resolveMissingMemberIdentities', () => {
  beforeEach(() => {
    mockDb.memberProfile.updateMany.mockClear();
  });

  test("ne contacte pas Discord quand aucune identité ne manque", async () => {
    const { client, guildMembersFetch, usersFetch } = createClient([]);

    const identities = await resolveMissingMemberIdentities(client as never, 'guild-1', []);

    expect(identities.size).toBe(0);
    expect(guildMembersFetch).not.toHaveBeenCalled();
    expect(usersFetch).not.toHaveBeenCalled();
    expect(mockDb.memberProfile.updateMany).not.toHaveBeenCalled();
  });

  test('nomme un membre présent depuis le cache du serveur', async () => {
    const { client, usersFetch } = createClient([cachedMember('user-1', 'kotbo')]);

    const identities = await resolveMissingMemberIdentities(client as never, 'guild-1', ['user-1']);

    expect(identities.get('user-1')).toEqual({
      username: 'kotbo',
      displayName: 'Surnom kotbo',
      avatarUrl: 'https://cdn.example/user-1.png',
    });
    expect(usersFetch).not.toHaveBeenCalled();
  });

  test("nomme un membre parti via l'API utilisateur", async () => {
    const { client, usersFetch } = createClient([]);

    const identities = await resolveMissingMemberIdentities(client as never, 'guild-1', ['user-9']);

    expect(usersFetch).toHaveBeenCalledWith('user-9');
    expect(identities.get('user-9')?.username).toBe('parti-user-9');
  });

  test("n'écrase que les profils dépourvus de pseudo", async () => {
    const { client } = createClient([cachedMember('user-1', 'kotbo')]);

    await resolveMissingMemberIdentities(client as never, 'guild-1', ['user-1']);
    // La persistance est lancée en arrière-plan.
    await Promise.resolve();
    await Promise.resolve();

    const call = mockDb.memberProfile.updateMany.mock.calls[0]?.[0];
    expect(call?.where).toEqual({ guildId: 'guild-1', userId: 'user-1', username: null });
    expect(call?.data?.username).toBe('kotbo');
  });
});
