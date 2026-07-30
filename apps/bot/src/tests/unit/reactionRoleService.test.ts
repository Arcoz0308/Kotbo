import { beforeEach, describe, expect, mock, test } from 'bun:test';
import path from 'node:path';
import type { ButtonInteraction, Client } from 'discord.js';

const prismaMock = {
  reactionRoleMenu: {
    findFirst: mock(async () => null as Record<string, unknown> | null),
    delete: mock(async () => ({})),
  },
};

for (const extension of ['ts', 'js']) {
  mock.module(path.resolve(import.meta.dir, `../../utils/db.${extension}`), () => ({
    default: prismaMock,
    prisma: prismaMock,
    prismaRead: prismaMock,
  }));
}

const {
  deleteReactionRoleMenu,
  handleRoleToggleInteraction,
} = await import('../../services/features/reactionRoleService.js');

describe('reactionRoleService', () => {
  beforeEach(() => {
    prismaMock.reactionRoleMenu.findFirst.mockReset();
    prismaMock.reactionRoleMenu.delete.mockReset();
  });

  test('supprime le menu en base et son message Discord', async () => {
    const deleteMessage = mock(async () => undefined);
    const fetchMessage = mock(async () => ({ delete: deleteMessage }));
    const channel = {
      isTextBased: () => true,
      messages: { fetch: fetchMessage },
    };
    const guild = {
      channels: {
        cache: { get: mock(() => channel) },
        fetch: mock(async () => channel),
      },
    };
    const client = {
      guilds: {
        cache: { get: mock(() => guild) },
        fetch: mock(async () => guild),
      },
    } as unknown as Client;

    prismaMock.reactionRoleMenu.findFirst.mockResolvedValueOnce({
      id: 'menu-1',
      guildId: 'guild-1',
      channelId: 'channel-1',
      messageId: 'message-1',
    });

    expect(await deleteReactionRoleMenu(client, 'guild-1', 'menu-1')).toBeTrue();
    expect(prismaMock.reactionRoleMenu.findFirst).toHaveBeenCalledWith({
      where: { id: 'menu-1', guildId: 'guild-1' },
    });
    expect(prismaMock.reactionRoleMenu.delete).toHaveBeenCalledWith({
      where: { id: 'menu-1' },
    });
    expect(fetchMessage).toHaveBeenCalledWith('message-1');
    expect(deleteMessage).toHaveBeenCalledTimes(1);
  });

  test('refuse les boutons d’un panneau qui n’existe plus', async () => {
    const reply = mock(async () => undefined);
    prismaMock.reactionRoleMenu.findFirst.mockResolvedValueOnce(null);

    const interaction = {
      customId: 'role_toggle:role-1',
      guildId: 'guild-1',
      message: { id: 'message-1' },
      reply,
    } as unknown as ButtonInteraction;

    await handleRoleToggleInteraction(interaction);

    expect(prismaMock.reactionRoleMenu.findFirst).toHaveBeenCalledWith({
      where: { guildId: 'guild-1', messageId: 'message-1' },
    });
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('n’est plus actif'),
    }));
  });
});
