import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
} from 'discord.js';
import prisma from '../utils/db.js';
import { successEmbed, errorEmbed } from '../utils/embeds.js';
import { sendConfigPanel } from '../panels/configPanel.js';
import { sendSetupWelcome, sendSetupStep1 } from '../panels/setupPanel.js';

export const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('⚙️ Assistant de configuration pas à pas de Kotbo')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId!;
  
  await sendSetupWelcome(interaction.client, guildId, interaction);
}
