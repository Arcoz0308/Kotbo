import type { SlashCommandDefinition } from '../../commands.js';
import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import prisma from '../../utils/db.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';

const data = new SlashCommandBuilder()
  .setName('excuse')
  .setDescription('😅 Génère une excuse de développeur aléatoire');

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const excuses = await prisma.developerExcuse.findMany({
    where: { language: 'fr' },
    select: { text: true },
  });

  if (excuses.length === 0) {
    await interaction.reply({
      embeds: [errorEmbed('Aucune excuse disponible', 'La base de données ne contient encore aucune excuse de développeur.')],
    });
    return;
  }

  const randomExcuse = excuses[Math.floor(Math.random() * excuses.length)]?.text ?? 'Aucune excuse trouvée.';

  await interaction.reply({
    embeds: [
      successEmbed('Excuse de développeur trouvée', `> ${randomExcuse}`),
    ],
  });
}

export const excuseCommand = { data, execute } satisfies SlashCommandDefinition;
