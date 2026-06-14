import type { SlashCommandDefinition } from '../../commands.js';
import { SlashCommandBuilder, type ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { getOrCreateEconomyConfig } from '../../services/features/economyService.js';
import { COLORS } from '../../utils/embeds.js';

const data = new SlashCommandBuilder()
  .setName('economy-info')
  .setDescription('🪙 Tout ce qu’il faut savoir sur l’économie du serveur');

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;

  try {
    const config = await getOrCreateEconomyConfig(guildId);

    const embed = new EmbedBuilder()
      .setTitle(`🪙 Économie de Kotbo — ${interaction.guild?.name}`)
      .setDescription(
        `Bienvenue dans le système économique et RPG du serveur !\n` +
        `La monnaie officielle est le **${config.currencyName}** ${config.currencyEmoji}.\n\n` +
        `### 📈 Comment gagner des pièces ?\n` +
        `• **Messages textuels :** Discuter dans les salons rapporte entre 1 et 4 pièces par message (cooldown de 1 min).\n` +
        `• **Salons Vocaux :** Être en vocal rapporte entre 3 et 10 pièces toutes les 2 min.\n` +
        `• **Récompense quotidienne :** Réclamez vos pièces gratuites toutes les 20h avec \`/daily\`.\n` +
        `• **Travail :** Utilisez \`/work\` toutes les heures pour un salaire fixe indexé sur votre niveau RPG.\n` +
        `• **Mini-Jeux :** Gagnez gros aux dés (\`/dice\`), au rps (\`/rps\`), à la roulette (\`/roulette\`) ou en devinant (\`/guess\`).\n\n` +
        `### 🛒 Boutique & Profil RPG\n` +
        `• Utilisez vos pièces pour acheter des armes, des armures ou des potions dans la boutique (\`/shop\` et \`/buy\`).\n` +
        `• Visualisez vos objets achetés avec \`/items\`.\n` +
        `• Équipez votre matériel ou consommez vos potions avec \`/use\`. Avoir de l'équipement augmente vos statistiques d'attaque et de défense RPG.`
      )
      .setColor(COLORS.primary)
      .setFooter({ text: `Kotbo Economy · Activé : ${config.enabled ? 'Oui ✅' : 'Non ❌'}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (err: any) {
    // Basic fallback if config fetch fails
    await interaction.reply({ content: 'Impossible de récupérer les informations de l’économie.', ephemeral: true });
  }
}

export const economyInfoCommand = { data, execute } satisfies SlashCommandDefinition;
