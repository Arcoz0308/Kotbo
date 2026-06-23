import type { SlashCommandDefinition } from '../../commands.js';
import { SlashCommandBuilder, type ChatInputCommandInteraction, ContainerBuilder, SeparatorBuilder, SeparatorSpacingSize } from 'discord.js';
import { COLORS_RAW, text, v2 } from '../../utils/embeds.js';
import { E } from '../../utils/emojis.js';

const data = new SlashCommandBuilder()
  .setName('games')
  .setDescription("🎮 Obtenir des informations détaillées sur les jeux de l'économie");

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const container = new ContainerBuilder()
    .setAccentColor(COLORS_RAW.primary)
    .addTextDisplayComponents(text(`### ${E.coins} Mini-Jeux de l'Économie`))
    .addTextDisplayComponents(text('Tentez de faire fructifier vos pièces ou de vous divertir grâce aux commandes de jeu ci-dessous !'))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(text(
      `**${E.coins} \`/dice <mise>\`**\n` +
      `Lancez deux dés de 1 à 6.\n` +
      `${E.dot} **Double 6 :** Gagnez **3x** votre mise !\n` +
      `${E.dot} **Autre Double :** Gagnez **2x** votre mise !\n` +
      `${E.dot} **Somme >= 8 :** Gagnez **1.5x** votre mise !\n` +
      `${E.dot} **Somme = 7 :** Égalité (mise remboursée)\n` +
      `${E.dot} **Somme <= 6 :** Vous perdez votre mise.`
    ))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(text(
      `**${E.coins} \`/rps <choix> <mise>\`**\n` +
      `Jouez à Pierre, Feuille, Ciseaux contre le bot.\n` +
      `${E.dot} **Victoire :** Gagnez **2x** votre mise !\n` +
      `${E.dot} **Égalité :** Mise remboursée\n` +
      `${E.dot} **Défaite :** Vous perdez votre mise.`
    ))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(text(
      `**${E.coins} \`/roulette <mise>\`**\n` +
      `Tentez la roulette russe avec 1 chance sur 6 de vous faire tirer dessus.\n` +
      `${E.dot} **Survie (5/6) :** Gagnez **1.2x** votre mise (20% de profit) !\n` +
      `${E.dot} **Tir (1/6) :** Vous perdez votre mise et **50 PV RPG**.`
    ))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(text(
      `**${E.coins} \`/guess\`**\n` +
      `Trouvez un nombre secret entre 1 et 100.\n` +
      `${E.dot} Vous avez **7 essais**.\n` +
      `${E.dot} Le bot vous aide à chaque coup (plus grand / plus petit).\n` +
      `${E.dot} Plus vous trouvez vite, plus vous gagnez de pièces (jusqu'à **200 pièces**).`
    ))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(text(`-# ${E.warning} Rappelez-vous : misez de manière responsable !`));

  await interaction.reply(v2(container));
}

export const gamesCommand = { data, execute } satisfies SlashCommandDefinition;
