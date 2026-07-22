import type { SlashCommandDefinition } from '../../commands.js';
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
  EmbedBuilder,
  MessageFlags,
  ChannelType
} from 'discord.js';
import prisma from '../../utils/db.js';
import { successEmbed, errorEmbed, COLORS } from '../../utils/embeds.js';
import { parseDateTimeOrDuration } from '../moderation/transcript.js';
import { createReminder, deleteReminder } from '../../services/staff/reminderService.js';

const data = new SlashCommandBuilder()
  .setName('rappel')
  .setDescription('⏰ Gère tes rappels personnels ou liés au planning')
  .addSubcommand((sub) =>
    sub
      .setName('creer')
      .setDescription('Programmer un nouveau rappel')
      .addStringOption((option) =>
        option
          .setName('temps')
          .setDescription('Quand ? (ex: 15m, 2h, 12/07/2026-18:00)')
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName('message')
          .setDescription('Le contenu du rappel')
          .setRequired(true)
          .setMaxLength(500)
      )
      .addChannelOption((option) =>
        option
          .setName('salon')
          .setDescription('Salon de destination (par défaut : vos Messages Privés)')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)
      )
      .addStringOption((option) =>
        option
          .setName('planning')
          .setDescription('Lier ce rappel à un élément du planning')
          .setAutocomplete(true)
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('liste')
      .setDescription('Afficher la liste de vos rappels actifs')
  )
  .addSubcommand((sub) =>
    sub
      .setName('supprimer')
      .setDescription('Supprimer un rappel planifié')
      .addStringOption((option) =>
        option
          .setName('id')
          .setDescription('Le rappel à supprimer')
          .setAutocomplete(true)
          .setRequired(true)
      )
  );

async function execute(interaction: ChatInputCommandInteraction) {
  const { guildId, user } = interaction;
  if (!guildId) {
    await interaction.reply({
      content: '❌ Cette commande doit être utilisée sur un serveur.',
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'creer') {
    const tempsStr = interaction.options.getString('temps', true);
    const message = interaction.options.getString('message', true);
    const channel = interaction.options.getChannel('salon', false);
    const planningItem = interaction.options.getString('planning', false);

    const targetTimeMs = parseDateTimeOrDuration(tempsStr);
    if (targetTimeMs === null) {
      await interaction.reply({
        content: '❌ Format de temps invalide. Utilisez par exemple : `15m`, `2h`, `1d`, ou une date/heure `JJ/MM/AAAA-HH:MM`.',
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const targetTime = new Date(targetTimeMs);
    if (targetTime <= new Date()) {
      await interaction.reply({
        content: '❌ La date et heure du rappel doit être dans le futur.',
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    let taskId: string | null = null;
    let callId: string | null = null;
    let meetingId: string | null = null;

    if (planningItem) {
      const [type, id] = planningItem.split(':');
      if (type === 'task') taskId = id;
      else if (type === 'call') callId = id;
      else if (type === 'meeting') meetingId = id;
    }

    try {
      await createReminder({
        guildId,
        userId: user.id,
        channelId: channel?.id || null,
        message,
        targetTime,
        taskId,
        callId,
        meetingId
      });

      const timeString = `<t:${Math.floor(targetTime.getTime() / 1000)}:F> (<t:${Math.floor(targetTime.getTime() / 1000)}:R>)`;
      const targetDest = channel ? `${channel}` : 'vos Messages Privés (MP)';
      
      await interaction.editReply({
        embeds: [
          successEmbed(
            '⏰ Rappel programmé',
            `Votre rappel a été enregistré avec succès.\n\n` +
            `📝 **Message** : ${message}\n` +
            `📅 **Date** : ${timeString}\n` +
            `📍 **Destination** : ${targetDest}`
          )
        ]
      });
    } catch (error) {
      await interaction.editReply({
        embeds: [errorEmbed('Erreur', 'Impossible de programmer le rappel.')]
      });
    }
  }

  else if (subcommand === 'liste') {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    try {
      const reminders = await prisma.staffReminder.findMany({
        where: {
          guildId,
          userId: user.id,
          fired: false
        },
        orderBy: {
          targetTime: 'asc'
        },
        include: {
          task: true,
          call: true,
          meeting: true
        }
      });

      if (reminders.length === 0) {
        await interaction.editReply({
          content: '⚠️ Vous n\'avez aucun rappel actif planifié pour le moment.'
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(COLORS?.success || 0x2ECC71)
        .setTitle('⏰ Vos Rappels Planifiés')
        .setTimestamp();

      const lines = reminders.map((r) => {
        const timeString = `<t:${Math.floor(r.targetTime.getTime() / 1000)}:R>`;
        let detail = '';
        if (r.task) detail = ` (Lié à la tâche: *${r.task.title}*)`;
        else if (r.call) detail = ` (Lié au call: *${r.call.title}*)`;
        else if (r.meeting) detail = ` (Lié à la réunion: *${r.meeting.title}*)`;

        const dest = r.channelId ? `<#${r.channelId}>` : 'MP';
        return `• \`${r.id.slice(-6)}\` · **${r.message}** · ${timeString} · salon: ${dest}${detail}`;
      });

      embed.setDescription(lines.join('\n'));

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      await interaction.editReply({
        embeds: [errorEmbed('Erreur', 'Impossible de récupérer la liste des rappels.')]
      });
    }
  }

  else if (subcommand === 'supprimer') {
    const reminderId = interaction.options.getString('id', true);
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    try {
      await deleteReminder(reminderId, user.id);
      await interaction.editReply({
        embeds: [successEmbed('Rappel supprimé', 'Le rappel a été supprimé avec succès.')]
      });
    } catch (error: any) {
      await interaction.editReply({
        embeds: [errorEmbed('Erreur', error.message || 'Impossible de supprimer le rappel.')]
      });
    }
  }
}

async function autocomplete(interaction: AutocompleteInteraction) {
  const { guildId, user } = interaction;
  if (!guildId) return;

  const focused = interaction.options.getFocused(true);
  const focusedOption = String(focused.value).trim();
  const focusedName = focused.name;

  if (focusedName === 'planning') {
    try {
      // Fetch meetings, calls and tasks matching query
      const [meetings, calls, tasks] = await Promise.all([
        prisma.staffMeeting.findMany({
          where: {
            guildId,
            scheduledAt: { gte: new Date() },
            title: { contains: focusedOption, mode: 'insensitive' }
          },
          take: 8
        }),
        prisma.staffCall.findMany({
          where: {
            guildId,
            scheduledAt: { gte: new Date() },
            title: { contains: focusedOption, mode: 'insensitive' }
          },
          take: 8
        }),
        prisma.staffTask.findMany({
          where: {
            guildId,
            status: { in: ['PENDING', 'IN_PROGRESS'] },
            title: { contains: focusedOption, mode: 'insensitive' }
          },
          take: 8
        })
      ]);

      const choices: { name: string; value: string }[] = [];

      meetings.forEach(m => {
        choices.push({ name: `📅 [Réunion] ${m.title.slice(0, 80)}`, value: `meeting:${m.id}` });
      });
      calls.forEach(c => {
        choices.push({ name: `📞 [Appel] ${c.title.slice(0, 80)}`, value: `call:${c.id}` });
      });
      tasks.forEach(t => {
        choices.push({ name: `📋 [Tâche] ${t.title.slice(0, 80)}`, value: `task:${t.id}` });
      });

      await interaction.respond(choices.slice(0, 25));
    } catch (e) {
      console.error(e);
      await interaction.respond([]);
    }
  }

  else if (focusedName === 'id') {
    try {
      const reminders = await prisma.staffReminder.findMany({
        where: {
          guildId,
          userId: user.id,
          fired: false,
          message: { contains: focusedOption, mode: 'insensitive' }
        },
        orderBy: { targetTime: 'asc' },
        take: 25
      });

      const choices = reminders.map(r => {
        const dateStr = r.targetTime.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        return {
          name: `⏰ [${dateStr}] ${r.message.slice(0, 70)}`,
          value: r.id
        };
      });

      await interaction.respond(choices);
    } catch (e) {
      console.error(e);
      await interaction.respond([]);
    }
  }
}

export const rappelCommand = { data, execute, autocomplete } satisfies SlashCommandDefinition;
