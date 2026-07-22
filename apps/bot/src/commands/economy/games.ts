import type { SlashCommandDefinition } from '../../commands.js';
import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { kotboContainer } from '../../utils/embeds.js';
import { E } from '../../utils/emojis.js';
import { separator, v2Message } from '@arcscord/components';

const data = new SlashCommandBuilder()
  .setName('games')
  .setDescription("🎮 Obtenir des informations détaillées sur les jeux de l'économie");

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply(v2Message(
    kotboContainer({
      color: 'primary',
      title: `${E.coins} Mini-Jeux de l'Économie`,
      fields: [
        'Tentez de faire fructifier vos pièces ou de vous divertir grâce aux commandes de jeu ci-dessous !',
        separator({ divider: true, spacing: 'small' }),
        `**${E.coins} \`/dice <mise>\`**\n` +
          `Lancez deux dés de 1 à 6.\n` +
          `${E.dot} **Double 6 :** Gagnez **3x** votre mise !\n` +
          `${E.dot} **Autre Double :** Gagnez **2x** votre mise !\n` +
          `${E.dot} **Somme >= 8 :** Gagnez **1.5x** votre mise !\n` +
          `${E.dot} **Somme = 7 :** Égalité (mise remboursée)\n` +
          `${E.dot} **Somme <= 6 :** Vous perdez votre mise.`,
        separator({ divider: true, spacing: 'small' }),
        `**${E.coins} \`/rps <choix> <mise>\`**\n` +
          `Jouez à Pierre, Feuille, Ciseaux contre le bot.\n` +
          `${E.dot} **Victoire :** Gagnez **2x** votre mise !\n` +
          `${E.dot} **Égalité :** Mise remboursée\n` +
          `${E.dot} **Défaite :** Vous perdez votre mise.`,
        separator({ divider: true, spacing: 'small' }),
        `**${E.coins} \`/roulette <mise>\`**\n` +
          `Tentez la roulette russe avec 1 chance sur 6 de vous faire tirer dessus.\n` +
          `${E.dot} **Survie (5/6) :** Gagnez **1.2x** votre mise (20% de profit) !\n` +
          `${E.dot} **Tir (1/6) :** Vous perdez votre mise et **50 PV RPG**.`,
        separator({ divider: true, spacing: 'small' }),
        `**${E.coins} \`/guess\`**\n` +
          `Trouvez un nombre secret entre 1 et 100.\n` +
          `${E.dot} Vous avez **7 essais**.\n` +
          `${E.dot} Le bot vous aide à chaque coup (plus grand / plus petit).\n` +
          `${E.dot} Plus vous trouvez vite, plus vous gagnez de pièces (jusqu'à **200 pièces**).`,
      ],
      footerOverwrite: `-# ${E.warning} Rappelez-vous : misez de manière responsable !`,
    }),
  ));
}

export const gamesCommand = { data, execute } satisfies SlashCommandDefinition;
