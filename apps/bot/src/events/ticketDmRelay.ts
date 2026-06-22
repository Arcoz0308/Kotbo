import { type Client, Events, type Message } from 'discord.js';
import { relayDmToThread, relayThreadToDm } from '../services/features/ticketService.js';

export function registerTicketDmRelayListener(client: Client): void {
  client.on(Events.MessageCreate, async (message: Message) => {
    if (message.author.bot) return;

    if (!message.guild && message.channel.isDMBased()) {
      await relayDmToThread(client, message);
      return;
    }

    if (message.channel.isThread()) {
      await relayThreadToDm(client, message);
    }
  });
}
