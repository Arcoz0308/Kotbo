import type { SlashCommandDefinition } from '../commands.js';
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';
import { sendMainConfigPanel } from '../panels/generalConfigPanel.js';
import prisma from '../utils/db.js';

const data = new SlashCommandBuilder()
  .setName('config')
  .setDescription('⚙️ Configure toutes les fonctionnalités de Kotbo')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;

  await prisma.guild.upsert({
    where: { id: guildId },
    update: {},
    create: { id: guildId },
  });

  await sendMainConfigPanel(interaction, guildId);
}

export const configCommand = { data, execute } satisfies SlashCommandDefinition;
