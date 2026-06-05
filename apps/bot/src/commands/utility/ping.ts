import type { SlashCommandDefinition } from '../../commands.js';
import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';

const data = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('🏓 Vérifie la latence du bot');

export async function execute(interaction: ChatInputCommandInteraction) {
  const start = Date.now();
  const reply = await interaction.reply({ content: '🏓 Pong... calcul en cours', fetchReply: true });

  const latency = Date.now() - start;
  const apiLatency = Math.round(interaction.client.ws.ping);

  await interaction.editReply({
    embeds: [
      successEmbed('Pong !', `⏱️ Latence de traitement : **${latency}ms**\n🌐 Latence API : **${apiLatency}ms**`),
    ],
  });
}

export const pingCommand = { data, execute } satisfies SlashCommandDefinition;
