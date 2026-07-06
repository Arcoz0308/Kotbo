import { describe, expect, test } from 'bun:test';
import { MessageFlags, TextDisplayBuilder } from 'discord.js';
import { transformUpdatePayload } from '../../utils/patchV2';

const v2Message = {
  flags: { has: (f: number) => f === MessageFlags.IsComponentsV2 },
};

const legacyMessage = {
  flags: { has: () => false },
};

describe('transformUpdatePayload', () => {
  test('convertit content en TextDisplay pour un update sur message V2', () => {
    const payload = transformUpdatePayload(
      { content: 'Alerte ignorée par <@123>.', embeds: [], components: [] },
      v2Message,
    ) as { content?: string; embeds?: unknown[]; components: unknown[]; flags: unknown; allowedMentions?: unknown };

    expect(payload.content).toBeUndefined();
    expect(payload.embeds).toBeUndefined();
    expect(payload.components).toHaveLength(1);
    expect(payload.components[0]).toBeInstanceOf(TextDisplayBuilder);
    expect((payload.components[0] as TextDisplayBuilder).toJSON().content).toBe('Alerte ignorée par <@123>.');
    expect(payload.flags).toContain(MessageFlags.IsComponentsV2);
    expect(payload.allowedMentions).toEqual({ parse: [] });
  });

  test('préserve les composants existants en les plaçant après le texte', () => {
    const row = { type: 1, components: [] };
    const payload = transformUpdatePayload(
      { content: 'Validé.', components: [row] },
      v2Message,
    ) as { components: unknown[] };

    expect(payload.components).toHaveLength(2);
    expect(payload.components[0]).toBeInstanceOf(TextDisplayBuilder);
    expect(payload.components[1]).toBe(row);
  });

  test('convertit un update string sur message V2', () => {
    const payload = transformUpdatePayload('Terminé.', v2Message) as { components: unknown[]; flags: unknown[] };

    expect(payload.components).toHaveLength(1);
    expect(payload.components[0]).toBeInstanceOf(TextDisplayBuilder);
    expect(payload.flags).toContain(MessageFlags.IsComponentsV2);
  });

  test('ne modifie pas un update content sur message legacy', () => {
    const options = { content: 'Alerte ignorée.', embeds: [], components: [] };
    const payload = transformUpdatePayload(options, legacyMessage);

    expect(payload).toBe(options);
    expect((payload as { content?: string }).content).toBe('Alerte ignorée.');
  });

  test('convertit toujours les embeds via transformPayload, cible V2 ou non', () => {
    const payload = transformUpdatePayload(
      { embeds: [{ title: 'Test', description: 'Desc' }], components: [] },
      v2Message,
    ) as { embeds?: unknown[]; components: unknown[]; flags: unknown };

    expect(payload.embeds).toBeUndefined();
    expect(payload.components.length).toBeGreaterThanOrEqual(1);
  });
});
