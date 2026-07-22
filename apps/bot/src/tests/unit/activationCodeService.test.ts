import { describe, expect, test, mock, beforeEach } from 'bun:test';
import path from 'node:path';

// Mock the database dependency
const mockDb = {
  activationCode: {
    update: mock(() => Promise.resolve({} as unknown)) as unknown,
    findFirst: mock(() => Promise.resolve(null as unknown)) as unknown,
    findUnique: mock(() => Promise.resolve(null as unknown)) as unknown,
    delete: mock(() => Promise.resolve({} as unknown)) as unknown,
  },
  guild: {
    findMany: mock(() => Promise.resolve([] as unknown[])) as unknown,
    findUnique: mock(() => Promise.resolve(null as unknown)) as unknown,
    update: mock(() => Promise.resolve({} as unknown)) as unknown,
    upsert: mock(() => Promise.resolve({} as unknown)) as unknown,
  },
  staffServerLink: {
    findMany: mock(() => Promise.resolve([] as unknown[])) as unknown,
  },
  $transaction: mock(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockDb)) as unknown,
};

const dbPath = path.resolve(__dirname, '../../utils/db.ts');
const dbJsPath = path.resolve(__dirname, '../../utils/db.js');

mock.module(dbPath, () => ({
  default: mockDb,
  prisma: mockDb,
  prismaRead: mockDb,
}));

mock.module(dbJsPath, () => ({
  default: mockDb,
  prisma: mockDb,
  prismaRead: mockDb,
}));

import {
  activatedGuilds,
  loadActivatedGuilds,
  isGuildActivated,
  activateGuild,
  deactivateGuild
} from '../../utils/activation';

describe('activation service', () => {
  beforeEach(() => {
    mockDb.activationCode.update.mockClear();
    mockDb.activationCode.findFirst.mockClear();
    mockDb.activationCode.findUnique.mockClear();
    mockDb.activationCode.delete.mockClear();
    mockDb.guild.findMany.mockClear();
    mockDb.guild.findUnique.mockClear();
    mockDb.guild.update.mockClear();
    mockDb.guild.upsert.mockClear();
    (mockDb.staffServerLink.findMany as ReturnType<typeof mock>).mockClear();
    (mockDb.$transaction as ReturnType<typeof mock>).mockClear();
    (mockDb.$transaction as ReturnType<typeof mock>).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockDb));
    activatedGuilds.clear();
  });

  test('loadActivatedGuilds should populate the activatedGuilds Set from DB', async () => {
    mockDb.guild.findMany.mockResolvedValue([
      { id: 'guild-1' },
      { id: 'guild-2' }
    ]);

    await loadActivatedGuilds();

    expect(activatedGuilds.size).toBe(2);
    expect(isGuildActivated('guild-1')).toBeTrue();
    expect(isGuildActivated('guild-2')).toBeTrue();
    expect(isGuildActivated('guild-3')).toBeFalse();
    expect(mockDb.guild.findMany).toHaveBeenCalled();
  });

  test('activateGuild should update DB activation code, upsert guild, and add to cache', async () => {
    mockDb.activationCode.findUnique.mockResolvedValue({ code: 'KB-TEST-CODE', isActive: true, usedAt: null });
    mockDb.activationCode.update.mockResolvedValue({});
    mockDb.guild.upsert.mockResolvedValue({});

    await activateGuild('guild-123', 'KB-TEST-CODE');

    expect(mockDb.activationCode.update).toHaveBeenCalledWith({
      where: { code: 'KB-TEST-CODE' },
      data: {
        usedAt: expect.any(Date),
        usedByGuildId: 'guild-123',
        isActive: false,
      }
    });

    expect(mockDb.guild.upsert).toHaveBeenCalledWith({
      where: { id: 'guild-123' },
      update: {
        activated: true,
        activatedAt: expect.any(Date),
        activationCode: expect.any(String),
        activatedViaStaffLink: false,
      },
      create: {
        id: 'guild-123',
        activated: true,
        activatedAt: expect.any(Date),
        activationCode: expect.any(String),
        activatedViaStaffLink: false,
      }
    });

    expect(isGuildActivated('guild-123')).toBeTrue();
  });

  test('deactivateGuild should set active to false in DB and delete from cache', async () => {
    mockDb.guild.findUnique.mockResolvedValue({ activationCode: 'KB-TEST-CODE' });
    mockDb.activationCode.update.mockResolvedValue({});
    mockDb.guild.update.mockResolvedValue({});
    
    activatedGuilds.add('guild-123');

    await deactivateGuild('guild-123');

    expect(mockDb.activationCode.update).toHaveBeenCalledWith({
      where: { code: 'KB-TEST-CODE' },
      data: {
        usedAt: null,
        usedByGuildId: null,
        isActive: true
      }
    });

    expect(mockDb.guild.update).toHaveBeenCalledWith({
      where: { id: 'guild-123' },
      data: {
        activated: false,
        activatedAt: null,
        activationCode: null,
        activatedViaStaffLink: false,
      }
    });

    expect(isGuildActivated('guild-123')).toBeFalse();
  });
});
