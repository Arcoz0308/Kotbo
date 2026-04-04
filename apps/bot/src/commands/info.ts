import { SlashCommandBuilder, type ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from 'discord.js';
import { errorEmbed, COLORS } from '../utils/embeds.js';
import prisma from '../utils/db.js';
import fs from 'fs/promises';

const packagePath = new URL('../../package.json', import.meta.url);

async function getVersion() {
  try {
    const raw = await fs.readFile(packagePath, 'utf8');
    const pkg = JSON.parse(raw);
    return pkg.version ?? 'inconnue';
  } catch {
    return 'inconnue';
  }
}

function formatUptime(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}j`);
  parts.push(`${hours}h`, `${minutes}m`, `${seconds}s`);
  return parts.join(' ');
}

function formatMb(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

function boolChip(enabled: boolean): string {
  return enabled ? '🟢 Activé' : '🔴 Désactivé';
}

function channelRef(channelId?: string | null): string {
  return channelId ? `<#${channelId}>` : 'Non défini';
}

function truncate(value: string, max = 120): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3)}...`;
}

export const data = new SlashCommandBuilder()
  .setName('info')
  .setDescription('ℹ️ Informations sur le bot (version, état, configuration)');

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ 
      embeds: [errorEmbed('Impossible', 'Cette commande doit être utilisée dans un serveur.')], 
      flags: [MessageFlags.Ephemeral] 
    });
    return;
  }

  const [
    guild,
    version,
    totalFeeds,
    enabledFeeds,
    autoPublishFeeds,
    subs,
    youtubeSubsCount,
    feedItemsTreated,
    ytItemsTreated,
    feedItemsPublished,
    ytItemsPublished,
    feedItemsPending,
    ytItemsPending,
    feedItemsRejected,
    ytItemsRejected,
    dailyAlgoRuns,
    dailyAlgoSubmissions,
    interestFeedback,
  ] = await Promise.all([
    prisma.guild.findUnique({ where: { id: guildId } }),
    getVersion(),
    prisma.feed.count({ where: { guildId } }),
    prisma.feed.count({ where: { guildId, enabled: true } }),
    prisma.feed.count({ where: { guildId, autoPublish: true } }),
    prisma.userFeedSub.findMany({ where: { feed: { guildId } }, distinct: ['userId'], select: { userId: true } }),
    prisma.youTubeSubscription.count({ where: { guildId } }),
    prisma.feedItem.count({ where: { feed: { guildId }, status: { not: 'PENDING' } } }),
    prisma.youTubeItem.count({ where: { guildId, status: { not: 'PENDING' } } }),
    prisma.feedItem.count({ where: { feed: { guildId }, status: 'APPROVED' } }),
    prisma.youTubeItem.count({ where: { guildId, status: 'APPROVED' } }),
    prisma.feedItem.count({ where: { feed: { guildId }, status: 'PENDING' } }),
    prisma.youTubeItem.count({ where: { guildId, status: 'PENDING' } }),
    prisma.feedItem.count({ where: { feed: { guildId }, status: 'REJECTED' } }),
    prisma.youTubeItem.count({ where: { guildId, status: 'REJECTED' } }),
    prisma.dailyAlgoRun.count({ where: { guildId } }),
    prisma.dailyAlgoSubmission.count({ where: { run: { guildId } } }),
    prisma.newsInterestFeedback.count({ where: { guildId } }),
  ]);

  const uniqueSubscribers = subs.length;

  const totalTreated = feedItemsTreated + ytItemsTreated;
  const totalPublished = feedItemsPublished + ytItemsPublished;
  const totalPending = feedItemsPending + ytItemsPending;
  const totalRejected = feedItemsRejected + ytItemsRejected;
  const approvalRate = totalTreated > 0 ? Math.round((totalPublished / totalTreated) * 100) : 0;

  const uptime = process.uptime();
  const memory = process.memoryUsage();

  const guildCreated = interaction.guild?.createdTimestamp
    ? `<t:${Math.floor(interaction.guild.createdTimestamp / 1000)}:R>`
    : 'Inconnu';

  const reposPreview = guild?.githubRepositories?.length
    ? truncate(guild.githubRepositories.slice(0, 3).join(' • '), 140)
    : 'Aucun dépôt configuré';

  const digestSummary = guild?.digestEnabled
    ? `🟢 ${guild.digestFrequency.toLowerCase()} à ${guild.digestTime} (${guild.digestCount} news)`
    : '🔴 Désactivé';

  const embed = new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle('🛰️ Tableau de bord Kotbo')
    .setDescription('Vue rapide de la santé du bot, des modules actifs et des métriques de ce serveur.')
    .setThumbnail(interaction.client.user?.displayAvatarURL() ?? null)
    .addFields(
      {
        name: '🤖 Runtime',
        value: [
          `**Version bot:** \`${version}\``,
          `**Node:** \`${process.version}\``,
          `**Uptime:** \`${formatUptime(uptime)}\``,
          `**Latence WS:** \`${interaction.client.ws.ping} ms\``,
          `**Mémoire heap:** \`${formatMb(memory.heapUsed)} / ${formatMb(memory.heapTotal)}\``,
          `**Plateforme:** \`${process.platform}\``,
        ].join('\n'),
        inline: true,
      },
      {
        name: '🏠 Serveur',
        value: [
          `**Nom:** ${interaction.guild?.name ?? 'Inconnu'}`,
          `**Créé:** ${guildCreated}`,
          `**Membres visibles:** \`${interaction.guild?.memberCount ?? 0}\``,
          `**Serveurs connectés:** \`${interaction.client.guilds.cache.size}\``,
          `**Users en cache:** \`${interaction.client.users.cache.size}\``,
        ].join('\n'),
        inline: true,
      },
      {
        name: '🧩 Modules',
        value: [
          `**RSS:** ${enabledFeeds}/${totalFeeds} actifs (${autoPublishFeeds} auto-publish)`,
          `**YouTube:** ${boolChip(guild?.youtubeEnabled ?? false)} (${youtubeSubsCount} abonnement(s))`,
          `**Digest:** ${digestSummary}`,
          `**Traduction:** ${boolChip(guild?.translationEnabled ?? false)} (${guild?.defaultTranslateTo ?? 'FR'})`,
          `**Code Police:** ${boolChip(guild?.codePoliceEnabled ?? false)}`,
          `**Daily Algo:** ${boolChip(guild?.dailyAlgoEnabled ?? false)}`,
          `**GitHub Releases:** ${boolChip(guild?.githubReleasesEnabled ?? false)}`,
        ].join('\n'),
        inline: false,
      },
      {
        name: '📈 Contenu & modération',
        value: [
          `**Traitées:** \`${totalTreated}\``,
          `**Publiées:** \`${totalPublished}\``,
          `**En attente:** \`${totalPending}\``,
          `**Rejetées:** \`${totalRejected}\``,
          `**Taux d’approbation:** \`${approvalRate}%\``,
          `**Abonnés MP uniques:** \`${uniqueSubscribers}\``,
          `**Feedback d’intérêt:** \`${interestFeedback}\``,
          `**Runs Daily Algo:** \`${dailyAlgoRuns}\` (${dailyAlgoSubmissions} soumission(s))`,
        ].join('\n'),
        inline: true,
      },
      {
        name: '📣 Canaux configurés',
        value: [
          `**Validation news:** ${channelRef(guild?.configChannelId)}`,
          `**Publication:** ${channelRef(guild?.publicChannelId)}`,
          `**Digest:** ${channelRef(guild?.digestChannelId)}`,
          `**YouTube:** ${channelRef(guild?.youtubeChannelId)}`,
          `**Daily Algo:** ${channelRef(guild?.dailyAlgoChannelId)}`,
          `**Validation Daily Algo:** ${channelRef(guild?.dailyAlgoValidationChannelId)}`,
          `**Status check:** ${channelRef(guild?.statusCheckChannelId)}`,
        ].join('\n'),
        inline: true,
      },
      {
        name: '🚀 GitHub Releases',
        value: [
          `**Canal:** ${channelRef(guild?.githubReleasesChannelId)}`,
          `**Dépôts suivis:** \`${guild?.githubRepositories?.length ?? 0}\``,
          `**Aperçu:** ${reposPreview}`,
        ].join('\n'),
        inline: false,
      }
    )
    .setFooter({ text: `Kotbo • /config pour modifier les paramètres`, iconURL: interaction.guild?.iconURL() ?? undefined })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
}
