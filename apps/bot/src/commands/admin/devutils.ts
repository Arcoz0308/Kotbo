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

const data = new SlashCommandBuilder()
  .setName('devutils')
  .setDescription('Utilitaires pour développeurs')
  .addSubcommand(sub =>
    sub
      .setName('jwt')
      .setDescription('Décode un token JWT (sans vérifier la signature)')
      .addStringOption(option =>
        option
          .setName('token')
          .setDescription('Le token JWT à décoder')
          .setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('base64')
      .setDescription('Encode ou décode une chaîne en Base64')
      .addStringOption(option =>
        option
          .setName('action')
          .setDescription('encode ou decode')
          .setRequired(true)
          .addChoices(
            { name: 'Encoder', value: 'encode' },
            { name: 'Décoder', value: 'decode' }
          )
      )
      .addStringOption(option =>
        option
          .setName('content')
          .setDescription('La chaîne à encoder/décoder')
          .setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('hash')
      .setDescription('Génère un hash SHA-256')
      .addStringOption(option =>
        option
          .setName('content')
          .setDescription('La chaîne à hasher')
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
