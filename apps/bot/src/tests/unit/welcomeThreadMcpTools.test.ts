import { describe, expect, mock, test } from 'bun:test';
import path from 'node:path';

const moduleMocks: Array<[string, () => Record<string, unknown>]> = [
  ['../../utils/db', () => ({ default: {}, prisma: {}, prismaRead: {} })],
  ['../../utils/logger', () => ({
    logger: {
      info: mock(() => undefined),
      warn: mock(() => undefined),
      error: mock(() => undefined),
      debug: mock(() => undefined),
    },
  })],
];

for (const [relativePath, factory] of moduleMocks) {
  const tsPath = path.resolve(import.meta.dir, `${relativePath}.ts`);
  const jsPath = path.resolve(import.meta.dir, `${relativePath}.js`);
  mock.module(tsPath, factory);
  mock.module(jsPath, factory);
}

const { validateMenuPageDraft, checkExclusiveGroups, normalizeRoleGroupKey } = await import(
  '../../api/mcp/tools/write-welcome-thread.js'
);

type Draft = Parameters<typeof validateMenuPageDraft>[0];

function makeDraft(overrides: Partial<Draft> = {}): Draft {
  return {
    label: 'Règlement',
    actionType: 'EMBED',
    roleId: null,
    roleAction: 'ADD',
    roleGroup: null,
    linkUrl: null,
    embedTitle: 'Le règlement',
    embedDescription: 'Merci de le lire.',
    ...overrides,
  };
}

describe('validateMenuPageDraft', () => {
  test('accepte une page embed complète', () => {
    expect(validateMenuPageDraft(makeDraft())).toEqual({ ok: true });
  });

  test('refuse un label vide', () => {
    const result = validateMenuPageDraft(makeDraft({ label: '   ' }));
    expect(result.ok).toBe(false);
  });

  test('refuse une page embed sans titre ni description', () => {
    expect(validateMenuPageDraft(makeDraft({ embedTitle: null })).ok).toBe(false);
    expect(validateMenuPageDraft(makeDraft({ embedDescription: '' })).ok).toBe(false);
  });

  test('refuse une page rôle sans rôle', () => {
    const result = validateMenuPageDraft(makeDraft({ actionType: 'ROLE', roleId: null }));
    expect(result.ok).toBe(false);
  });

  test('refuse un rôle exclusif sans groupe, accepte avec groupe', () => {
    const base = makeDraft({ actionType: 'ROLE', roleId: '1', roleAction: 'EXCLUSIVE' });
    expect(validateMenuPageDraft(base).ok).toBe(false);
    expect(validateMenuPageDraft({ ...base, roleGroup: 'Couleur' })).toEqual({ ok: true });
    expect(validateMenuPageDraft({ ...base, roleGroup: 'x'.repeat(65) }).ok).toBe(false);
  });

  test('refuse une page lien sans URL', () => {
    expect(validateMenuPageDraft(makeDraft({ actionType: 'LINK', linkUrl: null })).ok).toBe(false);
    expect(validateMenuPageDraft(makeDraft({ actionType: 'LINK', linkUrl: 'https://kotbo.fr' })).ok).toBe(true);
  });
});

describe('checkExclusiveGroups', () => {
  const exclusive = (roleId: string, roleGroup: string) => ({
    actionType: 'ROLE' as const,
    roleAction: 'EXCLUSIVE' as const,
    roleId,
    roleGroup,
  });

  test('ne signale rien quand un groupe a deux rôles', () => {
    const result = checkExclusiveGroups([exclusive('1', 'Couleur'), exclusive('2', 'couleur ')]);
    expect(result).toEqual({ ok: true, warnings: [] });
  });

  test('avertit sans bloquer quand un groupe est incomplet', () => {
    const result = checkExclusiveGroups([exclusive('1', 'Couleur')]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.warnings).toHaveLength(1);
  });

  test('bloque un rôle présent dans deux groupes', () => {
    const result = checkExclusiveGroups([exclusive('1', 'Couleur'), exclusive('1', 'Région')]);
    expect(result.ok).toBe(false);
  });

  test('ignore les pages non exclusives', () => {
    const result = checkExclusiveGroups([
      { actionType: 'EMBED', roleAction: 'ADD', roleId: null, roleGroup: null },
      { actionType: 'ROLE', roleAction: 'TOGGLE', roleId: '1', roleGroup: 'Couleur' },
    ]);
    expect(result).toEqual({ ok: true, warnings: [] });
  });
});

describe('normalizeRoleGroupKey', () => {
  test('normalise casse et espaces multiples', () => {
    expect(normalizeRoleGroupKey('  Mon  Groupe ')).toBe('mon groupe');
    expect(normalizeRoleGroupKey(null)).toBe('');
  });
});
