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
  .setDescription('⚙️ Configuration interactive et pas à pas de Kotbo')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption((o) =>
    o
      .setName('config')
      .setDescription('Salon de configuration et de validation (optionnel, peut être défini après)')
      .addChannelTypes(ChannelType.GuildText),
  )
  .addChannelOption((o) =>
    o
      .setName('public')
      .setDescription('Salon public des news (optionnel, peut être défini après)')
      .addChannelTypes(ChannelType.GuildText),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId!;
  const configChannel = interaction.options.getChannel('config');
  const publicChannel = interaction.options.getChannel('public');

  if (configChannel || publicChannel) {
    const updateData: any = {};
    if (configChannel) updateData.configChannelId = configChannel.id;
    if (publicChannel) updateData.publicChannelId = publicChannel.id;

    await prisma.guild.upsert({
      where: { id: guildId },
      update: updateData,
      create: { id: guildId, ...updateData },
    });

    await sendSetupStep1(interaction.client, guildId, interaction);
  } else {
    // Start from welcome
    await sendSetupWelcome(interaction.client, guildId, interaction);
  }
}
