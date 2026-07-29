import type { SlashCommandDefinition } from '../../commands.js';
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js';
import { errorContainer, kotboContainer } from '../../utils/embeds.js';
import { E } from '../../utils/emojis.js';
import prisma from '../../utils/db.js';
import { separator, v2Message } from '@arcscord/components';
import { getCommandMetadata } from '../../utils/i18n.js';
import * as m from '../../lib/paraglide/messages.js';
import { fetchExternal } from '../../utils/http.js';

function getStatusEmoji(code: number): string {
  if (code >= 200 && code < 300) return E.success;
  if (code >= 300 && code < 400) return E.info;
  if (code >= 400 && code < 500) return E.warning;
  return E.error;
}

function getStatusLabel(code: number): string {
  const labels: Record<number, string> = {
    200: 'OK',
    201: 'Créé',
    204: 'Aucun contenu',
    301: 'Déplacé définitivement',
    302: 'Trouvé',
    304: 'Non modifié',
    400: 'Requête incorrecte',
    401: 'Non autorisé',
    403: 'Interdit',
    404: 'Introuvable',
    429: 'Trop de requêtes',
    500: 'Erreur interne du serveur',
    502: 'Passerelle invalide',
    503: 'Service indisponible',
    504: "Délai d'attente de la passerelle dépassé",
  };
  return labels[code] ?? 'Statut inconnu';
}

const meta = getCommandMetadata('c6_status');

const data = new SlashCommandBuilder()
  .setName(meta.name)
  .setNameLocalizations(meta.nameLocalizations)
  .setDescription(meta.description)
  .setDescriptionLocalizations(meta.descriptionLocalizations)
  .addStringOption(option =>
    option
      .setName('url')
      .setDescription(m.c6_status_opt_url({}, { locale: 'en' }))
      .setDescriptionLocalizations({ fr: m.c6_status_opt_url({}, { locale: 'fr' }) })
      .setRequired(true)
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const urlInput = interaction.options.getString('url', true);

  const guildId = interaction.guildId;
  if (guildId) {
    const guild = await prisma.guild.findUnique({
      where: { id: guildId },
      select: { statusCheckChannelId: true },
    });

    if (guild?.statusCheckChannelId && interaction.channelId !== guild.statusCheckChannelId) {
      await interaction.reply(v2Message(
        { flags: MessageFlags.Ephemeral },
        errorContainer('Canal non autorisé', `La commande /status est limitée à <#${guild.statusCheckChannelId}> sur ce serveur.`),
      ));
      return;
    }
  }

  // Valide et analyse l'URL
  let url: URL;
  try {
    // Ajoute le protocole s'il manque
    const urlStr = urlInput.startsWith('http') ? urlInput : `https://${urlInput}`;
    url = new URL(urlStr);
  } catch {
    await interaction.reply(v2Message(
      { flags: MessageFlags.Ephemeral },
      errorContainer('URL invalide', "La URL fournie n'est pas valide"),
    ));
    return;
  }

  try {
    const startTime = Date.now();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetchExternal(url.toString(), {
      method: 'GET',
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeoutId);
    const latency = Date.now() - startTime;

    const emoji = getStatusEmoji(response.status);
    const label = getStatusLabel(response.status);

    await interaction.reply(v2Message(
      kotboContainer({
        color: 'info',
        title: `${E.link} Vérification du statut`,
        fields: [
          separator({ divider: true, spacing: 'small' }),
          `**URL**\n${url.hostname}`,
          `**Code HTTP**\n${emoji} **${response.status}** ${label}`,
          `**Latence**\n${E.clock} ${latency}ms`,
        ],
      }),
    ));
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    const message = isTimeout
      ? 'Timeout après 5 secondes - le serveur ne répond pas'
      : error instanceof Error
        ? error.message
        : 'Impossible de se connecter';

    await interaction.reply(v2Message(
      { flags: MessageFlags.Ephemeral },
      errorContainer('Erreur de connexion', message),
    ));
  }
}

export const statusCommand = { data, execute } satisfies SlashCommandDefinition;
