import { describe, expect, test, mock, beforeEach } from 'bun:test';
import path from 'node:path';

type UpdateManyArgs = {
  where: { guildId: string; userId: { in: string[] } };
  data: Record<string, unknown>;
};

const updateMany = mock((_args: UpdateManyArgs): Promise<unknown> => Promise.resolve({ count: 1 }));
const mockDb = { memberProfile: { updateMany } };

const dbPath = path.resolve(import.meta.dir, '../../utils/db.ts');
const dbJsPath = path.resolve(import.meta.dir, '../../utils/db.js');
mock.module(dbPath, () => ({ default: mockDb, prisma: mockDb, prismaRead: mockDb }));
mock.module(dbJsPath, () => ({ default: mockDb, prisma: mockDb, prismaRead: mockDb }));

const {
  trackGhostSignal,
  trackDashboardVisit,
  flushGhostSignals,
  __resetGhostBuffer,
  __ghostBufferSize,
} = await import('../../services/analytics/ghostActivityTracker');

beforeEach(() => {
  __resetGhostBuffer();
  updateMany.mockClear();
});

describe('trackGhostSignal', () => {
  test('bufferise sans écrire immédiatement en base', () => {
    trackGhostSignal('guild-1', 'user-1', 'reaction');
    expect(__ghostBufferSize()).toBe(1);
    expect(updateMany).not.toHaveBeenCalled();
  });

  test('regroupe plusieurs signaux d\'un même membre sur une seule entrée', () => {
    trackGhostSignal('guild-1', 'user-1', 'reaction');
    trackGhostSignal('guild-1', 'user-1', 'interaction');
    trackGhostSignal('guild-1', 'user-1', 'interaction');
    expect(__ghostBufferSize()).toBe(1);
  });

  test('sépare les membres et les serveurs', () => {
    trackGhostSignal('guild-1', 'user-1', 'reaction');
    trackGhostSignal('guild-1', 'user-2', 'reaction');
    trackGhostSignal('guild-2', 'user-1', 'reaction');
    expect(__ghostBufferSize()).toBe(3);
  });

  test('ignore les identifiants manquants', () => {
    trackGhostSignal('', 'user-1', 'reaction');
    trackGhostSignal('guild-1', '', 'reaction');
    expect(__ghostBufferSize()).toBe(0);
  });
});

describe('flushGhostSignals', () => {
  test('ne déclenche aucune requête quand le buffer est vide', async () => {
    await flushGhostSignals();
    expect(updateMany).not.toHaveBeenCalled();
  });

  test('vide le buffer après écriture', async () => {
    trackGhostSignal('guild-1', 'user-1', 'reaction');
    await flushGhostSignals();
    expect(__ghostBufferSize()).toBe(0);
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  test('regroupe en une requête les membres partageant la même mise à jour', async () => {
    const at = new Date('2026-07-29T12:00:00.000Z');
    trackGhostSignal('guild-1', 'user-1', 'reaction', at);
    trackGhostSignal('guild-1', 'user-2', 'reaction', at);
    trackGhostSignal('guild-1', 'user-3', 'reaction', at);

    await flushGhostSignals();

    expect(updateMany).toHaveBeenCalledTimes(1);
    const call = updateMany.mock.calls[0][0];
    expect(call.where.userId.in).toEqual(['user-1', 'user-2', 'user-3']);
    expect(call.data.lastReactionAt).toEqual(at);
    expect(call.data.interactionCount).toEqual({ increment: 1 });
  });

  test('sépare les membres dont le compteur d\'interactions diffère', async () => {
    const at = new Date('2026-07-29T12:00:00.000Z');
    trackGhostSignal('guild-1', 'user-1', 'interaction', at);
    trackGhostSignal('guild-1', 'user-2', 'interaction', at);
    trackGhostSignal('guild-1', 'user-2', 'interaction', at);

    await flushGhostSignals();

    expect(updateMany).toHaveBeenCalledTimes(2);
  });

  test('une écriture en échec ne fait pas remonter d\'exception', async () => {
    updateMany.mockImplementationOnce(() => Promise.reject(new Error('base indisponible')));
    trackGhostSignal('guild-1', 'user-1', 'reaction');
    await flushGhostSignals();
    expect(__ghostBufferSize()).toBe(0);
  });
});

describe('trackDashboardVisit', () => {
  test('enregistre la première visite', () => {
    trackDashboardVisit('guild-1', 'user-1');
    expect(__ghostBufferSize()).toBe(1);
  });

  test('ignore les visites répétées dans l\'heure', () => {
    // Le dashboard émet des dizaines de requêtes par session : une seule doit
    // être retenue par couple membre/serveur.
    trackDashboardVisit('guild-1', 'user-2');
    trackDashboardVisit('guild-1', 'user-2');
    trackDashboardVisit('guild-1', 'user-2');
    expect(__ghostBufferSize()).toBe(1);
  });

  test('n\'incrémente pas le compteur d\'interactions', async () => {
    trackDashboardVisit('guild-1', 'user-9');
    await flushGhostSignals();
    const call = updateMany.mock.calls[0][0];
    expect(call.data.lastDashboardLoginAt).toBeInstanceOf(Date);
    expect(call.data.interactionCount).toBeUndefined();
  });
});
