import type { SlashCommandDefinition } from '../../commands.js';
import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { infoEmbed } from '../../utils/embeds.js';
import { getEffectiveLocale, getCommandMetadata } from '../../utils/i18n.js';
import * as m from '../../lib/paraglide/messages.js';

const meta = getCommandMetadata('b2_dashboard');

const data = new SlashCommandBuilder()
  .setName(meta.name)
  .setNameLocalizations(meta.nameLocalizations)
  .setDescription(meta.description)
  .setDescriptionLocalizations(meta.descriptionLocalizations);

export async function execute(interaction: ChatInputCommandInteraction) {
  const dashboardUrl = process.env.DASHBOARD_URL || 'http://localhost:5173';
  const locale = await getEffectiveLocale(interaction);

  const embed = infoEmbed(
    m.b2_dashboard_title({}, { locale }),
    m.b2_dashboard_desc({ url: dashboardUrl }, { locale }),
    [],
    { user: interaction.user }
  );

  const button = new ButtonBuilder()
    .setLabel(m.b2_dashboard_button({}, { locale }))
    .setURL(dashboardUrl)
    .setStyle(ButtonStyle.Link)
    .setEmoji('🌐');

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

  await interaction.reply({
    embeds: [embed],
    components: [row],
    flags: [MessageFlags.Ephemeral],
  });
}

export const dashboardCommand = { data, execute } satisfies SlashCommandDefinition;
