import type { SlashCommandDefinition } from '../../commands.js';
import { SlashCommandBuilder, type ChatInputCommandInteraction, ContainerBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } from 'discord.js';
import prisma from '../../utils/db.js';
import { getOrCreateRpgProfile, getOrCreateEconomyConfig } from '../../services/features/economyService.js';
import { COLORS_RAW, text, v2, errorContainer } from '../../utils/embeds.js';
import { E } from '../../utils/emojis.js';

const DICE_EMOJIS = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

const data = new SlashCommandBuilder()
  .setName('dice')
  .setDescription('🎲 Lancer deux dés pour parier et tenter de gagner des pièces')
  .addIntegerOption(option =>
    option
      .setName('mise')
      .setDescription('Le montant à miser')
      .setRequired(true)
      .setMinValue(1)
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const userId = interaction.user.id;
  const bet = interaction.options.getInteger('mise', true);

  try {
    const config = await getOrCreateEconomyConfig(guildId);
    if (!config.enabled) {
      await interaction.reply({
        ...v2(errorContainer('Module Désactivé', "Le système d'économie est désactivé sur ce serveur.")),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
      });
      return;
    }

    const profile = await getOrCreateRpgProfile(guildId, userId);
    if (profile.balance < bet) {
      await interaction.reply({
        ...v2(errorContainer('Solde insuffisant', `Vous n'avez pas assez de pièces pour parier **${bet}** ${E.coins} (Solde actuel : **${profile.balance}** ${E.coins}).`)),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
      });
      return;
    }

    // Roll two dice (1 to 6)
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    const sum = d1 + d2;

    const emoji1 = DICE_EMOJIS[d1 - 1];
    const emoji2 = DICE_EMOJIS[d2 - 1];

    let multiplier = 0;
    let resultMessage = '';
    let isWin = false;
    let isDraw = false;

    if (d1 === 6 && d2 === 6) {
      multiplier = 3;
      resultMessage = `${E.trophy} **DOUBLE SIX ! C'est le jackpot ! Vous remportez 3x votre mise !**`;
      isWin = true;
    } else if (d1 === d2) {
      multiplier = 2;
      resultMessage = `${E.star} **DOUBLE ${d1} ! Vous gagnez 2x votre mise !**`;
      isWin = true;
    } else if (sum >= 8) {
      multiplier = 1.5;
      resultMessage = `${E.success} **Victoire ! Somme des dés = ${sum} (>= 8). Vous gagnez 1.5x votre mise.**`;
      isWin = true;
    } else if (sum === 7) {
      multiplier = 1;
      resultMessage = `${E.info} **Égalité ! Somme des dés = 7. Votre mise vous est remboursée.**`;
      isDraw = true;
    } else {
      multiplier = 0;
      resultMessage = `${E.error} **Défaite... Somme des dés = ${sum} (<= 6). Vous perdez votre mise.**`;
    }

    const netGain = Math.floor(bet * multiplier) - bet;
    const newBalance = profile.balance + netGain;

    await prisma.rpgProfile.update({
      where: { id: profile.id },
      data: { balance: newBalance }
    });

    let accentColor = COLORS_RAW.danger;
    if (isWin) accentColor = COLORS_RAW.success;
    else if (isDraw) accentColor = COLORS_RAW.info;

    const container = new ContainerBuilder()
      .setAccentColor(accentColor)
      .addTextDisplayComponents(text(`### ${E.coins} Lancer de Dés`))
      .addTextDisplayComponents(text(
        `Vous misez **${bet}** ${config.currencyEmoji}.\n\n` +
        `**Résultat :** ${emoji1}  ${emoji2} *(somme: ${sum})*\n\n` +
        `${resultMessage}`
      ))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(text(
        `${E.arrow} **Gain net :** **${netGain >= 0 ? '+' : ''}${netGain}** ${config.currencyEmoji}\n` +
        `${E.arrow} **Nouveau solde :** **${newBalance}** ${config.currencyEmoji}`
      ));

    await interaction.reply(v2(container));
  } catch (err: unknown) {
    await interaction.reply({
      ...v2(errorContainer('Erreur', err.message || 'Impossible de jouer aux dés.')),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
    });
  }
}

export const diceCommand = { data, execute } satisfies SlashCommandDefinition;
