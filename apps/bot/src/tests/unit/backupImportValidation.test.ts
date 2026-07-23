import { describe, expect, test } from 'bun:test';
import { parseBackupImport } from '../../services/system/backupImportValidation.js';

const validExport = {
  version: '1.0',
  exportedAt: '2026-07-23T06:00:00.000Z',
  backup: {
    name: 'Sauvegarde test',
    serverName: 'Kotbo test',
    data: {
      roles: [{
        id: '123456789012345678',
        name: 'Modération',
        color: 0x5865F2,
        hoist: true,
        position: 2,
        permissions: '8',
        mentionable: false,
        icon: null,
        unicodeEmoji: null,
      }],
      channels: [{
        id: '223456789012345678',
        name: 'général',
        type: 0,
        parentId: null,
        position: 1,
        permissionOverwrites: [],
      }],
      members: [],
      emojis: [],
      stickers: [],
    },
    options: {
      includeRoles: true,
      includeChannels: true,
      includeMembers: false,
      includeMessages: false,
      includeEmojis: false,
      includeStickers: false,
    },
    stats: {
      rolesCount: 999_999,
      channelsCount: 999_999,
      membersCount: 999_999,
      messagesCount: 999_999,
      emojisCount: 999_999,
      stickersCount: 999_999,
      sizeBytes: 1,
    },
  },
};

describe('parseBackupImport', () => {
  test('valide un export et recalcule les compteurs non fiables', () => {
    const raw = JSON.stringify(validExport);
    const parsed = parseBackupImport(raw);

    expect(parsed.stats.rolesCount).toBe(1);
    expect(parsed.stats.channelsCount).toBe(1);
    expect(parsed.stats.membersCount).toBe(0);
    expect(parsed.stats.sizeBytes).toBe(Buffer.byteLength(raw));
    expect(parsed.options.includeMembers).toBe(false);
  });

  test('rejette un objet arbitraire qui imite seulement la structure externe', () => {
    expect(() => parseBackupImport(JSON.stringify({
      version: '1.0',
      backup: { data: { admin: true } },
    }))).toThrow('Structure de sauvegarde invalide');
  });

  test('rejette les champs inconnus au lieu de les stocker en base', () => {
    expect(() => parseBackupImport(JSON.stringify({
      ...validExport,
      backup: {
        ...validExport.backup,
        arbitraryDatabaseValue: true,
      },
    }))).toThrow('Unrecognized key');
  });

  test('rejette les médias distants hors du CDN Discord', () => {
    expect(() => parseBackupImport(JSON.stringify({
      ...validExport,
      backup: {
        ...validExport.backup,
        data: {
          ...validExport.backup.data,
          emojis: [{
            id: '323456789012345678',
            name: 'test',
            animated: false,
            available: true,
            url: 'https://127.0.0.1/private',
          }],
        },
      },
    }))).toThrow('CDN Discord');
  });
});
