import type { SlashCommandDefinition } from '../../commands.js';
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { getEffectiveLocale, getCommandMetadata } from '../../utils/i18n.js';
import * as m from '../../lib/paraglide/messages.js';

const meta = getCommandMetadata('b2_mpsay');

const data = new SlashCommandBuilder()
  .setName(meta.name)
  .setNameLocalizations(meta.nameLocalizations)
  .setDescription(meta.description)
  .setDescriptionLocalizations(meta.descriptionLocalizations)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addUserOption(option =>
    option
      .setName('destinataire')
      .setDescription(m.b2_mpsay_opt_destinataire({}, { locale: 'en' }))
      .setDescriptionLocalizations({ fr: m.b2_mpsay_opt_destinataire({}, { locale: 'fr' }) })
      .setRequired(true),
  )
  .addStringOption(option =>
    option
      .setName('message')
      .setDescription(m.b2_mpsay_opt_message({}, { locale: 'en' }))
      .setDescriptionLocalizations({ fr: m.b2_mpsay_opt_message({}, { locale: 'fr' }) })
      .setRequired(true)
      .setMaxLength(4000),
  );

async function execute(interaction: ChatInputCommandInteraction) {
  const locale = await getEffectiveLocale(interaction);

  if (!interaction.guildId) {
    await interaction.reply({
      embeds: [errorEmbed(m.b2_err_title({}, { locale }), m.b2_guild_only({}, { locale }))],
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const targetUser = interaction.options.getUser('destinataire', true);
  const message = interaction.options.getString('message', true);

  try {
    const serverName = interaction.guild?.name ?? 'serveur';

    const button = new ButtonBuilder()
      .setCustomId('mpsay_server_origin')
      .setLabel(m.b2_mpsay_sent_from({ server: serverName }, { locale }))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

    await targetUser.send({
      content: message,
      components: [row],
    });

    await interaction.reply({
      embeds: [successEmbed(m.b2_mpsay_sent_title({}, { locale }), m.b2_mpsay_sent_desc({ tag: targetUser.tag }, { locale }))],
      flags: [MessageFlags.Ephemeral],
    });

    logger.info('Mpsay', `${interaction.user.tag} a envoyé un MP à ${targetUser.tag} (${targetUser.id}) depuis le serveur ${serverName} (${interaction.guildId})`);
  } catch (error) {
    logger.error('Mpsay', `Impossible d'envoyer le message privé à ${targetUser.tag} :`, error);
    await interaction.reply({
      embeds: [errorEmbed(m.b2_err_title({}, { locale }), m.b2_mpsay_failed_desc({ tag: targetUser.tag }, { locale }))],
      flags: [MessageFlags.Ephemeral],
    });
  }
}

export const mpsayCommand = { data, execute } satisfies SlashCommandDefinition;
