import type { SlashCommandDefinition } from '../../commands.js';
import { SlashCommandBuilder, type ChatInputCommandInteraction, ContainerBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } from 'discord.js';
import { getOrCreateEconomyConfig } from '../../services/features/economyService.js';
import { COLORS_RAW, text, v2 } from '../../utils/embeds.js';
import { E } from '../../utils/emojis.js';

const data = new SlashCommandBuilder()
  .setName('economy-info')
  .setDescription("🪙 Tout ce qu'il faut savoir sur l'économie du serveur");

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;

  try {
    const config = await getOrCreateEconomyConfig(guildId);

    const container = new ContainerBuilder()
      .setAccentColor(COLORS_RAW.primary)
      .addTextDisplayComponents(text(`### ${E.coins} Économie de Kotbo — ${interaction.guild?.name}`))
      .addTextDisplayComponents(text(
        `Bienvenue dans le système économique et RPG du serveur !\n` +
        `La monnaie officielle est le **${config.currencyName}** ${config.currencyEmoji}.`
      ))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(text(
        `### ${E.stats} Comment gagner des pièces ?\n` +
        `${E.dot} **Messages textuels :** Discuter dans les salons rapporte entre 1 et 4 pièces par message (cooldown de 1 min).\n` +
        `${E.dot} **Salons Vocaux :** Être en vocal rapporte entre 3 et 10 pièces toutes les 2 min.\n` +
        `${E.dot} **Récompense quotidienne :** Réclamez vos pièces gratuites toutes les 20h avec \`/daily\`.\n` +
        `${E.dot} **Travail :** Utilisez \`/work\` toutes les heures pour un salaire fixe indexé sur votre niveau RPG.\n` +
        `${E.dot} **Mini-Jeux :** Gagnez gros aux dés (\`/dice\`), au rps (\`/rps\`), à la roulette (\`/roulette\`) ou en devinant (\`/guess\`).`
      ))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(text(
        `### ${E.coins} Boutique & Profil RPG\n` +
        `${E.dot} Utilisez vos pièces pour acheter des armes, des armures ou des potions dans la boutique (\`/shop\` et \`/buy\`).\n` +
        `${E.dot} Visualisez vos objets achetés avec \`/items\`.\n` +
        `${E.dot} Équipez votre matériel ou consommez vos potions avec \`/use\`. Avoir de l'équipement augmente vos statistiques d'attaque et de défense RPG.`
      ))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(text(`-# ${E.info} Activé : ${config.enabled ? `${E.success} Oui` : `${E.error} Non`}`));

    await interaction.reply(v2(container));
  } catch (err: unknown) {
    await interaction.reply({ content: `${E.error} Impossible de récupérer les informations de l'économie.`, flags: [MessageFlags.Ephemeral] });
  }
}

export const economyInfoCommand = { data, execute } satisfies SlashCommandDefinition;
