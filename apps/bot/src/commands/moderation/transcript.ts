import type { SlashCommandDefinition } from '../../commands.js';
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type GuildMember,
  TextChannel,
  type Message,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';
import prisma from '../../utils/db.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { generateTranscriptFromMessages } from '../../services/features/transcriptService.js';
import { logger } from '../../utils/logger.js';

const data = new SlashCommandBuilder()
  .setName('transcript')
  .setDescription('📄 Génère une transcription des messages de ce salon')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addIntegerOption((option) =>
    option
      .setName('nombre')
      .setDescription('Nombre de messages à transcrire (par défaut 100)')
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(5000)
  )
  .addStringOption((option) =>
    option
      .setName('temps')
      .setDescription('Début : Durée (ex: 2h), Date (JJ/MM/AAAA-HH:MM) ou Timestamp')
      .setRequired(false)
  )
  .addStringOption((option) =>
    option
      .setName('message_id')
      .setDescription("Début : ID du message de départ")
      .setRequired(false)
  )
  .addStringOption((option) =>
    option
      .setName('jusqua_message_id')
      .setDescription("Fin : ID du message d'arrêt")
      .setRequired(false)
  )
  .addStringOption((option) =>
    option
      .setName('jusqua_temps')
      .setDescription('Fin : Durée (ex: 1h), Date (JJ/MM/AAAA-HH:MM) ou Timestamp')
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

export function parseDateTimeOrDuration(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // 1. Check relative duration first (e.g., 2h, 30m)
  const durationMs = parseDurationToMs(trimmed);
  if (durationMs !== null) {
    return Date.now() - durationMs;
  }

  // 2. Check if digits only (unix timestamp)
  if (/^\d+$/.test(trimmed)) {
    const val = parseInt(trimmed, 10);
    if (trimmed.length <= 11) {
      return val * 1000;
    }
    return val;
  }

  // 3. Check French date format DD/MM/YYYY-HH:MM or DD/MM/YYYY HH:MM or DD/MM/YYYY
  const dateRegex = /^(\d{2})[/-](\d{2})[/-](\d{4})(?:[ -](\d{2}):(\d{2})(?::(\d{2}))?)?$/;
  const match = trimmed.match(dateRegex);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const year = parseInt(match[3], 10);
    const hour = match[4] ? parseInt(match[4], 10) : 0;
    const minute = match[5] ? parseInt(match[5], 10) : 0;
    const second = match[6] ? parseInt(match[6], 10) : 0;

    const date = new Date(year, month, day, hour, minute, second);
    if (!isNaN(date.getTime())) {
      return date.getTime();
    }
  }

  // 4. Fallback JS parse
  const parsed = Date.parse(trimmed);
  if (!isNaN(parsed)) {
    return parsed;
  }

  return null;
}

async function execute(interaction: ChatInputCommandInteraction) {
  const { guildId, channel } = interaction;
  if (!guildId || !channel || !(channel instanceof TextChannel)) {
    await interaction.reply({
      content: '❌ Cette commande doit être utilisée dans un salon textuel.',
      flags: [MessageFlags.Ephemeral]
    });
    return;
  }

    const currentTicket = await prisma.ticket.findFirst({
      where: {
        guildId,
        channelId: channel.id,
      },
      select: {
        staffRoleId: true,
      },
    });

  // Permettre uniquement aux membres du personnel (Staff)
  const member = interaction.member as GuildMember;
  const guildConfig = await prisma.guild.findUnique({ where: { id: guildId } });
  
  const isStaff = member.permissions.has(PermissionFlagsBits.ManageMessages) ||
    (guildConfig?.moderatorRoleId && member.roles.cache.has(guildConfig.moderatorRoleId)) ||
      (currentTicket?.staffRoleId && member.roles.cache.has(currentTicket.staffRoleId)) ||
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
  const jusquaMessageId = interaction.options.getString('jusqua_message_id', false);
  const jusquaTemps = interaction.options.getString('jusqua_temps', false);

  // Check start options (mutually exclusive)
  let startOptionsCount = 0;
  if (count !== null) startOptionsCount++;
  if (temps !== null) startOptionsCount++;
  if (messageId !== null) startOptionsCount++;

  if (startOptionsCount > 1) {
    await interaction.reply({
      content: '❌ Veuillez spécifier une seule option de départ parmi `nombre`, `temps` et `message_id`.',
      flags: [MessageFlags.Ephemeral]
    });
    return;
  }

  // Check end options (mutually exclusive)
  let endOptionsCount = 0;
  if (jusquaMessageId !== null) endOptionsCount++;
  if (jusquaTemps !== null) endOptionsCount++;

  if (endOptionsCount > 1) {
    await interaction.reply({
      content: '❌ Veuillez spécifier une seule option de fin parmi `jusqua_message_id` et `jusqua_temps`.',
      flags: [MessageFlags.Ephemeral]
    });
    return;
  }

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  try {
    // Validate explicit message IDs if provided
    if (messageId !== null) {
      try {
        await channel.messages.fetch(messageId);
      } catch (err) {
        await interaction.editReply({
          content: `❌ Impossible de trouver le message de départ avec l'ID \`${messageId}\` dans ce salon.`
        });
        return;
      }
    }

    if (jusquaMessageId !== null) {
      try {
        await channel.messages.fetch(jusquaMessageId);
      } catch (err) {
        await interaction.editReply({
          content: `❌ Impossible de trouver le message de fin avec l'ID \`${jusquaMessageId}\` dans ce salon.`
        });
        return;
      }
    }

    let startId: string | undefined;
    let endId: string | undefined;

    // Resolve start point
    if (messageId !== null) {
      startId = messageId;
    } else if (temps !== null) {
      const startTimestamp = parseDateTimeOrDuration(temps);
      if (startTimestamp === null) {
        await interaction.editReply({
          content: '❌ Format de début invalide. Utilisez par exemple : `2h` (2 heures), `30m` (30 minutes), ou une date/heure `JJ/MM/AAAA-HH:MM`.'
        });
        return;
      }
      startId = ((BigInt(startTimestamp) - 1420070400000n) << 22n).toString();
    }

    // Resolve end point
    if (jusquaMessageId !== null) {
      endId = jusquaMessageId;
    } else if (jusquaTemps !== null) {
      const endTimestamp = parseDateTimeOrDuration(jusquaTemps);
      if (endTimestamp === null) {
        await interaction.editReply({
          content: '❌ Format de fin invalide. Utilisez par exemple : `1h` (1 heure), ou une date/heure `JJ/MM/AAAA-HH:MM`, ou un timestamp.'
        });
        return;
      }
      endId = ((BigInt(endTimestamp) - 1420070400000n) << 22n).toString();
    }

    let fetchedMessages: Message[] = [];

    if (startId !== undefined) {
      // Fetch forward from startId
      const finalEndId = endId ?? ((BigInt(Date.now()) - 1420070400000n) << 22n).toString();
      
      // Ensure chronological order
      let firstId = startId;
      let secondId = finalEndId;
      if (BigInt(firstId) > BigInt(secondId)) {
        firstId = finalEndId;
        secondId = startId;
      }

      try {
        const startMsg = await channel.messages.fetch(firstId);
        if (startMsg) {
          fetchedMessages.push(startMsg);
        }
      } catch (err) {
        // Ignore
      }

      let lastId = firstId;
      while (true) {
        const messages = await channel.messages.fetch({ limit: 100, after: lastId });
        if (messages.size === 0) break;

        let stop = false;
        const sortedBatch = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
        
        for (const msg of sortedBatch) {
          if (BigInt(msg.id) > BigInt(secondId)) {
            stop = true;
            break;
          }
          fetchedMessages.push(msg);
        }

        if (stop || messages.size < 100) break;
        lastId = sortedBatch[sortedBatch.length - 1].id;
      }
      fetchedMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    } else if (endId !== undefined) {
      // Fetch backward from endId
      const limitCount = count ?? 100;

      try {
        const endMsg = await channel.messages.fetch(endId);
        if (endMsg) {
          fetchedMessages.push(endMsg);
        }
      } catch (err) {
        // Ignore
      }

      let lastId = endId;
      while (fetchedMessages.length < limitCount) {
        const limit = Math.min(100, limitCount - fetchedMessages.length);
        const messages = await channel.messages.fetch({ limit, before: lastId });
        if (messages.size === 0) break;
        fetchedMessages.push(...messages.values());
        lastId = messages.last()?.id ?? lastId;
      }
      fetchedMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    } else {
      // Default: fetch last X messages from now
      const limitCount = count ?? 100;
      let lastId: string | undefined;
      while (fetchedMessages.length < limitCount) {
        const limit = Math.min(100, limitCount - fetchedMessages.length);
        const messages = await channel.messages.fetch({ limit, before: lastId });
        if (messages.size === 0) break;
        fetchedMessages.push(...messages.values());
        lastId = messages.last()?.id;
      }
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

export const transcriptCommand = { data, execute } satisfies SlashCommandDefinition;
