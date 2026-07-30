import type { SlashCommandDefinition } from '../../commands.js';
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  MessageFlags,
  EmbedBuilder,
  PermissionFlagsBits,
  TextChannel,
} from 'discord.js';
import { errorEmbed, successEmbed, COLORS } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { getEffectiveLocale, getCommandMetadata } from '../../utils/i18n.js';
import * as m from '../../lib/paraglide/messages.js';

const COLOR_KEYS = ['blue', 'green', 'red', 'yellow', 'purple', 'dark', 'white'] as const;

const COLOR_CHOICES = COLOR_KEYS.map((key) => ({
  name: (m as any)[`b2_say_color_${key}`]({}, { locale: 'en' }) as string,
  name_localizations: { fr: (m as any)[`b2_say_color_${key}`]({}, { locale: 'fr' }) as string },
  value: key,
}));

const COLOR_MAP: Record<string, number> = {
  blue: 0x5865f2,
  green: 0x57f287,
  red: 0xed4245,
  yellow: 0xfee75c,
  purple: 0x9b59b6,
  dark: 0x2b2d31,
  white: 0xffffff,
};

const meta = getCommandMetadata('b2_say');

const data = new SlashCommandBuilder()
  .setName(meta.name)
  .setNameLocalizations(meta.nameLocalizations)
  .setDescription(meta.description)
  .setDescriptionLocalizations(meta.descriptionLocalizations)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addStringOption(option =>
    option
      .setName('message')
      .setDescription(m.b2_say_opt_message({}, { locale: 'en' }))
      .setDescriptionLocalizations({ fr: m.b2_say_opt_message({}, { locale: 'fr' }) })
      .setRequired(true)
      .setMaxLength(4000),
  )
  .addChannelOption(option =>
    option
      .setName('salon')
      .setDescription(m.b2_say_opt_salon({}, { locale: 'en' }))
      .setDescriptionLocalizations({ fr: m.b2_say_opt_salon({}, { locale: 'fr' }) })
      .setRequired(false),
  )
  .addStringOption(option =>
    option
      .setName('titre')
      .setDescription(m.b2_say_opt_titre({}, { locale: 'en' }))
      .setDescriptionLocalizations({ fr: m.b2_say_opt_titre({}, { locale: 'fr' }) })
      .setRequired(false)
      .setMaxLength(256),
  )
  .addStringOption(option =>
    option
      .setName('couleur')
      .setDescription(m.b2_say_opt_couleur({}, { locale: 'en' }))
      .setDescriptionLocalizations({ fr: m.b2_say_opt_couleur({}, { locale: 'fr' }) })
      .setRequired(false)
      .addChoices(...COLOR_CHOICES),
  )
  .addBooleanOption(option =>
    option
      .setName('anonyme')
      .setDescription(m.b2_say_opt_anonyme({}, { locale: 'en' }))
      .setDescriptionLocalizations({ fr: m.b2_say_opt_anonyme({}, { locale: 'fr' }) })
      .setRequired(false),
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

  const message = interaction.options.getString('message', true);
  const title = interaction.options.getString('titre') ?? null;
  const colorKey = interaction.options.getString('couleur') ?? 'blue';
  const anonyme = interaction.options.getBoolean('anonyme') ?? false;
  const targetChannel = interaction.options.getChannel('salon') ?? interaction.channel;

  if (!targetChannel || !(targetChannel instanceof TextChannel)) {
    await interaction.reply({
      embeds: [errorEmbed(m.b2_say_invalid_channel_title({}, { locale }), m.b2_say_invalid_channel_desc({}, { locale }))],
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  try {
    // Mode embed : uniquement si un titre est fourni ou une couleur/anonymat est demandé
    if (title || interaction.options.getString('couleur') || anonyme) {
      const color = COLOR_MAP[colorKey] ?? COLORS.primary;

      const embed = new EmbedBuilder()
        .setColor(color)
        .setDescription(message)
        .setTimestamp();

      if (title) {
        embed.setTitle(title);
      }

      if (!anonyme) {
        embed.setFooter({
          text: m.b2_say_footer({ user: interaction.user.displayName }, { locale }),
          iconURL: interaction.user.displayAvatarURL(),
        });
      }

      await targetChannel.send({ embeds: [embed] });
    } else {
      // Mode message simple : texte brut
      await targetChannel.send({ content: message });
    }

    await interaction.reply({
      embeds: [successEmbed(m.b2_say_sent_title({}, { locale }), m.b2_say_sent_desc({ channel: `<#${targetChannel.id}>` }, { locale }))],
      flags: [MessageFlags.Ephemeral],
    });

    logger.info('Say', `${interaction.user.tag} a envoyé un message dans #${targetChannel.name} (${interaction.guildId})`);
  } catch (error) {
    logger.error('Say', "Impossible d'envoyer le message :", error);
    await interaction.reply({
      embeds: [errorEmbed(m.b2_err_title({}, { locale }), m.b2_say_error({}, { locale }))],
      flags: [MessageFlags.Ephemeral],
    });
  }
}

export const sayCommand = { data, execute } satisfies SlashCommandDefinition;
