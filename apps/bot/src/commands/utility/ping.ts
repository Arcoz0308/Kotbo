import type { SlashCommandDefinition } from '../../commands.js';
import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';

const data = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('🏓 Vérifie la latence du bot');

export async function execute(interaction: ChatInputCommandInteraction) {
  const start = Date.now();
  await interaction.deferReply();
  const roundTrip = Date.now() - start;
  const wsLatency = Math.round(interaction.client.ws.ping);

  await interaction.editReply({
    embeds: [
      successEmbed('Pong !', `⏱️ Aller-retour Discord : **${roundTrip}ms**\n🌐 Latence WebSocket : **${wsLatency}ms**`),
    ],
  });
}

export const pingCommand = { data, execute } satisfies SlashCommandDefinition;
