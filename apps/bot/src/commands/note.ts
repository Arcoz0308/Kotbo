import type { ContextCommandDefinition, SlashCommandDefinition } from '../commands.js';
import {
  ActionRowBuilder,
  ContextMenuCommandBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  ApplicationCommandType,
  type ChatInputCommandInteraction,
  type UserContextMenuCommandInteraction,
} from 'discord.js';
import prisma from '../utils/db.js';

const data = new SlashCommandBuilder()
  .setName('note')
  .setDescription('📝 Gère la note modérateur d’un membre')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((option) =>
    option.setName('membre').setDescription('Le membre pour lequel vous souhaitez modifier la note').setRequired(true),
  );

const contextData = new ContextMenuCommandBuilder()
  .setName('Note Modérateur')
  .setType(ApplicationCommandType.User)
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

async function execute(interaction: ChatInputCommandInteraction | UserContextMenuCommandInteraction): Promise<void> {
  const targetUser = interaction.isChatInputCommand()
    ? interaction.options.getUser('membre', true)
    : interaction.targetUser;

  await showModeratorNoteModal(interaction, targetUser.id, targetUser.username);
}

export async function showModeratorNoteModal(
  interaction: ChatInputCommandInteraction | UserContextMenuCommandInteraction | import('discord.js').ButtonInteraction,
  targetUserId: string,
  targetUsername: string,
): Promise<void> {
  try {
    const guildId = interaction.guildId;
    if (!guildId) return;

    const profile = await prisma.memberProfile.findUnique({
      where: {
        guildId_userId: {
          guildId,
          userId: targetUserId,
        },
      },
      select: { moderatorNote: true },
    });

    const currentNote = profile?.moderatorNote ?? '';

    const modal = new ModalBuilder()
      .setCustomId(`modal:moderator-note:${targetUserId}`)
      .setTitle(`Note : ${truncate(targetUsername, 35)}`);

    const noteInput = new TextInputBuilder()
      .setCustomId('note_content')
      .setLabel('Note Modérateur')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Ajoutez des informations importantes sur ce membre...')
      .setValue(currentNote)
      .setRequired(false)
      .setMaxLength(1000);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(noteInput));

    await interaction.showModal(modal);
  } catch (error) {
    import('../utils/logger.js').then(({ logger }) => {
      logger.error('Modal', `Erreur lors de l'affichage de la modal de note: ${String(error)}`);
    });
    if (interaction.isRepliable()) {
      await interaction.reply({
        content: '❌ Impossible d’afficher le menu de note. Réessaie plus tard.',
        flags: ["Ephemeral"],
      }).catch(() => null);
    }
  }
}

function truncate(str: string, n: number) {
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}

export const noteCommand = { data, execute } satisfies SlashCommandDefinition;
export const noteContextCommand = { data: contextData, execute } satisfies ContextCommandDefinition;
