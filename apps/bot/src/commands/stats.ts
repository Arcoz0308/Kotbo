import { EmbedBuilder, MessageFlags, SlashCommandBuilder, AttachmentBuilder, type ChatInputCommandInteraction } from 'discord.js';
import prisma from '../utils/db.js';
import { generateMemberStatsImage } from '../services/imageService.js';
import { COLORS } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('stats')
  .setDescription('📊 Affiche les statistiques d\\'activité d\\'un membre')
  .addUserOption((option) =>
    option
      .setName('membre')
      .setDescription('Membre à afficher (par défaut: toi)')
      .setRequired(false),
  )
  .addIntegerOption((option) =>
    option
      .setName('periode')
      .setDescription('Période en jours (défaut: 30)')
      .setRequired(false)
      .addChoices(
        { name: '7 jours', value: 7 },
        { name: '30 jours', value: 30 },
        { name: '90 jours', value: 90 }
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;

  if (!guildId) {
    await interaction.reply({
      content: '❌ Cette commande doit être utilisée dans un serveur.',
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await interaction.deferReply();

  const targetUser = interaction.options.getUser('membre') ?? interaction.user;
  const periodDays = interaction.options.getInteger('periode') ?? 30;

  const now = new Date();
  const startDate = new Date();
  startDate.setDate(now.getDate() - periodDays);
  const startDateKey = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;

  const dailyStats = await prisma.memberDailyStat.findMany({
    where: {
      guildId,
      userId: targetUser.id,
      dateKey: { gte: startDateKey },
    },
    orderBy: { dateKey: 'asc' },
  });

  const totalMessages = dailyStats.reduce((sum, d) => sum + d.messagesCount, 0);
  const totalVoice = dailyStats.reduce((sum, d) => sum + d.voiceMinutes, 0);
  const activeDays = dailyStats.length;
  const peakDayMessages = Math.max(0, ...dailyStats.map(d => d.messagesCount));

  const statsObj = { totalMessages, totalVoice, activeDays, peakDayMessages };
  const dailyData = dailyStats.map(d => ({ date: d.dateKey, messages: d.messagesCount, voice: d.voiceMinutes }));

  const imageBuffer = await generateMemberStatsImage(
    targetUser.username,
    periodDays,
    statsObj,
    dailyData
  );

  const attachment = new AttachmentBuilder(imageBuffer, { name: 'stats.png' });

  const embed = new EmbedBuilder()
    .setColor(COLORS.info)
    .setImage('attachment://stats.png')
    .setFooter({ text: `Kotbo Analytics • Requis par ${interaction.user.username}` });

  await interaction.editReply({
    embeds: [embed],
    files: [attachment],
  });
}
