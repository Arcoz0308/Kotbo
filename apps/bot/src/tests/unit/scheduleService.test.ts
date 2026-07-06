/* eslint-disable */
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import path from 'node:path';

// Mock DB
const mockDb = {
  scheduledTask: {
    findMany: mock(() => Promise.resolve([] as any[])) as any,
    findUnique: mock(() => Promise.resolve(null as any)) as any,
    update: mock(() => Promise.resolve({} as any)) as any,
    create: mock(() => Promise.resolve({} as any)) as any,
    delete: mock(() => Promise.resolve({} as any)) as any,
  },
  memberProfile: {
    findMany: mock(() => Promise.resolve([])) as any,
  },
  sanction: {
    findMany: mock(() => Promise.resolve([])) as any,
  },
  ticket: {
    findMany: mock(() => Promise.resolve([])) as any,
  },
  suggestions: {
    findMany: mock(() => Promise.resolve([])) as any,
  },
  memberLevel: {
    findMany: mock(() => Promise.resolve([])) as any,
  }
};

const dbPath = path.resolve(__dirname, '../../utils/db.ts');
const dbJsPath = path.resolve(__dirname, '../../utils/db.js');

mock.module(dbPath, () => ({
  default: mockDb,
  prisma: mockDb
}));

mock.module(dbJsPath, () => ({
  default: mockDb,
  prisma: mockDb
}));

import { initializeScheduler, executeSchedule } from '../../services/system/scheduleService';

describe('schedule service', () => {
  beforeEach(() => {
    mockDb.scheduledTask.findMany.mockClear();
    mockDb.scheduledTask.findUnique.mockClear();
    mockDb.scheduledTask.update.mockClear();
  });

  test('initializeScheduler should fetch active tasks', async () => {
    mockDb.scheduledTask.findMany.mockResolvedValue([
      { id: 'task-1', name: 'Task 1', type: 'SERVER_BACKUP', cron: '0 0 * * *', enabled: true },
      { id: 'task-2', name: 'Task 2', type: 'CHANNEL_RESET', cron: '0 * * * *', enabled: true },
    ]);

    const mockClient = {
      guilds: {
        cache: new Map(),
        fetch: mock(() => Promise.resolve(null))
      }
    } as any;

    await initializeScheduler(mockClient);

    expect(mockDb.scheduledTask.findMany).toHaveBeenCalledWith({
      where: { enabled: true }
    });
  });

  test('executeSchedule resets channel when type is CHANNEL_RESET', async () => {
    const mockChannel = {
      id: 'chan-1',
      name: 'general',
      isThread: () => false,
      clone: mock(() => Promise.resolve({
        isTextBased: () => true,
        send: mock(() => Promise.resolve({}))
      })),
      delete: mock(() => Promise.resolve({}))
    };

    const mockGuild = {
      id: 'guild-1',
      name: 'Test Guild',
      channels: {
        fetch: mock(() => Promise.resolve(mockChannel))
      }
    };

    const mockClient = {
      guilds: {
        cache: new Map([['guild-1', mockGuild]]),
        fetch: mock(() => Promise.resolve(mockGuild))
      }
    } as any;

    mockDb.scheduledTask.findUnique.mockResolvedValue({
      id: 'task-123',
      guildId: 'guild-1',
      name: 'Reset General',
      type: 'CHANNEL_RESET',
      cron: '0 0 * * *',
      targetId: 'chan-1',
      enabled: true
    });

    mockDb.scheduledTask.update.mockResolvedValue({});

    await executeSchedule(mockClient, 'task-123');

    expect(mockChannel.clone).toHaveBeenCalled();
    expect(mockChannel.delete).toHaveBeenCalled();
    expect(mockDb.scheduledTask.update).toHaveBeenCalled();
  });
});
