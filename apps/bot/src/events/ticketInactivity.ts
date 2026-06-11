import { type Client, Events, type Message } from 'discord.js';
import prisma from '../utils/db.js';
import { logger } from '../utils/logger.js';

export function registerTicketInactivityListener(client: Client): void {
  client.on(Events.MessageCreate, async (message: Message) => {
    try {
      if (message.author.bot || !message.guildId) return;

      // Check if message is in a ticket channel and sent by the creator
      const ticket = await prisma.ticket.findFirst({
        where: {
          guildId: message.guildId,
          channelId: message.channel.id,
          status: { in: ['OPEN', 'CLAIMED'] },
          userId: message.author.id,
        },
      });

      if (!ticket) return;

      // If the ticket creator speaks, reset the inactivityAlertSent flag
      if (ticket.inactivityAlertSent) {
        await prisma.ticket.update({
          where: { id: ticket.id },
          data: { inactivityAlertSent: false },
        });
        logger.debug('Ticket', `Réinitialisation du flag d'inactivité pour le ticket ${ticket.id} après message du créateur.`);
      }
    } catch (error) {
      logger.error('Ticket', `Erreur lors de la réinitialisation du flag d'inactivité du ticket: ${String(error)}`);
    }
  });
}
