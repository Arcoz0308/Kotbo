import { describe, expect, test } from 'bun:test';
import type { ChatInputCommandInteraction } from 'discord.js';
import { execute } from '../../commands/utility/ping';

describe('commande ping', () => {
  test('repond puis edite la reponse avec un embed de latence', async () => {
    const replies: unknown[] = [];
    const edits: unknown[] = [];

    const interaction = {
      client: { ws: { ping: 42.4 } },
      reply: async (options: unknown) => {
        replies.push(options);
        return { id: 'reply-1' };
      },
      editReply: async (options: unknown) => {
        edits.push(options);
        return { id: 'edited-1' };
      },
    } as unknown as ChatInputCommandInteraction;

    await execute(interaction);

    expect(replies.length).toBe(1);
    expect(edits.length).toBe(1);

    const replyPayload = replies[0] as { content?: string; fetchReply?: boolean };
    expect(replyPayload.content).toContain('Pong');
    expect(replyPayload.fetchReply).toBeTrue();

    const editPayload = edits[0] as { embeds?: Array<{ data?: { title?: string; description?: string } }> };
    expect(editPayload.embeds?.length).toBe(1);
    const embed = editPayload.embeds?.[0]?.data;
    expect(embed?.title).toContain('Pong');
    expect(embed?.description).toContain('Latence API');
  });
});
