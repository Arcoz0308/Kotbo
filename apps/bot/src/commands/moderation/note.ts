import type { ContextCommandDefinition, SlashCommandDefinition } from '../../commands.js';
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
  type ButtonInteraction,
} from 'discord.js';
import prisma from '../../utils/db.js';
import { logger } from '../../utils/logger.js';
import { getCommandMetadata } from '../../utils/i18n.js';
import * as m from '../../lib/paraglide/messages.js';

const meta = getCommandMetadata('b1_note');
const contextMeta = getCommandMetadata('b1_note_context');

const data = new SlashCommandBuilder()
  .setName(meta.name)
  .setNameLocalizations(meta.nameLocalizations)
  .setDescription(meta.description)
  .setDescriptionLocalizations(meta.descriptionLocalizations)
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((option) =>
    option
      .setName('membre')
      .setDescription(m.b1_note_opt_membre({}, { locale: 'en' }))
      .setDescriptionLocalizations({ fr: m.b1_note_opt_membre({}, { locale: 'fr' }) })
      .setRequired(true),
  );

const contextData = new ContextMenuCommandBuilder()
  .setName(contextMeta.name)
  .setNameLocalizations(contextMeta.nameLocalizations)
  .setType(ApplicationCommandType.User)
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

async function execute(interaction: ChatInputCommandInteraction | UserContextMenuCommandInteraction): Promise<void> {
  const targetUser = interaction.isChatInputCommand()
    ? interaction.options.getUser('membre', true)
    : interaction.targetUser;

  await showModeratorNoteModal(interaction, targetUser.id, targetUser.username);
}

export async function showModeratorNoteModal(
  interaction: ChatInputCommandInteraction | UserContextMenuCommandInteraction | ButtonInteraction,
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
    logger.error('Modal', `Erreur lors de l'affichage de la modal de note: ${String(error)}`);
    if (interaction.isRepliable()) {
      await interaction.reply({
        content: "❌ Impossible d'afficher le menu de note. Réessaie plus tard.",
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
