import type { SlashCommandDefinition } from '../../commands.js';
import {
  MessageFlags,
  SlashCommandBuilder,
  AttachmentBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import prisma from '../../utils/db.js';
import { generateServerStatsImage } from '../../services/core/imageService.js';
import { kotboContainer } from '../../utils/embeds.js';
import { E } from '../../utils/emojis.js';
import { mediaGallery, v2Message } from '@arcscord/components';

const data = new SlashCommandBuilder()
  .setName('serverstats')
  .setDescription('📈 Affiche les statistiques globales du serveur')
  .addIntegerOption((option) =>
    option
      .setName('periode')
      .setDescription('Période en jours (défaut: 30)')
      .setRequired(false)
      .addChoices(
        { name: '7 jours', value: 7 },
        { name: '30 jours', value: 30 },
        { name: '90 jours', value: 90 },
      ),
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  const guildName = interaction.guild?.name ?? 'Serveur Inconnu';

  if (!guildId) {
    await interaction.reply({
      content: `${E.error} Cette commande doit être utilisée dans un serveur.`,
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await interaction.deferReply();

  const periodDays = interaction.options.getInteger('periode') ?? 30;
  const now = new Date();
  const startDate = new Date();
  startDate.setDate(now.getDate() - periodDays);
  const startDateKey = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;

  const dailyStats = await prisma.guildDailyStat.findMany({
    where: { guildId, dateKey: { gte: startDateKey } },
  });

  const totalMessages = dailyStats.reduce((sum, d) => sum + d.messagesCount, 0);
  const totalVoice = dailyStats.reduce((sum, d) => sum + d.voiceMinutes, 0);
  const newMembers = dailyStats.reduce((sum, d) => sum + d.membersJoined, 0);

  const discordGuild = interaction.client.guilds.cache.get(guildId);
  const totalMembers = discordGuild?.memberCount ?? 0;

  const activeMembersAgg = await prisma.memberDailyStat.groupBy({
    by: ['userId'],
    where: { guildId, dateKey: { gte: startDateKey } },
  });
  const activeMembers = activeMembersAgg.length;

  const imageBuffer = await generateServerStatsImage(guildName, periodDays, {
    totalMessages, totalVoice, newMembers, activeMembers, totalMembers,
  });

  const attachment = new AttachmentBuilder(imageBuffer, { name: 'serverstats.png' });

  await interaction.editReply({
    ...v2Message(
      kotboContainer({
        color: 'primary',
        fields: [
          mediaGallery({ items: [{ media: { url: 'attachment://serverstats.png' } }] }),
          `-# Kotbo Analytics · Requis par ${interaction.user.username}`,
        ],
      }),
    ),
    files: [attachment],
  });
}

export const serverstatsCommand = { data, execute } satisfies SlashCommandDefinition;
