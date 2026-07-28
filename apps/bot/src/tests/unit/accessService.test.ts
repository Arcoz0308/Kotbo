import { describe, expect, test, mock } from 'bun:test';
import path from 'node:path';

// `accessService` importe le client Prisma au chargement du module ; seules les
// fonctions pures sont testées ici, la base n'est jamais touchée.
const mockDb = {
  guild: {
    findUnique: mock(() => Promise.resolve(null as unknown)),
    findMany: mock(() => Promise.resolve([] as unknown[])),
    update: mock(() => Promise.resolve({} as unknown)),
  },
  activationCode: {
    findFirst: mock(() => Promise.resolve(null as unknown)),
  },
};

for (const dbPath of ['../../utils/db.ts', '../../utils/db.js']) {
  mock.module(path.resolve(__dirname, dbPath), () => ({
    default: mockDb,
    prisma: mockDb,
    prismaRead: mockDb,
  }));
}

import {
  buildAccessFields,
  computeExpiry,
  daysUntil,
  dueReminder,
  normalizeAccessGrant,
  reminderMilestones,
  MAX_ACCESS_DURATION_DAYS,
} from '../../services/system/accessService';

const MS_PER_DAY = 86_400_000;

describe('computeExpiry / daysUntil', () => {
  test('une période de 15 jours se termine 15 jours après son démarrage', () => {
    const from = new Date('2026-07-28T10:00:00.000Z');
    expect(computeExpiry(15, from).toISOString()).toBe('2026-08-12T10:00:00.000Z');
  });

  test('les jours restants sont arrondis au supérieur', () => {
    const now = new Date('2026-07-28T10:00:00.000Z');
    // 2 jours et 3 heures restants → on annonce 3 jours, jamais 2.
    expect(daysUntil(new Date(now.getTime() + 2 * MS_PER_DAY + 3 * 3_600_000), now)).toBe(3);
    expect(daysUntil(new Date(now.getTime() + 2 * MS_PER_DAY), now)).toBe(2);
  });

  test('une échéance dépassée ne renvoie jamais de valeur négative', () => {
    const now = new Date('2026-07-28T10:00:00.000Z');
    expect(daysUntil(new Date(now.getTime() - 5 * MS_PER_DAY), now)).toBe(0);
  });
});

describe('reminderMilestones', () => {
  test('une période de 15 jours notifie à mi-parcours, J-3 et J-1', () => {
    expect(reminderMilestones(15)).toEqual([7, 3, 1]);
  });

  test('les paliers s\'adaptent aux périodes courtes', () => {
    expect(reminderMilestones(30)).toEqual([15, 3, 1]);
    expect(reminderMilestones(7)).toEqual([3, 1]);
    expect(reminderMilestones(4)).toEqual([3, 2, 1]);
    expect(reminderMilestones(2)).toEqual([1]);
  });

  test('une période d\'un jour n\'envoie aucun rappel, seulement le message de fin', () => {
    expect(reminderMilestones(1)).toEqual([]);
  });

  test('aucun palier en double', () => {
    const milestones = reminderMilestones(6); // mi-parcours = 3, déjà dans la liste
    expect(milestones).toEqual([3, 1]);
  });
});

describe('dueReminder', () => {
  const milestones = [7, 3, 1];

  test('aucun rappel tant que le premier palier n\'est pas atteint', () => {
    expect(dueReminder(10, milestones, []).milestone).toBeNull();
  });

  test('déclenche le palier atteint et le mémorise', () => {
    const result = dueReminder(7, milestones, []);
    expect(result.milestone).toBe(7);
    expect(result.sent).toEqual([7]);
  });

  test('ne renvoie jamais deux fois le même palier', () => {
    expect(dueReminder(7, milestones, [7]).milestone).toBeNull();
    expect(dueReminder(6, milestones, [7]).milestone).toBeNull();
  });

  test('après un arrêt prolongé, envoie le bon message et solde les paliers dépassés', () => {
    // Bot hors ligne de J-8 à J-2 : on ne doit pas annoncer « plus que 7 jours ».
    const result = dueReminder(2, milestones, []);
    expect(result.milestone).toBe(3);
    expect(result.sent).toEqual([7, 3]);
  });

  test('le dernier palier passe bien après les précédents', () => {
    const result = dueReminder(1, milestones, [7, 3]);
    expect(result.milestone).toBe(1);
    expect(result.sent).toEqual([7, 3, 1]);
  });
});

describe('buildAccessFields', () => {
  const from = new Date('2026-07-28T10:00:00.000Z');

  test('un accès permanent n\'a pas de date de fin', () => {
    expect(buildAccessFields('PERMANENT', null, from)).toEqual({
      accessType: 'PERMANENT',
      accessExpiresAt: null,
      accessExpiredAt: null,
      accessRemindersSent: [],
    });
  });

  test('un essai pose la date de fin calculée', () => {
    const fields = buildAccessFields('TRIAL', 15, from);
    expect(fields.accessType).toBe('TRIAL');
    expect(fields.accessExpiresAt?.toISOString()).toBe('2026-08-12T10:00:00.000Z');
    expect(fields.accessRemindersSent).toEqual([]);
  });

  test('une durée nulle ou négative retombe sur un accès permanent', () => {
    expect(buildAccessFields('TRIAL', 0, from).accessType).toBe('PERMANENT');
    expect(buildAccessFields('TRIAL', -5, from).accessExpiresAt).toBeNull();
  });
});

describe('normalizeAccessGrant', () => {
  test('sans type explicite, l\'accès est permanent', () => {
    expect(normalizeAccessGrant(undefined, undefined)).toEqual({ accessType: 'PERMANENT', durationDays: null });
  });

  test('accepte un essai avec une durée entière', () => {
    expect(normalizeAccessGrant('trial', 15)).toEqual({ accessType: 'TRIAL', durationDays: 15 });
    expect(normalizeAccessGrant('SUBSCRIPTION', '30')).toEqual({ accessType: 'SUBSCRIPTION', durationDays: 30 });
  });

  test('refuse une durée absente, non entière ou hors bornes', () => {
    expect(normalizeAccessGrant('TRIAL', undefined)).toHaveProperty('error');
    expect(normalizeAccessGrant('TRIAL', 0)).toHaveProperty('error');
    expect(normalizeAccessGrant('TRIAL', 1.5)).toHaveProperty('error');
    expect(normalizeAccessGrant('TRIAL', MAX_ACCESS_DURATION_DAYS + 1)).toHaveProperty('error');
  });

  test('refuse un type inconnu', () => {
    expect(normalizeAccessGrant('LIFETIME', 30)).toHaveProperty('error');
  });
});
