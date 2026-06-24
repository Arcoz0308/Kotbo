import type { SlashCommandDefinition } from '../../commands.js';
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
} from 'discord.js';

import { sendSetupWelcome } from '../../panels/setupPanel.js';

const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Assistant de configuration pas à pas de Kotbo')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId!;

  await sendSetupWelcome(interaction.client, guildId, interaction);
}

export const setupCommand = { data, execute } satisfies SlashCommandDefinition;
