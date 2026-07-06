import { describe, expect, test } from 'bun:test';
import type { ChatInputCommandInteraction } from 'discord.js';
import { execute } from '../../commands/utility/ping';

describe('commande ping', () => {
  test('repond puis edite la reponse avec un embed de latence', async () => {
    let deferCalled = false;
    const edits: unknown[] = [];

    const interaction = {
      client: { ws: { ping: 42.4 } },
      deferReply: async () => {
        deferCalled = true;
      },
      editReply: async (options: unknown) => {
        edits.push(options);
        return { id: 'edited-1' };
      },
    } as unknown as ChatInputCommandInteraction;

    await execute(interaction);

    expect(deferCalled).toBeTrue();
    expect(edits.length).toBe(1);

    const editPayload = edits[0] as { embeds?: Array<{ data?: { title?: string; description?: string } }> };
    expect(editPayload.embeds?.length).toBe(1);
    const embed = editPayload.embeds?.[0]?.data;
    expect(embed?.title).toContain('Pong');
    expect(embed?.description).toContain('WebSocket');
  });
});
