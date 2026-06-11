import type { SlashCommandDefinition } from '../../commands.js';
import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { infoEmbed } from '../../utils/embeds.js';

const data = new SlashCommandBuilder()
  .setName('dashboard')
  .setDescription('🔗 Obtiens le lien pour accéder au dashboard de Kotbo');

export async function execute(interaction: ChatInputCommandInteraction) {
  const dashboardUrl = process.env.DASHBOARD_URL || 'http://localhost:5173';

  const embed = infoEmbed(
    'Dashboard Kotbo',
    `Clique sur le bouton ci-dessous pour accéder au dashboard de Kotbo.\n\n🌐 **URL :** ${dashboardUrl}`,
    [],
    { user: interaction.user }
  );

  const button = new ButtonBuilder()
    .setLabel('Accéder au Dashboard')
    .setURL(dashboardUrl)
    .setStyle(ButtonStyle.Link)
    .setEmoji('🌐');

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

  await interaction.reply({
    embeds: [embed],
    components: [row],
    flags: [MessageFlags.Ephemeral],
  });
}

export const dashboardCommand = { data, execute } satisfies SlashCommandDefinition;
