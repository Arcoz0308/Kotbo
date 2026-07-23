import { errorMessage } from '../../utils/errors.js';
import type { SlashCommandDefinition } from '../../commands.js';
import { SlashCommandBuilder, type ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from 'discord.js';
import prisma from '../../utils/db.js';
import { getOrCreateRpgProfile, getOrCreateEconomyConfig } from '../../services/features/economyService.js';
import { errorEmbed, COLORS } from '../../utils/embeds.js';

const CHOICES = ['pierre', 'feuille', 'ciseaux'];
const EMOJIS: Record<string, string> = {
  pierre: '🪨 Pierre',
  feuille: '📄 Feuille',
  ciseaux: '✂️ Ciseaux'
};

const data = new SlashCommandBuilder()
  .setName('rps')
  .setDescription('🪨 Pierre, Feuille, Ciseaux pour parier et doubler vos pièces')
  .addStringOption(option =>
    option
      .setName('choix')
      .setDescription('Votre coup')
      .setRequired(true)
      .addChoices(
        { name: '🪨 Pierre', value: 'pierre' },
        { name: '📄 Feuille', value: 'feuille' },
        { name: '✂️ Ciseaux', value: 'ciseaux' }
      )
  )
  .addIntegerOption(option =>
    option
      .setName('mise')
      .setDescription('Le montant à parier')
      .setRequired(true)
      .setMinValue(1)
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const userId = interaction.user.id;
  const userChoice = interaction.options.getString('choix', true);
  const bet = interaction.options.getInteger('mise', true);

  try {
    const config = await getOrCreateEconomyConfig(guildId);
    if (!config.enabled) {
      await interaction.reply({
        embeds: [errorEmbed('Module Désactivé', "Le système d'économie est désactivé sur ce serveur.")],
        flags: [MessageFlags.Ephemeral]
      });
      return;
    }

    const profile = await getOrCreateRpgProfile(guildId, userId);
    if (profile.balance < bet) {
      await interaction.reply({
        embeds: [errorEmbed('Solde insuffisant', `Vous n'avez pas assez de pièces pour parier **${bet}** 🪙 (Solde actuel : **${profile.balance}** 🪙).`)],
        flags: [MessageFlags.Ephemeral]
      });
      return;
    }

    // Bot choice
    const botChoice = CHOICES[Math.floor(Math.random() * CHOICES.length)]!;

    let result = ''; // 'win', 'lose', 'draw'
    if (userChoice === botChoice) {
      result = 'draw';
    } else if (
      (userChoice === 'pierre' && botChoice === 'ciseaux') ||
      (userChoice === 'feuille' && botChoice === 'pierre') ||
      (userChoice === 'ciseaux' && botChoice === 'feuille')
    ) {
      result = 'win';
    } else {
      result = 'lose';
    }

    let multiplier = 0;
    let resultMessage = '';
    let embedColor = COLORS.info;

    if (result === 'win') {
      multiplier = 2;
      resultMessage = `🎉 **Victoire ! Vous battez le bot et remportez 2x votre mise !**`;
      embedColor = COLORS.success;
    } else if (result === 'draw') {
      multiplier = 1;
      resultMessage = `⚖️ **Égalité ! Vous jouez le même coup. Votre mise vous est remboursée.**`;
      embedColor = COLORS.info;
    } else {
      multiplier = 0;
      resultMessage = `😢 **Défaite... Le bot vous bat. Vous perdez votre mise.**`;
      embedColor = COLORS.danger;
    }

    const netGain = Math.floor(bet * multiplier) - bet;
    const newBalance = profile.balance + netGain;

    await prisma.rpgProfile.update({
      where: { id: profile.id },
      data: { balance: newBalance }
    });

    const embed = new EmbedBuilder()
      .setTitle('🪨 Pierre, Feuille, Ciseaux')
      .setDescription(
        `Vous misez **${bet}** ${config.currencyEmoji}.\n\n` +
        `**Votre coup :** ${EMOJIS[userChoice]}\n` +
        `**Coup du bot :** ${EMOJIS[botChoice]}\n\n` +
        `${resultMessage}\n\n` +
        `**Gain net :** **${netGain >= 0 ? '+' : ''}${netGain}** ${config.currencyEmoji}\n` +
        `**Nouveau solde :** **${newBalance}** ${config.currencyEmoji}`
      )
      .setColor(embedColor)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (err: unknown) {
    await interaction.reply({
      embeds: [errorEmbed('Erreur', errorMessage(err) || 'Impossible de jouer au rps.')],
      flags: [MessageFlags.Ephemeral]
    });
  }
}

export const rpsCommand = { data, execute } satisfies SlashCommandDefinition;
