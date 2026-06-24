import type { SlashCommandDefinition } from '../../commands.js';
import { SlashCommandBuilder, type ChatInputCommandInteraction, MessageFlags, EmbedBuilder } from 'discord.js';
import { work, getOrCreateEconomyConfig } from '../../services/features/economyService.js';
import { errorEmbed, COLORS } from '../../utils/embeds.js';

const data = new SlashCommandBuilder()
  .setName('work')
  .setDescription("💼 Travaille pendant une heure pour gagner des pièces et de l'XP");

const WORK_MESSAGES = [
  "Vous avez nettoyé la taverne locale du sol au plafond.",
  "Vous avez escorté une caravane de marchands à travers la Forêt Mystique.",
  "Vous avez aidé le forgeron à battre le fer toute la journée.",
  "Vous avez cueilli des herbes médicinales pour l'alchimiste.",
  "Vous avez surveillé les portes de la ville pendant la nuit.",
  "Vous avez pêché dans le lac sacré et vendu vos meilleures prises.",
  "Vous avez traduit des grimoires anciens pour la bibliothèque du mage.",
  "Vous avez miné du minerai de fer au fond des mines sombres.",
  "Vous avez capturé des rats géants dans les caves du châtelain.",
  "Vous avez servi des pintes de bière aux aventuriers assoiffés."
];

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const userId = interaction.user.id;

  try {
    const result = await work(guildId, userId);
    const config = await getOrCreateEconomyConfig(guildId);

    if (result.cooldown) {
      await interaction.reply({
        embeds: [
          errorEmbed(
            'Fatigué(e)',
            `Vous devez vous reposer encore **${result.remainingMinutes} minutes et ${result.remainingSeconds} secondes** avant de pouvoir retravailler.`
          )
        ],
        flags: [MessageFlags.Ephemeral]
      });
      return;
    }

    const workMessage = WORK_MESSAGES[Math.floor(Math.random() * WORK_MESSAGES.length)];

    const embed = new EmbedBuilder()
      .setTitle('💼 Travail Terminé !')
      .setDescription(`${workMessage}\n\n**Gains :**\n🪙 +**${result.salary}** ${config.currencyEmoji} ${config.currencyName}\n⭐ +**${result.xpReward}** XP`)
      .addFields({ name: 'Nouveau solde', value: `**${result.newBalance}** ${config.currencyEmoji}` })
      .setColor(COLORS.success)
      .setTimestamp();

    if (result.levelUp) {
      embed.addFields({
        name: '🎉 NIVEAU RPG SUPÉRIEUR !',
        value: `Félicitations, vous passez **Niveau ${result.levelUp}** ! Vos PV ont été restaurés et vos caractéristiques augmentées.`
      });
    }

    await interaction.reply({ embeds: [embed] });
  } catch (err: unknown) {
    await interaction.reply({
      embeds: [errorEmbed('Erreur', err.message || 'Impossible de travailler.')],
      flags: [MessageFlags.Ephemeral]
    });
  }
}

export const workCommand = { data, execute } satisfies SlashCommandDefinition;
