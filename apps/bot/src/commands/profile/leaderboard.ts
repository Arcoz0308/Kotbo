import type { SlashCommandDefinition } from '../../commands.js';
import { EmbedBuilder, MessageFlags, SlashCommandBuilder, AttachmentBuilder, GuildMember, type ChatInputCommandInteraction } from 'discord.js';
import prisma from '../../utils/db.js';
import { generateLeaderboardImage } from '../../services/core/imageService.js';
import { COLORS } from '../../utils/embeds.js';
import { getXpForLevel, getLevelFromXp } from '../../services/progression/levelingService.js';

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
        { name: 'Mixte (Messages + Vocal)', value: 'mixed' },
        { name: 'XP / Niveaux', value: 'xp' }
      )
  )
  .addStringOption((option) =>
    option
      .setName('style')
      .setDescription('Style d\'affichage du classement')
      .setRequired(false)
      .addChoices(
        { name: 'Image (Modern)', value: 'image' },
        { name: 'Embed V2 (Texte)', value: 'embed' }
      )
  )
  .addIntegerOption((option) =>
    option
      .setName('periode')
      .setDescription('Période en jours (Ignoré pour XP, défaut: 30)')
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

  const type = interaction.options.getString('type') as 'messages' | 'voice' | 'mixed' | 'xp';
  const style = interaction.options.getString('style') as 'image' | 'embed' ?? 'image';
  const periodDays = interaction.options.getInteger('periode') ?? 30;

  let topMembers: { userId: string; score: number; level?: number }[] = [];

  if (type === 'xp') {
    const xpStats = await prisma.memberLevel.findMany({
      where: { guildId },
      orderBy: { xp: 'desc' },
      take: 10,
    });

    topMembers = xpStats.map((stat) => ({
      userId: stat.userId,
      score: stat.xp,
      // Le niveau est dérivé de l'XP (source de vérité) pour rester cohérent
      // avec la carte /rank et le dashboard, même si la ligne n'est pas réparée.
      level: getLevelFromXp(stat.xp),
    }));
  } else {
    const now = new Date();
    const startDate = new Date();
    startDate.setDate(now.getDate() - periodDays);
    const startDateKey = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;

    const dailyStats = await prisma.memberDailyStat.groupBy({
      by: ['userId'],
      where: { guildId, dateKey: { gte: startDateKey } },
      _sum: { messagesCount: true, voiceMinutes: true },
    });

    topMembers = dailyStats.map((stat) => {
      let score = 0;
      if (type === 'messages') score = stat._sum.messagesCount ?? 0;
      else if (type === 'voice') score = stat._sum.voiceMinutes ?? 0;
      else score = (stat._sum.messagesCount ?? 0) + (stat._sum.voiceMinutes ?? 0) * 2; // Mixte: 1 msg = 1 pt, 1 min = 2 pts
      
      return { userId: stat.userId, score };
    });

    topMembers = topMembers.sort((a, b) => b.score - a.score).slice(0, 10);
  }

  const discordGuild = interaction.client.guilds.cache.get(guildId);
  
  const formattedTopMembers = await Promise.all(topMembers.map(async (m) => {
    let name = `Utilisateur ${m.userId}`;
    let avatarUrl: string | null = null;
    try {
      const member = await discordGuild?.members.fetch(m.userId).catch(() => null);
      if (member) {
        name = member.displayName;
        avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 64 });
      }
    } catch {
      // Ignorer
    }
    return { name, score: m.score, avatarUrl, level: m.level };
  }));

  if (style === 'embed') {
    const hasSuperatom = interaction.member instanceof GuildMember && interaction.member.roles.cache.some(r => r.name.toLowerCase().includes('superatom'));
    const superatomText = hasSuperatom ? '⚛️ Abonné Superatom' : '⚛️ Non-abonné Superatom';
    const serverName = discordGuild?.name ?? 'Serveur';

    const embed = new EmbedBuilder()
      .setColor(COLORS.info)
      .setTitle(type === 'xp' ? 'XP Leaderboard' : `Top 10 — ${type === 'messages' ? 'Messages' : type === 'voice' ? 'Vocal' : 'Activité Mixte'}`)
      .setFooter({ text: `Kotbo Analytics • Requis par ${interaction.user.username}` })
      .setTimestamp();

    let description = `• **${serverName}**\n• ${superatomText}\n\n`;

    for (let i = 0; i < formattedTopMembers.length; i++) {
      const member = formattedTopMembers[i];
      const rank = i + 1;

      if (type === 'xp') {
        const userLevel = member.level ?? 0;
        description += `**#${rank}** — **[Niv. ${userLevel}]** ${member.name}\n`;

        // Calculate progress percentage inside current level
        const prevXpNeeded = getXpForLevel(userLevel - 1);
        const nextXpNeeded = getXpForLevel(userLevel);
        const xpInCurrentLevel = member.score - prevXpNeeded;
        const xpRequiredForNextLevel = nextXpNeeded - prevXpNeeded || 300;
        const percent = Math.min(100, Math.max(0, Math.round((xpInCurrentLevel / xpRequiredForNextLevel) * 100)));

        const bar = buildProgressBar(percent);
        description += `${bar} \` ${percent}% \`\n\n`;
      } else {
        description += `**#${rank}** — ${member.name}\n`;

        // Calculate progress relative to rank 1
        const maxScore = formattedTopMembers[0].score || 1;
        const percent = Math.min(100, Math.max(0, Math.round((member.score / maxScore) * 100)));

        const bar = buildProgressBar(percent);
        const scoreFmt = type === 'voice' ? `${Math.floor(member.score / 60)}h ${member.score % 60}m` : member.score.toLocaleString('fr-FR');
        description += `${bar} \` ${scoreFmt} \`\n\n`;
      }
    }

    embed.setDescription(description);

    await interaction.editReply({
      embeds: [embed],
    });
  } else {
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
}

function buildProgressBar(percent: number, size = 12): string {
  const filledCount = Math.round((percent / 100) * size);
  const emptyCount = size - filledCount;
  
  const filledChar = '▰';
  const emptyChar = '▱';
  
  return filledChar.repeat(filledCount) + emptyChar.repeat(emptyCount);
}

export const leaderboardCommand = { data, execute } satisfies SlashCommandDefinition;
