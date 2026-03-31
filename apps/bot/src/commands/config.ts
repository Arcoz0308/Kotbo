import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';
import { sendConfigPanel } from '../panels/configPanel.js';
import { errorEmbed } from '../utils/embeds.js';
import prisma from '../utils/db.js';

export const data = new SlashCommandBuilder()
  .setName('config')
  .setDescription('🔧 Ouvrir le panneau de configuration du bot')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId!;
  const guild = await prisma.guild.findUnique({ where: { id: guildId } });

  if (!guild) {
    await interaction.reply({
      embeds: [errorEmbed('Bot non configuré', 'Utilisez `/setup` pour configurer le bot.')],
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  await sendConfigPanel(interaction.client, guildId, interaction);
  await interaction.editReply({ content: '✅ Panneau de configuration posté !' });
}
