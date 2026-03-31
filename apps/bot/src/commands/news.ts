import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  EmbedBuilder,
} from 'discord.js';
import prisma from '../utils/db.js';
import { errorEmbed, successEmbed, infoEmbed, COLORS } from '../utils/embeds.js';
import { fetchArticleMetadata } from '../utils/metadataParser.js';
import { sendToValidationQueue } from '../services/notificationService.js';

export const data = new SlashCommandBuilder()
  .setName('news')
  .setDescription('📰 Soumettre manuellement une news')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addSubcommand((sc) =>
    sc
      .setName('submit')
      .setDescription('Soumettre un article via son lien')
      .addStringOption((o) => o.setName('url').setDescription("L'URL de l'article").setRequired(true)),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  const guildId = interaction.guildId!;
  const url = interaction.options.getString('url', true);

  try {
    new URL(url);
  } catch {
    await interaction.editReply({ embeds: [errorEmbed('URL invalide', "Veuillez entrer une URL valide.")] });
    return;
  }

  const metadata = await fetchArticleMetadata(url);
  if (!metadata.title) {
    await interaction.editReply({ embeds: [errorEmbed('Erreur', "Impossible de récupérer les informations de l'article. Le site bloque peut-être l'accès.")] });
    return;
  }

  // Find a matching feed by domain
  const urlObj = new URL(url);
  const hostname = urlObj.hostname.replace('www.', '');
  
  const feeds = await prisma.feed.findMany({ where: { guildId } });
  const matchingFeed = feeds.find(f => {
    try {
      return new URL(f.url).hostname.replace('www.', '') === hostname;
    } catch {
      return false;
    }
  });

  if (matchingFeed) {
    // Check if item already exists
    const existingItem = await prisma.feedItem.findUnique({
      where: { feedId_guid: { feedId: matchingFeed.id, guid: url } }
    });

    if (existingItem) {
      await interaction.editReply({ embeds: [infoEmbed('Déjà soumis', `Cet article a déjà été soumis (ID: ${existingItem.id})`)] });
      return;
    }

    // Create item and send to queue
    const item = await prisma.feedItem.create({
      data: {
        feedId: matchingFeed.id,
        guid: url,
        url: url,
        title: metadata.title,
        description: metadata.description,
        imageUrl: metadata.imageUrl,
        publishedAt: new Date(),
        status: 'PENDING',
      }
    });

    await sendToValidationQueue(interaction.client, item.id, 'rss');

    await interaction.editReply({
      embeds: [successEmbed('Article soumis !', `L'article de **${matchingFeed.name}** a été envoyé en validation.\n\n**${metadata.title}**`) ]
    });
  } else {
    // No matching feed found
    const sessionId = `${interaction.user.id}:${Date.now()}`;
    const { createNewsSession } = await import('../handlers/newsSessionStore.js');
    createNewsSession(sessionId, {
      url,
      metadata,
      guildId,
      userId: interaction.user.id,
    });

    const embed = new EmbedBuilder()
      .setColor(COLORS.warning)
      .setTitle('🔍 Flux RSS non trouvé')
      .setDescription(`Le site **${hostname}** n'est pas dans votre liste de flux RSS.\n\n` +
        `**Titre :** ${metadata.title || '*Non détecté*'}\n` +
        `**Description :** ${metadata.description ? (metadata.description.length > 200 ? metadata.description.substring(0, 200) + '...' : metadata.description) : '*Non détectée*'}\n\n` +
        (metadata.rssUrl 
          ? `Un flux RSS a été détecté : \`${metadata.rssUrl}\`.\n` 
          : "Aucun flux RSS n'a été détecté automatiquement.\n"))
      .setTimestamp();

    if (metadata.imageUrl) embed.setThumbnail(metadata.imageUrl);

    const row = new ActionRowBuilder<ButtonBuilder>();
    
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`news:publish_no_feed:${sessionId}`)
        .setLabel('Publier sans ajouter')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`news:edit_metadata:${sessionId}`)
        .setLabel('Modifier')
        .setStyle(ButtonStyle.Secondary)
    );

    if (metadata.rssUrl) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`news:add_detected:${sessionId}`)
          .setLabel('Ajouter le flux')
          .setStyle(ButtonStyle.Primary)
      );
    } else {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`news:add_manual:${sessionId}`)
          .setLabel('Ajouter manuellement')
          .setStyle(ButtonStyle.Secondary)
      );
    }

    await interaction.editReply({ embeds: [embed], components: [row] });
  }
}

