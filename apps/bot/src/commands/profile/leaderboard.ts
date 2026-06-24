import type { SlashCommandDefinition } from '../../commands.js';
import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorSpacingSize,
  SlashCommandBuilder,
  AttachmentBuilder,
  GuildMember,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from 'discord.js';
import prisma from '../../utils/db.js';
import { generateLeaderboardImage } from '../../services/core/imageService.js';
import { COLORS_RAW, text } from '../../utils/embeds.js';
import { E, rankEmoji, buildProgressBar } from '../../utils/emojis.js';
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
        { name: 'XP / Niveaux', value: 'xp' },
      ),
  )
  .addStringOption((option) =>
    option
      .setName('style')
      .setDescription("Style d'affichage du classement")
      .setRequired(false)
      .addChoices(
        { name: 'Image (Modern)', value: 'image' },
        { name: 'Texte (V2)', value: 'embed' },
      ),
  )
  .addIntegerOption((option) =>
    option
      .setName('periode')
      .setDescription('Période en jours (Ignoré pour XP, défaut: 30)')
      .setRequired(false)
      .addChoices(
        { name: '7 jours', value: 7 },
        { name: '30 jours', value: 30 },
        { name: 'Tout les temps (90j max)', value: 90 },
      ),
  )
  .addBooleanOption((option) =>
    option
      .setName('auto_refresh')
      .setDescription('Actualiser automatiquement toutes les heures dans ce salon')
      .setRequired(false),
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: `${E.error} Cette commande doit être utilisée dans un serveur.`,
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await interaction.deferReply();

  const type = interaction.options.getString('type') as 'messages' | 'voice' | 'mixed' | 'xp';
  const style = (interaction.options.getString('style') as 'image' | 'embed') ?? 'image';
  const periodDays = interaction.options.getInteger('periode') ?? 30;
  const autoRefresh = interaction.options.getBoolean('auto_refresh');

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

    const sorted = dailyStats.map((stat) => {
      let score = 0;
      if (type === 'messages') score = stat._sum.messagesCount ?? 0;
      else if (type === 'voice') score = stat._sum.voiceMinutes ?? 0;
      else score = (stat._sum.messagesCount ?? 0) + (stat._sum.voiceMinutes ?? 0) * 2;
      return { userId: stat.userId, score };
    }).sort((a, b) => b.score - a.score).slice(0, 10);

    const userIds = sorted.map(m => m.userId);
    const levels = await prisma.memberLevel.findMany({
      where: { guildId, userId: { in: userIds } },
      select: { userId: true, xp: true },
    });
    const levelMap = new Map(levels.map(l => [l.userId, getLevelFromXp(l.xp)]));

    topMembers = sorted.map(m => ({
      ...m,
      level: levelMap.get(m.userId) ?? 0,
    }));
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
    } catch { /* ignore */ }
    return { name, score: m.score, avatarUrl, level: m.level };
  }));

  const themeColor = type === 'messages' ? COLORS_RAW.primary : type === 'voice' ? COLORS_RAW.success : type === 'xp' ? COLORS_RAW.pink : COLORS_RAW.warning;
  const typeLabel = type === 'messages' ? 'Messages' : type === 'voice' ? 'Vocal' : type === 'xp' ? 'XP & Niveaux' : 'Activité Mixte';
  const subTitle = type === 'xp' ? "Classement global d'expérience" : `Les ${periodDays} derniers jours`;

  if (style === 'embed') {
    const serverName = discordGuild?.name ?? 'Serveur';

    let description = `**${serverName}**\n`;

    for (let i = 0; i < formattedTopMembers.length; i++) {
      const member = formattedTopMembers[i];
      const rank = i + 1;

      if (type === 'xp') {
        const userLevel = member.level ?? 0;
        const prevXpNeeded = getXpForLevel(userLevel - 1);
        const nextXpNeeded = getXpForLevel(userLevel);
        const xpInCurrentLevel = member.score - prevXpNeeded;
        const xpRequiredForNextLevel = nextXpNeeded - prevXpNeeded || 300;
        const percent = Math.min(100, Math.max(0, Math.round((xpInCurrentLevel / xpRequiredForNextLevel) * 100)));
        const bar = buildProgressBar(percent, 8);
        description += `\n${rankEmoji(rank)} **[Niv. ${userLevel}]** ${member.name}\n${bar} \`${percent}%\``;
      } else {
        const maxScore = formattedTopMembers[0].score || 1;
        const percent = Math.min(100, Math.max(0, Math.round((member.score / maxScore) * 100)));
        const bar = buildProgressBar(percent, 8);
        const scoreFmt = type === 'voice' ? `${Math.floor(member.score / 60)}h ${member.score % 60}m` : member.score.toLocaleString('fr-FR');
        description += `\n${rankEmoji(rank)} ${member.name}\n${bar} \`${scoreFmt}\``;
      }
    }

    const container = new ContainerBuilder()
      .setAccentColor(themeColor)
      .addTextDisplayComponents(text(`### ${E.trophy} Top 10 — ${typeLabel}`))
      .addTextDisplayComponents(text(`-# ${subTitle}`))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(text(description))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(text(`-# Kotbo Analytics · Requis par ${interaction.user.username}`));

    await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  } else {
    const imageBuffer = await generateLeaderboardImage(formattedTopMembers, type, periodDays);
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'leaderboard.png' });

    const container = new ContainerBuilder()
      .setAccentColor(themeColor)
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder({ media: { url: 'attachment://leaderboard.png' } })
        )
      )
      .addTextDisplayComponents(text(`-# Kotbo Analytics · Requis par ${interaction.user.username}`));

    await interaction.editReply({
      components: [container],
      files: [attachment],
      flags: MessageFlags.IsComponentsV2,
    });
  }

  if (autoRefresh !== null) {
    const memberPerms = interaction.memberPermissions;
    if (!memberPerms?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.followUp({
        content: `${E.error} Tu dois avoir la permission **Gérer le serveur** pour configurer l'actualisation automatique.`,
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    if (autoRefresh) {
      const reply = await interaction.fetchReply();
      await prisma.autoLeaderboard.upsert({
        where: { guildId_channelId_type: { guildId, channelId: interaction.channelId, type } },
        create: {
          guildId,
          channelId: interaction.channelId,
          messageId: reply.id,
          type,
          style,
          periodDays,
          enabled: true,
        },
        update: {
          messageId: reply.id,
          style,
          periodDays,
          enabled: true,
        },
      });
      await interaction.followUp({
        content: `${E.success} Le classement **${type}** sera actualisé automatiquement toutes les heures dans ce salon. S'il est dépassé par plus de 5 messages, il sera renvoyé.`,
        flags: [MessageFlags.Ephemeral],
      });
    } else {
      await prisma.autoLeaderboard.deleteMany({
        where: { guildId, channelId: interaction.channelId, type },
      });
      await interaction.followUp({
        content: `${E.success} L'actualisation automatique du classement **${type}** a été désactivée pour ce salon.`,
        flags: [MessageFlags.Ephemeral],
      });
    }
  }
}

export const leaderboardCommand = { data, execute } satisfies SlashCommandDefinition;
