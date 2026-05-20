import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type GuildMember,
  TextChannel,
  type Message,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';
import prisma from '../utils/db.js';
import { successEmbed, errorEmbed } from '../utils/embeds.js';
import { generateTranscriptFromMessages } from '../services/transcriptService.js';
import { logger } from '../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('transcript')
  .setDescription('📄 Génère une transcription des messages de ce salon')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addIntegerOption((option) =>
    option
      .setName('nombre')
      .setDescription('Nombre de messages à transcrire depuis maintenant')
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(5000)
  )
  .addStringOption((option) =>
    option
      .setName('temps')
      .setDescription('Durée écoulée (ex: 2h, 1j, 30m, 7j)')
      .setRequired(false)
  )
  .addStringOption((option) =>
    option
      .setName('message_id')
      .setDescription('ID du message de départ (transcrit de ce message jusqu\'à maintenant)')
      .setRequired(false)
  );

export function parseDurationToMs(durationStr: string): number | null {
  const match = durationStr.trim().toLowerCase().match(/^(\d+)\s*(m|h|d|j|s|w|min|heures?|jours?|semaines?)$/);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case 'm':
    case 'min':
      return value * 60 * 1000;
    case 'h':
    case 'heure':
    case 'heures':
      return value * 60 * 60 * 1000;
    case 'd':
    case 'j':
    case 'jour':
    case 'jours':
      return value * 24 * 60 * 60 * 1000;
    case 'w':
    case 's':
    case 'semaine':
    case 'semaines':
      return value * 7 * 24 * 60 * 60 * 1000;
    default:
      return null;
  }
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const { guildId, channel } = interaction;
  if (!guildId || !channel || !(channel instanceof TextChannel)) {
    await interaction.reply({
      content: '❌ Cette commande doit être utilisée dans un salon textuel.',
      flags: [MessageFlags.Ephemeral]
    });
    return;
  }

  // Permettre uniquement aux membres du personnel (Staff)
  const member = interaction.member as GuildMember;
  const guildConfig = await prisma.guild.findUnique({ where: { id: guildId } });
  
  const isStaff = member.permissions.has(PermissionFlagsBits.ManageMessages) ||
    (guildConfig?.moderatorRoleId && member.roles.cache.has(guildConfig.moderatorRoleId)) ||
    (guildConfig?.ticketStaffRoleId && member.roles.cache.has(guildConfig.ticketStaffRoleId)) ||
    member.permissions.has(PermissionFlagsBits.Administrator);

  if (!isStaff) {
    await interaction.reply({
      content: "❌ Vous n'avez pas la permission d'utiliser cette commande.",
      flags: [MessageFlags.Ephemeral]
    });
    return;
  }

  const count = interaction.options.getInteger('nombre', false);
  const temps = interaction.options.getString('temps', false);
  const messageId = interaction.options.getString('message_id', false);

  let optionsCount = 0;
  if (count !== null) optionsCount++;
  if (temps !== null) optionsCount++;
  if (messageId !== null) optionsCount++;

  if (optionsCount > 1) {
    await interaction.reply({
      content: '❌ Veuillez spécifier une seule option parmi `nombre`, `temps` et `message_id`.',
      flags: [MessageFlags.Ephemeral]
    });
    return;
  }

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  try {
    let fetchedMessages: Message[] = [];

    if (count !== null) {
      // Fetch X messages backwards
      let lastId: string | undefined;
      while (fetchedMessages.length < count) {
        const limit = Math.min(100, count - fetchedMessages.length);
        const messages = await channel.messages.fetch({ limit, before: lastId });
        if (messages.size === 0) break;
        fetchedMessages.push(...messages.values());
        lastId = messages.last()?.id;
      }
      fetchedMessages.reverse();
    } else if (temps !== null) {
      // Fetch since duration
      const durationMs = parseDurationToMs(temps);
      if (!durationMs) {
        await interaction.editReply({
          content: '❌ Format de durée invalide. Utilisez par exemple : `2h` (2 heures), `30m` (30 minutes), `1j` (1 jour).'
        });
        return;
      }

      const targetTimestamp = Date.now() - durationMs;
      let lastId: string | undefined;
      let stop = false;

      while (!stop) {
        const messages = await channel.messages.fetch({ limit: 100, before: lastId });
        if (messages.size === 0) break;

        for (const msg of messages.values()) {
          if (msg.createdTimestamp < targetTimestamp) {
            stop = true;
            break;
          }
          fetchedMessages.push(msg);
        }

        if (messages.size < 100) break;
        lastId = messages.last()?.id;
      }
      fetchedMessages.reverse();
    } else if (messageId !== null) {
      // Fetch from messageId to now
      try {
        const startMsg = await channel.messages.fetch(messageId);
        if (startMsg) {
          fetchedMessages.push(startMsg);
        }
      } catch (err) {
        await interaction.editReply({
          content: `❌ Impossible de trouver le message de départ avec l'ID \`${messageId}\` dans ce salon.`
        });
        return;
      }

      let lastId = messageId;
      while (true) {
        const messages = await channel.messages.fetch({ limit: 100, after: lastId });
        if (messages.size === 0) break;

        fetchedMessages.push(...messages.values());
        
        // Find latest message ID in this batch to keep fetching
        const sortedBatch = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
        lastId = sortedBatch[sortedBatch.length - 1].id;

        if (messages.size < 100) break;
      }
      fetchedMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    } else {
      // Default: Last 100 messages
      const messages = await channel.messages.fetch({ limit: 100 });
      fetchedMessages.push(...messages.values());
      fetchedMessages.reverse();
    }

    if (fetchedMessages.length === 0) {
      await interaction.editReply({
        content: '⚠️ Aucun message trouvé pour les critères spécifiés.'
      });
      return;
    }

    // Generate transcript using the existing module
    const transcriptData = await generateTranscriptFromMessages(channel, fetchedMessages);
    const dashboardUrl = process.env.DASHBOARD_URL || 'http://localhost:5173';
    const publicLink = `${dashboardUrl}${transcriptData.url}`;

    await interaction.editReply({
      embeds: [
        successEmbed(
          '📄 Transcription générée',
          `La transcription de **${transcriptData.count}** message(s) de ce salon a été créée avec succès.\n\n🌐 [Consulter la transcription](${publicLink})`
        )
      ]
    });

  } catch (error) {
    logger.error('Transcript', 'Erreur lors de la génération de la transcription command:', error);
    await interaction.editReply({
      embeds: [
        errorEmbed(
          'Erreur de transcription',
          'Une erreur est survenue lors de la transcription des messages de ce salon.'
        )
      ]
    });
  }
}
