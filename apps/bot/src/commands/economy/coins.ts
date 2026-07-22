import type { SlashCommandDefinition } from '../../commands.js';
import { SlashCommandBuilder, type ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { getOrCreateRpgProfile, getOrCreateEconomyConfig } from '../../services/features/economyService.js';
import { errorContainer, kotboContainer } from '../../utils/embeds.js';
import { E } from '../../utils/emojis.js';
import { v2Message } from '@arcscord/components';

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
    await interaction.reply(v2Message(
      { flags: MessageFlags.Ephemeral },
      errorContainer('Erreur', "Les bots n'ont pas de compte en banque !"),
    ));
    return;
  }

  try {
    const profile = await getOrCreateRpgProfile(guildId, targetUser.id);
    const config = await getOrCreateEconomyConfig(guildId);

    await interaction.reply(v2Message(
      kotboContainer({
        color: 'primary',
        title: `${E.coins} Portefeuille — ${targetUser.displayName}`,
        titleThumbnail: { url: targetUser.displayAvatarURL({ size: 128 }) },
        fields: [
          `<@${targetUser.id}> possède actuellement **${profile.balance}** ${config.currencyEmoji} **${config.currencyName}**.`,
        ],
      }),
    ));
  } catch (err: unknown) {
    await interaction.reply(v2Message(
      { flags: MessageFlags.Ephemeral },
      errorContainer('Erreur', err instanceof Error ? err.message : 'Impossible de consulter le solde.'),
    ));
  }
}

export const coinsCommand = { data, execute } satisfies SlashCommandDefinition;
