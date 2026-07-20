import { describe, expect, mock, test } from 'bun:test';
import path from 'node:path';

const prismaMock = {
  guild: { findMany: mock(async () => []), findUnique: mock(async () => null) },
  banHygieneRecord: {
    findMany: mock(async () => []),
    createMany: mock(async () => ({ count: 0 })),
    updateMany: mock(async () => ({ count: 0 })),
    update: mock(async () => ({})),
    count: mock(async () => 0),
  },
  staffMember: { findMany: mock(async () => []) },
};

// NOTE: ne pas mocker ../../utils/logger ici. mock.module est global au process
// et ce fichier s'exécute avant logger.test.ts (ordre alphabétique) : le mock
// fuiterait dans les tests du logger et les ferait échouer.
const moduleMocks: Array<[string, () => Record<string, unknown>]> = [
  ['../../utils/db', () => ({ default: prismaMock, prisma: prismaMock, prismaRead: prismaMock })],
  ['../../utils/auditLogger', () => ({ queueAuditLog: mock(() => undefined) })],
  ['../../utils/activation', () => ({ isGuildActivated: () => true })],
];

for (const [relativePath, factory] of moduleMocks) {
  mock.module(path.resolve(import.meta.dir, `${relativePath}.ts`), factory);
  mock.module(path.resolve(import.meta.dir, `${relativePath}.js`), factory);
}

const { isDeletedAccount } = await import('../../services/moderation/banHygieneService.js');

describe('isDeletedAccount', () => {
  test('reconnaît le format Discord des comptes supprimés', () => {
    expect(isDeletedAccount('deleted_user_a1b2c3d4')).toBeTrue();
    expect(isDeletedAccount('deleted_user_0123456789abcdef')).toBeTrue();
    // Discord n'est pas cohérent sur la casse selon l'ancienneté du compte
    expect(isDeletedAccount('Deleted_User_FF00AA')).toBeTrue();
  });

  test('reconnaît le format legacy "Deleted User"', () => {
    expect(isDeletedAccount('Deleted User')).toBeTrue();
    expect(isDeletedAccount('Deleted User 1234')).toBeTrue();
  });

  test('ne débannit pas un compte légitime au nom ressemblant', () => {
    // Le risque : un faux positif débannirait un vrai banni.
    expect(isDeletedAccount('deleted_user')).toBeFalse();
    expect(isDeletedAccount('deleted_user_')).toBeFalse();
    expect(isDeletedAccount('deleted_user_xyz')).toBeFalse(); // pas de l'hexa
    expect(isDeletedAccount('undeleted_user_abc123')).toBeFalse();
    expect(isDeletedAccount('deleted_userabc123')).toBeFalse();
    expect(isDeletedAccount('xdeleted_user_abc123')).toBeFalse();
  });

  test('laisse tranquilles les pseudos ordinaires', () => {
    expect(isDeletedAccount('Klaynight')).toBeFalse();
    expect(isDeletedAccount('user_deleted_files')).toBeFalse();
    expect(isDeletedAccount('mon_compte_deleted')).toBeFalse();
    expect(isDeletedAccount('')).toBeFalse();
  });
});
