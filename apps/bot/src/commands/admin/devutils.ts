import type { SlashCommandDefinition } from '../../commands.js';
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js';
import { errorContainer, kotboContainer } from '../../utils/embeds.js';
import { E } from '../../utils/emojis.js';
import { createHash } from 'crypto';
import { separator, v2Message } from '@arcscord/components';
import { getCommandMetadata } from '../../utils/i18n.js';
import * as m from '../../lib/paraglide/messages.js';

const meta = getCommandMetadata('c1_devutils');
const jwtMeta = getCommandMetadata('c1_devutils_jwt');
const base64Meta = getCommandMetadata('c1_devutils_base64');
const hashMeta = getCommandMetadata('c1_devutils_hash');

const data = new SlashCommandBuilder()
  .setName(meta.name)
  .setNameLocalizations(meta.nameLocalizations)
  .setDescription(meta.description)
  .setDescriptionLocalizations(meta.descriptionLocalizations)
  .addSubcommand(sub =>
    sub
      .setName(jwtMeta.name)
      .setNameLocalizations(jwtMeta.nameLocalizations)
      .setDescription(jwtMeta.description)
      .setDescriptionLocalizations(jwtMeta.descriptionLocalizations)
      .addStringOption(option =>
        option
          .setName('token')
          .setDescription(m.c1_devutils_jwt_opt_token({}, { locale: 'en' }))
          .setDescriptionLocalizations({ fr: m.c1_devutils_jwt_opt_token({}, { locale: 'fr' }) })
          .setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName(base64Meta.name)
      .setNameLocalizations(base64Meta.nameLocalizations)
      .setDescription(base64Meta.description)
      .setDescriptionLocalizations(base64Meta.descriptionLocalizations)
      .addStringOption(option =>
        option
          .setName('action')
          .setDescription(m.c1_devutils_base64_opt_action({}, { locale: 'en' }))
          .setDescriptionLocalizations({ fr: m.c1_devutils_base64_opt_action({}, { locale: 'fr' }) })
          .setRequired(true)
          .addChoices(
            {
              name: m.c1_devutils_base64_choice_encode({}, { locale: 'en' }),
              name_localizations: { fr: m.c1_devutils_base64_choice_encode({}, { locale: 'fr' }) },
              value: 'encode',
            },
            {
              name: m.c1_devutils_base64_choice_decode({}, { locale: 'en' }),
              name_localizations: { fr: m.c1_devutils_base64_choice_decode({}, { locale: 'fr' }) },
              value: 'decode',
            }
          )
      )
      .addStringOption(option =>
        option
          .setName('content')
          .setDescription(m.c1_devutils_base64_opt_content({}, { locale: 'en' }))
          .setDescriptionLocalizations({ fr: m.c1_devutils_base64_opt_content({}, { locale: 'fr' }) })
          .setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName(hashMeta.name)
      .setNameLocalizations(hashMeta.nameLocalizations)
      .setDescription(hashMeta.description)
      .setDescriptionLocalizations(hashMeta.descriptionLocalizations)
      .addStringOption(option =>
        option
          .setName('content')
          .setDescription(m.c1_devutils_hash_opt_content({}, { locale: 'en' }))
          .setDescriptionLocalizations({ fr: m.c1_devutils_hash_opt_content({}, { locale: 'fr' }) })
          .setRequired(true)
      )
  );

function decodeJwt(token: string): { header: unknown; payload: unknown } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const header = JSON.parse(Buffer.from(parts[0]!, 'base64').toString());
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64').toString());

    return { header, payload };
  } catch {
    return null;
  }
}

function base64Encode(str: string): string {
  return Buffer.from(str).toString('base64');
}

function base64Decode(str: string): string {
  try {
    return Buffer.from(str, 'base64').toString('utf-8');
  } catch {
    throw new Error('Invalid Base64');
  }
}

function sha256(str: string): string {
  return createHash('sha256').update(str).digest('hex');
}

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();

  try {
    if (subcommand === 'jwt') {
      const token = interaction.options.getString('token', true);
      const decoded = decodeJwt(token);

      if (!decoded) {
        await interaction.reply(v2Message(
          { flags: MessageFlags.Ephemeral },
          errorContainer('JWT invalide', "Le token fourni n'est pas un JWT valide"),
        ));
        return;
      }

      await interaction.reply(v2Message(
        kotboContainer({
          color: 'info',
          title: `${E.info} Décodage JWT`,
          fields: [
            separator({ divider: true, spacing: 'small' }),
            `**Header**\n\`\`\`json\n${JSON.stringify(decoded.header, null, 2)}\n\`\`\``,
            `**Payload**\n\`\`\`json\n${JSON.stringify(decoded.payload, null, 2)}\n\`\`\``,
          ],
        }),
      ));
    } else if (subcommand === 'base64') {
      const action = interaction.options.getString('action', true);
      const content = interaction.options.getString('content', true);

      let result: string;
      if (action === 'encode') {
        result = base64Encode(content);
      } else {
        result = base64Decode(content);
      }

      await interaction.reply(v2Message(
        kotboContainer({
          color: 'info',
          title: `${E.info} Base64 ${action === 'encode' ? 'Encodé' : 'Décodé'}`,
          fields: [
            separator({ divider: true, spacing: 'small' }),
            `**Résultat**\n\`\`\`\n${result}\n\`\`\``,
          ],
        }),
      ));
    } else if (subcommand === 'hash') {
      const content = interaction.options.getString('content', true);
      const hash = sha256(content);

      await interaction.reply(v2Message(
        kotboContainer({
          color: 'info',
          title: `${E.info} SHA-256 Hash`,
          fields: [
            separator({ divider: true, spacing: 'small' }),
            `**Résultat**\n\`\`\`\n${hash}\n\`\`\``,
          ],
        }),
      ));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Une erreur est survenue';
    await interaction.reply(v2Message(
      { flags: MessageFlags.Ephemeral },
      errorContainer('Erreur', message),
    ));
  }
}

export const devutilsCommand = { data, execute } satisfies SlashCommandDefinition;
