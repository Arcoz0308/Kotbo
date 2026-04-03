import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { infoEmbed, errorEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('epoch')
  .setDescription('🕐 Convertis entre timestamp Unix et date lisible')
  .addStringOption(option =>
    option
      .setName('value')
      .setDescription('Timestamp Unix (ex: 1712155663) ou date YYYY-MM-DD')
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const input = interaction.options.getString('value');

  try {
    let timestamp: number;
    let isConversion: boolean;

    if (!input) {
      // No argument: return current timestamp
      timestamp = Math.floor(Date.now() / 1000);
      isConversion = false;
    } else if (/^\d+$/.test(input)) {
      // Unix timestamp input: convert to readable date
      timestamp = parseInt(input, 10);
      if (timestamp < 0 || timestamp > 9999999999) {
        await interaction.reply({
          embeds: [errorEmbed('Timestamp invalide', 'Le timestamp doit être entre 0 et 9999999999')],
          flags: 64, // ephemeral
        });
        return;
      }
      isConversion = true;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
      // Date format YYYY-MM-DD: convert to timestamp
      const date = new Date(`${input}T00:00:00Z`);
      if (Number.isNaN(date.getTime())) {
        await interaction.reply({
          embeds: [errorEmbed('Date invalide', 'Format attendu: YYYY-MM-DD (ex: 2024-04-04)')],
          flags: 64,
        });
        return;
      }
      timestamp = Math.floor(date.getTime() / 1000);
      isConversion = true;
    } else {
      await interaction.reply({
        embeds: [
          errorEmbed(
            'Format non reconnu',
            'Fournis un timestamp Unix (ex: 1712155663) ou une date au format YYYY-MM-DD'
          ),
        ],
        flags: 64,
      });
      return;
    }

    const date = new Date(timestamp * 1000);
    const discordTimeFormat = `<t:${timestamp}:F>`;

    await interaction.reply({
      embeds: [
        infoEmbed(
          'Conversion Epoch',
          isConversion
            ? `**Timestamp Unix:** \`${timestamp}\`\n**Date et heure:** ${discordTimeFormat}`
            : `**Timestamp actuel:** \`${timestamp}\`\n**Date et heure:** ${discordTimeFormat}`,
          [
            {
              name: 'ISO 8601',
              value: `\`${date.toISOString()}\``,
              inline: false,
            },
            {
              name: 'Format Discord',
              value: `${discordTimeFormat}`,
              inline: false,
            },
          ]
        ),
      ],
    });
  } catch (error) {
    await interaction.reply({
      embeds: [errorEmbed('Erreur', 'Une erreur est survenue lors de la conversion')],
      flags: 64,
    });
  }
}
