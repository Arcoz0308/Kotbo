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
    subs,
    feedItemsTreated,
    ytItemsTreated,
    feedItemsPublished,
    ytItemsPublished,
  ] = await Promise.all([
    prisma.guild.findUnique({ where: { id: guildId } }),
    getVersion(),
    prisma.feed.count({ where: { guildId } }),
    prisma.feed.count({ where: { guildId, enabled: true } }),
    prisma.userFeedSub.findMany({ where: { feed: { guildId } }, distinct: ['userId'], select: { userId: true } }),
    prisma.feedItem.count({ where: { feed: { guildId }, status: { not: 'PENDING' } } }),
    prisma.youTubeItem.count({ where: { guildId, status: { not: 'PENDING' } } }),
    prisma.feedItem.count({ where: { feed: { guildId }, status: 'APPROVED' } }),
    prisma.youTubeItem.count({ where: { guildId, status: 'APPROVED' } }),
  ]);

  const uniqueSubscribers = subs.length;

  const totalTreated = feedItemsTreated + ytItemsTreated;
  const totalPublished = feedItemsPublished + ytItemsPublished;
  const uptime = process.uptime();

  const embed = new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle('ℹ️ Informations Kotbo')
    .setThumbnail(interaction.client.user?.displayAvatarURL() ?? null)
    .addFields(
      { 
        name: '🤖 Bot & état', 
        value: `**Version:** \`${version}\`\n**Uptime:** \`${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m\`\n**Serveurs:** ${interaction.client.guilds.cache.size}`, 
        inline: true 
      },
      { 
        name: '📊 Global', 
        value: `**Latence:** \`${interaction.client.ws.ping}ms\`\n**Utilisateurs:** ${interaction.client.users.cache.size}\n**Mémoire:** \`${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB\``, 
        inline: true 
      },
      
      { name: '\u200B', value: '\u200B', inline: false },

      { 
        name: '📡 Sources & audience', 
        value: `**Flux RSS:** \`${enabledFeeds}/${totalFeeds}\` actifs\n**YouTube:** ${guild?.youtubeEnabled ? '✅' : '❌'}\n**Abonnés MP:** \`${uniqueSubscribers}\` unique(s)`, 
        inline: true 
      },
      { 
        name: '📰 Statistiques des actualités', 
        value: `**Traitées:** \`${totalTreated}\` news\n**Publiées:** \`${totalPublished}\` news\n**Approbation:** \`${totalTreated > 0 ? Math.round((totalPublished / totalTreated) * 100) : 0}%\``, 
        inline: true 
      },

      { 
        name: '⚙️ Configuration des salons', 
        value: [
          `**Validation :** ${guild?.configChannelId ? `<#${guild.configChannelId}>` : 'Non défini'}`,
          `**Public :** ${guild?.publicChannelId ? `<#${guild.publicChannelId}>` : 'Non défini'}`,
          `**Digest :** ${guild?.digestChannelId ? `<#${guild.digestChannelId}>` : 'Non défini'}`
        ].join('\n'),
        inline: false 
      }
    )
    .setFooter({ text: `Kotbo · ${interaction.guild?.name ?? 'Serveur'}`, iconURL: interaction.guild?.iconURL() ?? undefined })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
}
