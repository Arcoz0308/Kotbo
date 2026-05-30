import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Events,
  TextChannel,
  type Client,
} from 'discord.js';
import prisma from '../utils/db.js';
import { COLORS } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';

export function registerTicketLeaveFollowUpListener(client: Client): void {
  client.on(Events.GuildMemberRemove, async (member) => {
    try {
      const guildConfig = await prisma.guild.findUnique({
        where: { id: member.guild.id },
        select: {
          ticketStaffRoleId: true,
          moderatorRoleId: true,
        },
      });

      const tickets = await prisma.ticket.findMany({
        where: {
          guildId: member.guild.id,
          userId: member.id,
          status: { in: ['OPEN', 'CLAIMED'] },
          channelId: { not: null },
        },
      });

      if (tickets.length === 0) return;

      for (const ticket of tickets) {
        if (!ticket.channelId) continue;

        const channel = client.channels.cache.get(ticket.channelId) ?? await client.channels.fetch(ticket.channelId).catch(() => null);
        if (!channel || !(channel instanceof TextChannel)) continue;

          const staffPing = guildConfig?.ticketStaffRoleId
            ? `<@&${ticket.staffRoleId || guildConfig.ticketStaffRoleId}>`
            : ticket.staffRoleId
              ? `<@&${ticket.staffRoleId}>`
              : guildConfig?.moderatorRoleId
                ? `<@&${guildConfig.moderatorRoleId}>`
                : '';

        const embed = new EmbedBuilder()
          .setTitle('👋 Le créateur a quitté le serveur')
          .setDescription(
            `Le membre <@${member.id}> a quitté le serveur alors que ce ticket est encore actif.\n\n` +
            'Souhaitez-vous fermer ou supprimer ce ticket ?'
          )
          .setColor(COLORS.warning as any)
          .setTimestamp();

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`ticket:close:${ticket.id}`).setLabel('Fermer').setStyle(ButtonStyle.Secondary).setEmoji('🔒'),
          new ButtonBuilder().setCustomId(`ticket:delete:${ticket.id}`).setLabel('Supprimer').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
        );

        await channel.send({
          content: staffPing || undefined,
          embeds: [embed],
          components: [row],
        }).catch((error) => {
          logger.warn('Ticket', `Impossible d'envoyer le follow-up de départ pour ${ticket.id}: ${String(error)}`);
        });
      }
    } catch (error) {
      logger.error('Ticket', `Erreur lors du follow-up de départ membre: ${String(error)}`);
    }
  });
}
