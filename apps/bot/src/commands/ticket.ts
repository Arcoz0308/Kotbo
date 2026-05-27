import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  MessageFlags,
  TextChannel,
} from 'discord.js';
import prisma from '../utils/db.js';
import { canManageTicket, renameTicketChannel } from '../services/ticketService.js';

export const data = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('🎫 Gère le ticket en cours')
  .setDMPermission(false)
  .addSubcommand((subcommand) =>
    subcommand
      .setName('rename')
      .setDescription('Renomme le salon du ticket courant')
      .addStringOption((option) =>
        option
          .setName('nom')
          .setDescription('Nouveau nom du salon du ticket')
          .setRequired(true)
      )
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  const channel = interaction.channel;

  if (!guildId || !channel || !(channel instanceof TextChannel)) {
    await interaction.reply({
      content: '❌ Cette commande doit être utilisée dans un salon de ticket textuel.',
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const guildConfig = await prisma.guild.findUnique({ where: { id: guildId } });
  if (!guildConfig) {
    await interaction.reply({
      content: '❌ Configuration du serveur introuvable.',
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const ticket = await prisma.ticket.findFirst({
    where: {
      guildId,
      channelId: channel.id,
    },
  });

  if (!ticket) {
    await interaction.reply({
      content: '❌ Aucun ticket n\'est associé à ce salon.',
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const canRename = canManageTicket(interaction.member, guildConfig) || ticket.userId === interaction.user.id;
  if (!canRename) {
    await interaction.reply({
      content: '❌ Vous n\'avez pas la permission de renommer ce ticket.',
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  if (subcommand !== 'rename') {
    await interaction.reply({
      content: '❌ Sous-commande inconnue.',
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const requestedName = interaction.options.getString('nom', true);

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  try {
    const finalName = await renameTicketChannel(
      interaction.client,
      ticket,
      guildConfig,
      {
        id: interaction.user.id,
        username: interaction.user.username,
      },
      requestedName,
    );

    await interaction.editReply({
      content: `✅ Le ticket a été renommé en **#${finalName}**.`,
    });
  } catch (error: any) {
    await interaction.editReply({
      content: `❌ Impossible de renommer le ticket : ${error?.message || 'erreur inconnue'}`,
    });
  }
}
