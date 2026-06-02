import type { SlashCommandDefinition } from '../commands.js';
import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { infoEmbed, errorEmbed } from '../utils/embeds.js';
import prisma from '../utils/db.js';

function getStatusEmoji(code: number): string {
  if (code >= 200 && code < 300) return '🟢';
  if (code >= 300 && code < 400) return '🔵';
  if (code >= 400 && code < 500) return '🟠';
  return '🔴';
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
    504: 'Délai d’attente de la passerelle dépassé',
  };
  return labels[code] ?? 'Statut inconnu';
}

const data = new SlashCommandBuilder()
  .setName('status')
  .setDescription('🌐 Vérifie le statut HTTP d\'une URL')
  .addStringOption(option =>
    option
      .setName('url')
      .setDescription('L\'URL à vérifier (ex: https://example.com)')
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
      await interaction.reply({
        embeds: [
          errorEmbed(
            'Canal non autorisé',
            `La commande /status est limitée à <#${guild.statusCheckChannelId}> sur ce serveur.`
          ),
        ],
        flags: 64,
      });
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
    await interaction.reply({
      embeds: [errorEmbed('URL invalide', 'La URL fournie n\'est pas valide')],
      flags: 64,
    });
    return;
  }

  try {
    const startTime = Date.now();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url.toString(), {
      method: 'GET',
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeoutId);
    const latency = Date.now() - startTime;

    const emoji = getStatusEmoji(response.status);
    const label = getStatusLabel(response.status);

    await interaction.reply({
      embeds: [
        infoEmbed(
          'Vérification du statut',
          undefined,
          [
            {
              name: 'URL',
              value: `${url.hostname}`,
              inline: true,
            },
            {
              name: 'Code HTTP',
              value: `${emoji} **${response.status}** ${label}`,
              inline: true,
            },
            {
              name: 'Latence',
              value: `⏱️ ${latency}ms`,
              inline: true,
            },
          ]
        ),
      ],
    });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    const message = isTimeout 
      ? 'Timeout après 5 secondes - le serveur ne répond pas'
      : error instanceof Error 
        ? error.message 
        : 'Impossible de se connecter';

    await interaction.reply({
      embeds: [
        errorEmbed(
          'Erreur de connexion',
          `🔴 ${message}`
        ),
      ],
      flags: 64,
    });
  }
}

export const statusCommand = { data, execute } satisfies SlashCommandDefinition;
