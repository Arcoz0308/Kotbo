import type { SlashCommandDefinition } from '../../commands.js';
import { EmbedBuilder, MessageFlags, SlashCommandBuilder, AttachmentBuilder, type ChatInputCommandInteraction } from 'discord.js';
import prisma from '../../utils/db.js';
import { generateLeaderboardImage } from '../../services/core/imageService.js';
import { COLORS } from '../../utils/embeds.js';

const data = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('🏆 Affiche le classement du serveur')
  .addStringOption((option) =>
    option
      .setName('type')
      .setDescription('Type de classement')
      .setRequired(true)
      .addChoices(
        { name: 'Messages', value: 'messages' },
        { name: 'Vocal', value: 'voice' },
        { name: 'Mixte (Messages + Vocal)', value: 'mixed' }
      )
  )
  .addIntegerOption((option) =>
    option
      .setName('periode')
      .setDescription('Période en jours (défaut: 30)')
      .setRequired(false)
      .addChoices(
        { name: '7 jours', value: 7 },
        { name: '30 jours', value: 30 },
        { name: 'Tout les temps (90j max)', value: 90 }
      ),
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;

  if (!guildId) {
    await interaction.reply({
      content: '❌ Cette commande doit être utilisée dans un serveur.',
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await interaction.deferReply();

  const type = interaction.options.getString('type') as 'messages' | 'voice' | 'mixed';
  const periodDays = interaction.options.getInteger('periode') ?? 30;

  const now = new Date();
  const startDate = new Date();
  startDate.setDate(now.getDate() - periodDays);
  const startDateKey = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;

  const dailyStats = await prisma.memberDailyStat.groupBy({
    by: ['userId'],
    where: { guildId, dateKey: { gte: startDateKey } },
    _sum: { messagesCount: true, voiceMinutes: true },
  });

  let topMembers = dailyStats.map((stat) => {
    let score = 0;
    if (type === 'messages') score = stat._sum.messagesCount ?? 0;
    else if (type === 'voice') score = stat._sum.voiceMinutes ?? 0;
    else score = (stat._sum.messagesCount ?? 0) + (stat._sum.voiceMinutes ?? 0) * 2; // Mixte: 1 msg = 1 pt, 1 min = 2 pts
    
    return { userId: stat.userId, score };
  });

  topMembers = topMembers.sort((a, b) => b.score - a.score).slice(0, 10);

  const discordGuild = interaction.client.guilds.cache.get(guildId);
  
  const formattedTopMembers = await Promise.all(topMembers.map(async (m) => {
    let name = `Utilisateur ${m.userId}`;
    try {
      const member = await discordGuild?.members.fetch(m.userId).catch(() => null);
      if (member) name = member.displayName;
    } catch {
      // Ignorer
    }
    return { name, score: m.score };
  }));

  const imageBuffer = await generateLeaderboardImage(formattedTopMembers, type, periodDays);
  const attachment = new AttachmentBuilder(imageBuffer, { name: 'leaderboard.png' });

  const embed = new EmbedBuilder()
    .setColor(COLORS.info)
    .setImage('attachment://leaderboard.png')
    .setFooter({ text: `Kotbo Analytics • Requis par ${interaction.user.username}` });

  await interaction.editReply({
    embeds: [embed],
    files: [attachment],
  });
}

export const leaderboardCommand = { data, execute } satisfies SlashCommandDefinition;
