import type { SlashCommandDefinition } from '../../commands.js';
import { SlashCommandBuilder, type ChatInputCommandInteraction, ContainerBuilder, SectionBuilder, ThumbnailBuilder, MessageFlags } from 'discord.js';
import { getOrCreateRpgProfile, getOrCreateEconomyConfig } from '../../services/features/economyService.js';
import { COLORS_RAW, text, v2, errorContainer } from '../../utils/embeds.js';
import { E } from '../../utils/emojis.js';

const data = new SlashCommandBuilder()
  .setName('coins')
  .setDescription("🪙 Consulter le solde de pièces d'un membre")
  .addUserOption(option =>
    option
      .setName('membre')
      .setDescription('Le membre à inspecter (défaut: vous-même)')
      .setRequired(false)
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const targetUser = interaction.options.getUser('membre') ?? interaction.user;

  if (targetUser.bot) {
    await interaction.reply({
      ...v2(errorContainer('Erreur', "Les bots n'ont pas de compte en banque !")),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
    });
    return;
  }

  try {
    const profile = await getOrCreateRpgProfile(guildId, targetUser.id);
    const config = await getOrCreateEconomyConfig(guildId);

    const container = new ContainerBuilder()
      .setAccentColor(COLORS_RAW.primary)
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(text(`### ${E.coins} Portefeuille — ${targetUser.displayName}`))
          .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: targetUser.displayAvatarURL({ size: 128 }) } }))
      )
      .addTextDisplayComponents(
        text(`<@${targetUser.id}> possède actuellement **${profile.balance}** ${config.currencyEmoji} **${config.currencyName}**.`)
      );

    await interaction.reply(v2(container));
  } catch (err: unknown) {
    await interaction.reply({
      ...v2(errorContainer('Erreur', err.message || 'Impossible de consulter le solde.')),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
    });
  }
}

export const coinsCommand = { data, execute } satisfies SlashCommandDefinition;
