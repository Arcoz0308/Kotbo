import type { SlashCommandDefinition } from '../../commands.js';
import { SlashCommandBuilder, type ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { COLORS } from '../../utils/embeds.js';

const data = new SlashCommandBuilder()
  .setName('games')
  .setDescription('🎮 Obtenir des informations détaillées sur les jeux de l’économie');

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const embed = new EmbedBuilder()
    .setTitle('🎮 Mini-Jeux de l’Économie')
    .setDescription('Tentez de faire fructifier vos pièces ou de vous divertir grâce aux commandes de jeu ci-dessous !')
    .setColor(COLORS.primary)
    .addFields(
      {
        name: '🎲 `/dice <mise>`',
        value:
          'Lancez deux dés de 1 à 6.\n' +
          '• **Double 6 :** Gagnez **3x** votre mise !\n' +
          '• **Autre Double :** Gagnez **2x** votre mise !\n' +
          '• **Somme >= 8 :** Gagnez **1.5x** votre mise !\n' +
          '• **Somme = 7 :** Égalité (mise remboursée)\n' +
          '• **Somme <= 6 :** Vous perdez votre mise.'
      },
      {
        name: '🪨 `/rps <choix> <mise>`',
        value:
          'Jouez à Pierre, Feuille, Ciseaux contre le bot.\n' +
          '• **Victoire :** Gagnez **2x** votre mise !\n' +
          '• **Égalité :** Mise remboursée\n' +
          '• **Défaite :** Vous perdez votre mise.'
      },
      {
        name: '🔫 `/roulette <mise>`',
        value:
          'Tentez la roulette russe avec 1 chance sur 6 de vous faire tirer dessus.\n' +
          '• **Survie (5/6) :** Gagnez **1.2x** votre mise (20% de profit) !\n' +
          '• **Tir (1/6) :** Vous perdez votre mise et **50 PV RPG**.'
      },
      {
        name: '🤔 `/guess`',
        value:
          'Trouvez un nombre secret entre 1 et 100.\n' +
          '• Vous avez **7 essais**.\n' +
          '• Le bot vous aide à chaque coup (plus grand / plus petit).\n' +
          '• Plus vous trouvez vite, plus vous gagnez de pièces (jusqu’à **200 pièces**).'
      }
    )
    .setFooter({ text: 'Rappelez-vous : misez de manière responsable !' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

export const gamesCommand = { data, execute } satisfies SlashCommandDefinition;
