import { EmbedBuilder, MessageFlags, SlashCommandBuilder, AttachmentBuilder, type ChatInputCommandInteraction } from 'discord.js';
import prisma from '../utils/db.js';
import { generateServerStatsImage } from '../services/imageService.js';
import { COLORS } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
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
        { name: '90 jours', value: 90 }
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  const guildName = interaction.guild?.name ?? 'Serveur Inconnu';

  if (!guildId) {
    await interaction.reply({
      content: '❌ Cette commande doit être utilisée dans un serveur.',
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

  // Active members roughly estimated by counting unique users in MemberDailyStat
  const activeMembersAgg = await prisma.memberDailyStat.groupBy({
    by: ['userId'],
    where: { guildId, dateKey: { gte: startDateKey } },
  });
  const activeMembers = activeMembersAgg.length;

  const statsObj = { totalMessages, totalVoice, newMembers, activeMembers, totalMembers };

  const imageBuffer = await generateServerStatsImage(guildName, periodDays, statsObj);
  const attachment = new AttachmentBuilder(imageBuffer, { name: 'serverstats.png' });

  const embed = new EmbedBuilder()
    .setColor(COLORS.info)
    .setImage('attachment://serverstats.png')
    .setFooter({ text: `Kotbo Analytics • Requis par ${interaction.user.username}` });

  await interaction.editReply({
    embeds: [embed],
    files: [attachment],
  });
}
