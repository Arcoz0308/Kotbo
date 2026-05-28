import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
  MessageFlags,
  TextChannel,
  type GuildMember,
} from 'discord.js';
import prisma from '../utils/db.js';
import { canManageTicket, renameTicketChannel } from '../services/ticketService.js';
import { buildMemberCasePanel } from '../services/memberCaseService.js';
import { generateTranscript } from '../services/transcriptService.js';
import { COLORS, successEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('🎫 Gère le ticket en cours')
  .setDMPermission(false)
  .addSubcommand((subcommand) =>
    subcommand
      .setName('claim')
      .setDescription('Prend en charge le ticket courant')
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('info')
      .setDescription('Affiche les informations du membre lié au ticket')
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('close')
      .setDescription('Ferme le ticket courant')
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('reopen')
      .setDescription('Réouvre le ticket courant')
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('delete')
      .setDescription('Supprime le ticket courant avec transcription')
  )
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

  const canRename = canManageTicket(interaction.member, guildConfig, ticket.staffRoleId) || ticket.userId === interaction.user.id;
  const subcommand = interaction.options.getSubcommand();
  const isStaff = canManageTicket(interaction.member, guildConfig, ticket.staffRoleId);
  const isOpener = ticket.userId === interaction.user.id;

  async function getStaffLevel(guildId: string, userId: string): Promise<number> {
    const staff = await prisma.staffMember.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });
    if (!staff) return 0;
    const role = await prisma.staffRole.findFirst({
      where: { guildId, name: staff.grade, enabled: true },
    });
    return role ? role.level : 0;
  }

  if (subcommand === 'claim') {
    if (!isStaff) {
      await interaction.reply({
        content: '❌ Seuls les membres du personnel peuvent prendre en charge un ticket.',
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const allowOverclaim = guildConfig.ticketAllowOverclaim ?? true;
    const overclaimPermission = guildConfig.ticketOverclaimPermission || 'ANY';

    if (ticket.status === 'CLAIMED') {
      if (!allowOverclaim || overclaimPermission === 'NONE') {
        await interaction.reply({
          content: `⚠️ Ce ticket est déjà pris en charge par <@${ticket.claimedById}>. La sur-revendication est désactivée.`,
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      if (ticket.claimedById === interaction.user.id) {
        await interaction.reply({
          content: '⚠️ Vous prenez déjà en charge ce ticket.',
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      if (overclaimPermission === 'SUPERIOR_OR_EQUAL') {
        const member = interaction.member as GuildMember | null;
        const claimantIsAdmin = member?.permissions?.has(PermissionFlagsBits.Administrator) ?? false;

        if (!claimantIsAdmin) {
          const claimantLevel = await getStaffLevel(guildId, interaction.user.id);
          const currentLevel = ticket.claimedById ? await getStaffLevel(guildId, ticket.claimedById) : 0;

          if (claimantLevel < currentLevel) {
            await interaction.reply({
              content: '❌ Vous ne pouvez pas sur-revendiquer ce ticket car le grade actuel est supérieur au vôtre.',
              flags: [MessageFlags.Ephemeral],
            });
            return;
          }
        }
      }
    }

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        status: 'CLAIMED',
        claimedById: interaction.user.id,
        claimedByName: interaction.user.username,
      },
    });

    await channel.send({
      embeds: [successEmbed('Pris en charge', `Ce ticket est désormais pris en charge par <@${interaction.user.id}>.`)],
    }).catch(() => null);

    await interaction.reply({
      content: '✅ Ticket pris en charge.',
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  if (subcommand === 'info') {
    if (!isStaff) {
      await interaction.reply({
        content: '❌ Seuls les membres du personnel peuvent consulter cette fiche.',
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    try {
      const panel = await buildMemberCasePanel(interaction.guild!, ticket.userId, 'resume', 0);
      await interaction.editReply({
        embeds: [panel.embed],
        components: panel.components,
        files: panel.files,
      });
    } catch {
      await interaction.editReply({
        content: '❌ Impossible de générer la fiche du membre.',
      });
    }
    return;
  }

  if (subcommand === 'close') {
    if (!isOpener && !isStaff) {
      await interaction.reply({
        content: '❌ Vous n\'avez pas la permission de fermer ce ticket.',
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    if (ticket.status === 'CLOSED') {
      await interaction.reply({
        content: '⚠️ Le ticket est déjà fermé.',
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        status: 'CLOSED',
        closedById: interaction.user.id,
        closedByName: interaction.user.username,
        closedAt: new Date(),
      },
    });

    await channel.permissionOverwrites.edit(ticket.userId, {
      ViewChannel: false,
      SendMessages: false,
    }).catch(() => null);

    const closeEmbed = new EmbedBuilder()
      .setTitle('🔒 Ticket Fermé')
      .setDescription(`Le ticket a été fermé par <@${interaction.user.id}>.`)
      .setColor(COLORS.danger as any)
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`ticket:reopen:${ticket.id}`).setLabel('Réouvrir').setStyle(ButtonStyle.Success).setEmoji('🔓'),
      new ButtonBuilder().setCustomId(`ticket:delete:${ticket.id}`).setLabel('Supprimer').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
    );

    await channel.send({ embeds: [closeEmbed], components: [row] }).catch(() => null);

    await interaction.reply({
      content: '✅ Ticket fermé.',
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  if (subcommand === 'reopen') {
    if (!isStaff) {
      await interaction.reply({
        content: '❌ Seuls les membres du personnel peuvent réouvrir un ticket.',
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    if (ticket.status !== 'CLOSED') {
      await interaction.reply({
        content: '⚠️ Le ticket n\'est pas fermé.',
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        status: 'OPEN',
        closedById: null,
        closedByName: null,
        closedAt: null,
      },
    });

    await channel.permissionOverwrites.edit(ticket.userId, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
    }).catch(() => null);

    await channel.send({
      embeds: [successEmbed('Ticket Réouvert', `Le ticket a été réouvert par <@${interaction.user.id}>.`)],
    }).catch(() => null);

    await interaction.reply({
      content: '✅ Ticket réouvert.',
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  if (subcommand === 'delete') {
    if (!isStaff) {
      await interaction.reply({
        content: '❌ Seuls les membres du personnel peuvent supprimer un ticket.',
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    try {
      const transcriptData = await generateTranscript(channel);

      await prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          channelId: null,
          status: 'CLOSED',
          transcriptId: transcriptData.id,
          closedById: interaction.user.id,
          closedByName: interaction.user.username,
          closedAt: new Date(),
        },
      });

      const dashboardUrl = process.env.DASHBOARD_URL || 'http://localhost:5173';
      const publicLink = `${dashboardUrl}/transcripts/${transcriptData.id}`;

      await channel.send({
        embeds: [successEmbed('Transcription créée', `Le transcript est disponible ici : ${publicLink}`)],
      }).catch(() => null);

      await interaction.editReply({
        content: `✅ Ticket supprimé. Transcript : ${publicLink}`,
      });

      setTimeout(async () => {
        await channel.delete(`Ticket supprimé par ${interaction.user.username} (Transcript ID: ${transcriptData.id})`).catch(() => null);
      }, 3000);
    } catch (error: any) {
      await interaction.editReply({
        content: `❌ Impossible de supprimer le ticket : ${error?.message || 'erreur inconnue'}`,
      });
    }
    return;
  }

  if (subcommand !== 'rename') {
    await interaction.reply({
      content: '❌ Sous-commande inconnue.',
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  if (!canRename) {
    await interaction.reply({
      content: '❌ Vous n\'avez pas la permission de renommer ce ticket.',
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
