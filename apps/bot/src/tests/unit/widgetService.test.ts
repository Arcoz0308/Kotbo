import { beforeEach, describe, expect, mock, test } from 'bun:test';
import path from 'node:path';

const userId = '123456789012345678';
const guildId = '987654321098765432';

const mockDb = {
  memberProfile: {
    findFirst: mock(() => Promise.resolve({
      username: 'kotbo-user',
      messageCount: 42,
      voiceTimeSeconds: 600,
    })),
  },
  memberLevel: {
    findFirst: mock(() => Promise.resolve({ xp: 100 })),
  },
  staffActivity: {
    findMany: mock(() => Promise.resolve([])),
  },
};

const guild = {
  memberCount: 100,
  name: 'Kotbo Test',
  vanityURLCode: 'kotbo-test',
  iconURL: () => 'https://cdn.example/icon.png',
  splashURL: () => null,
  bannerURL: () => null,
  members: {
    cache: new Map([[userId, { user: { username: 'discord-user' } }]]),
  },
  invites: {
    fetch: mock(() => Promise.resolve(new Map())),
  },
};

const moduleMocks: Array<[string, () => Record<string, unknown>]> = [
  ['../../utils/db', () => ({ default: mockDb, prisma: mockDb })],
  ['../../utils/logger', () => ({
    logger: {
      info: mock(() => undefined),
      warn: mock(() => undefined),
      error: mock(() => undefined),
    },
  })],
  ['../../utils/client', () => ({
    getClient: () => ({ guilds: { cache: new Map([[guildId, guild]]) } }),
  })],
  ['../../services/staff/staffManagementService', () => ({
    getStaffMember: mock(() => Promise.resolve({
      id: 'staff-id',
      grade: 'ADMIN',
      joinedStaffAt: new Date('2026-01-01T00:00:00Z'),
    })),
  })],
  ['../../services/progression/levelingService', () => ({
    getLevelFromXp: () => 3,
  })],
];

for (const [relativePath, factory] of moduleMocks) {
  const tsPath = path.resolve(import.meta.dir, `${relativePath}.ts`);
  const jsPath = path.resolve(import.meta.dir, `${relativePath}.js`);
  mock.module(tsPath, factory);
  mock.module(jsPath, factory);
}

const fetchMock = mock(async () => new Response(null, { status: 204 }));
globalThis.fetch = fetchMock as unknown as typeof fetch;

const { pushWidgetForUser } = await import('../../services/integrations/widgetService.js');

describe('widgetService identities', () => {
  beforeEach(() => {
    process.env.DISCORD_TOKEN = 'test-token';
    process.env.DISCORD_CLIENT_ID = 'test-app';
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => new Response(null, { status: 204 }));
  });

  test('uses a unique identity and includes the external username', async () => {
    const result = await pushWidgetForUser(guildId, userId);

    expect(result).toEqual({ ok: true });
    expect(String(fetchMock.mock.calls[0]?.[0])).toEndWith(`/users/${userId}/identities/${userId}/profile`);

    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(options.body));
    expect(payload.username).toBe('discord-user');
  });

  test('falls back to identity 0 only for the legacy user', async () => {
    fetchMock
      .mockImplementationOnce(async () => new Response(
        JSON.stringify({ code: 40113, message: 'Multi identity disabled' }),
        { status: 400 },
      ))
      .mockImplementationOnce(async () => new Response(null, { status: 204 }));

    const result = await pushWidgetForUser(guildId, userId);

    expect(result).toEqual({ ok: true });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(`/identities/${userId}/profile`);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/identities/0/profile');
  });

  test('reports identity collisions instead of blaming OAuth authorization', async () => {
    fetchMock.mockImplementationOnce(async () => new Response(
      JSON.stringify({ code: 40106, message: 'Identity already belongs to another user' }),
      { status: 400 },
    ));

    const result = await pushWidgetForUser(guildId, userId);

    expect(result.ok).toBeFalse();
    expect(result.error).toContain('déjà liée à un autre compte Discord');
    expect(result.error).not.toContain('autoriser');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
