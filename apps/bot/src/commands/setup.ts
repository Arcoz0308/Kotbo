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

export const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('⚙️ Configuration initiale du bot de news')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption((o) =>
    o
      .setName('config')
      .setDescription('Salon de configuration et de validation des news')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true),
  )
  .addChannelOption((o) =>
    o
      .setName('public')
      .setDescription('Salon public où les news validées sont publiées')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const guildId = interaction.guildId!;
  const configChannel = interaction.options.getChannel('config', true);
  const publicChannel = interaction.options.getChannel('public', true);

  await prisma.guild.upsert({
    where: { id: guildId },
    update: {
      configChannelId: configChannel.id,
      publicChannelId: publicChannel.id,
    },
    create: {
      id: guildId,
      configChannelId: configChannel.id,
      publicChannelId: publicChannel.id,
    },
  });

  // Post config panel in config channel
  await sendConfigPanel(interaction.client, guildId, configChannel as import('discord.js').TextChannel);

  await interaction.editReply({
    embeds: [
      successEmbed(
        'Bot configuré !',
        `✅ Config : <#${configChannel.id}>\n✅ Public : <#${publicChannel.id}>\n\nLe panneau de configuration a été posté dans <#${configChannel.id}>.`,
      ),
    ],
  });
}
