import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';
import { sendMainConfigPanel } from '../panels/generalConfigPanel.js';
import prisma from '../utils/db.js';

export const data = new SlashCommandBuilder()
  .setName('config')
  .setDescription('⚙️ Configure toutes les fonctionnalités de Kotbo')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;

  await prisma.guild.upsert({
    where: { id: guildId },
    update: {},
    create: { id: guildId },
  });

  await sendMainConfigPanel(interaction, guildId);
}
