import type { SlashCommandDefinition } from '../../commands.js';
import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import prisma from '../../utils/db.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';

const data = new SlashCommandBuilder()
  .setName('excuse')
  .setDescription('😅 Génère une excuse de développeur aléatoire')
  .addStringOption((option) =>
    option
      .setName('catégorie')
      .setDescription("Catégorie de l'excuse (optionnel)")
      .setRequired(false)
      .addChoices(
        { name: '🎯 Les classiques incontournables', value: 'classiques' },
        { name: '🔀 Git, CI/CD & Révisions', value: 'git_cicd' },
        { name: '☁️ Infrastructure, Docker & Cloud', value: 'infra_cloud' },
        { name: '🎨 Front-end, CSS & Browsers', value: 'frontend' },
        { name: '⚙️ Back-end, APIs & Data', value: 'backend' },
        { name: '📦 Enfer des dépendances & Runtimes', value: 'dependencies' },
        { name: '📋 Gestion de projet & Spécifications', value: 'management' },
        { name: "🤖 L'ère de l'IA & Génération de code", value: 'ai' },
        { name: '💻 Physique, Réseau & Hardware', value: 'hardware' },
        { name: '🃏 Mauvaise foi pure & Facteur humain', value: 'bad_faith' },
      ),
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const category = interaction.options.getString('catégorie');

  const whereClause: { language: string; category?: string } = { language: 'fr' };
  if (category) {
    whereClause.category = category;
  }

  const excuses = await prisma.developerExcuse.findMany({
    where: whereClause,
    select: { text: true },
  });

  if (excuses.length === 0) {
    await interaction.reply({
      embeds: [errorEmbed('Aucune excuse disponible', category ? `Aucune excuse trouvée dans la catégorie "${category}".` : 'La base de données ne contient encore aucune excuse de développeur.')],
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
