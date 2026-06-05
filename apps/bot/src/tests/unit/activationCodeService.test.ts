import { describe, expect, test, mock, beforeEach } from 'bun:test';
import path from 'node:path';

// Mock the database dependency
const mockDb = {
  activationCode: {
    update: mock(() => Promise.resolve({} as any)) as any,
    findFirst: mock(() => Promise.resolve(null as any)) as any,
    findUnique: mock(() => Promise.resolve(null as any)) as any,
    delete: mock(() => Promise.resolve({} as any)) as any,
  },
  guild: {
    findMany: mock(() => Promise.resolve([] as any[])) as any,
    findUnique: mock(() => Promise.resolve(null as any)) as any,
    update: mock(() => Promise.resolve({} as any)) as any,
    upsert: mock(() => Promise.resolve({} as any)) as any,
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
    mockDb.activationCode.update.mockResolvedValue({});
    mockDb.guild.upsert.mockResolvedValue({});

    await activateGuild('guild-123', 'KB-TEST-CODE');

    expect(mockDb.activationCode.update).toHaveBeenCalledWith({
      where: { code: 'KB-TEST-CODE' },
      data: {
        usedAt: expect.any(Date),
        usedByGuildId: 'guild-123',
        isActive: false
      }
    });

    expect(mockDb.guild.upsert).toHaveBeenCalledWith({
      where: { id: 'guild-123' },
      update: {
        activated: true,
        activatedAt: expect.any(Date),
        activationCode: 'KB-TEST-CODE'
      },
      create: {
        id: 'guild-123',
        activated: true,
        activatedAt: expect.any(Date),
        activationCode: 'KB-TEST-CODE'
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
        activationCode: null
      }
    });

    expect(isGuildActivated('guild-123')).toBeFalse();
  });
});
