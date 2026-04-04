import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import prisma from '../utils/db.js';
import { errorEmbed, successEmbed, infoEmbed, COLORS } from '../utils/embeds.js';
import { fetchArticleMetadata } from '../utils/metadataParser.js';
import { sendApprovedItem, sendToValidationQueue } from '../services/notificationService.js';
import { getParisDayRange } from '../services/interestService.js';

export const data = new SlashCommandBuilder()
  .setName('news')
  .setDescription('📰 Gérer les news')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addSubcommand((sc) =>
    sc
      .setName('submit')
      .setDescription('Soumettre un article via son lien')
      .addStringOption((o) => o.setName('url').setDescription("L'URL de l'article").setRequired(true)),
  )
  .addSubcommand((sc) =>
    sc
      .setName('lot')
      .setDescription('Publier toutes les news d’une période donnée')
      .addStringOption((o) =>
        o
          .setName('duree')
          .setDescription('Fenêtre à traiter (ex: 30m, 6h, 2j, 1w)')
          .setRequired(true),
      )
      .addBooleanOption((o) =>
        o
          .setName('auto_publier')
          .setDescription('Publier directement dans le salon public ? sinon en validation')
          .setRequired(true),
      ),
  )
  .addSubcommand((sc) =>
    sc
      .setName('rattrapage')
      .setDescription('Afficher les sujets filtrés aujourd\'hui par l\'algo de goûts')
      .addIntegerOption((o) =>
        o
          .setName('limite')
          .setDescription('Nombre max de sujets à afficher (1-50)')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(50),
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const subcommand = interaction.options.getSubcommand();
  if (subcommand === 'lot') {
    const guildId = interaction.guildId!;
    const durationInput = interaction.options.getString('duree', true);
    const autoPublish = interaction.options.getBoolean('auto_publier', true);
    const window = parseDurationWindow(durationInput);

    if (!window) {
      await interaction.editReply({
        embeds: [
          errorEmbed(
            'Fenêtre invalide',
            'Utilise une durée du type `30m`, `6h`, `2j` ou `1w`.',
          ),
        ],
      });
      return;
    }

    const guild = await prisma.guild.findUnique({
      where: { id: guildId },
      select: { configChannelId: true, publicChannelId: true },
    });

    if (!guild) {
      await interaction.editReply({ embeds: [errorEmbed('Serveur introuvable', 'Impossible de charger la configuration du serveur.')] });
      return;
    }

    if (autoPublish && !guild.publicChannelId) {
      await interaction.editReply({
        embeds: [errorEmbed('Salon public manquant', 'L’auto-publication est activée, mais aucun salon public n’est configuré.')],
      });
      return;
    }

    if (!autoPublish && !guild.configChannelId) {
      await interaction.editReply({
        embeds: [errorEmbed('Salon de validation manquant', 'La validation est demandée, mais aucun salon de validation n’est configuré.')],
      });
      return;
    }

    const now = new Date();
    const since = new Date(now.getTime() - window.ms);

    const items = await prisma.feedItem.findMany({
      where: {
        feed: { guildId },
        createdAt: { gte: since, lte: now },
      },
      include: { feed: true },
      orderBy: { createdAt: 'asc' },
    });

    if (items.length === 0) {
      await interaction.editReply({
        embeds: [
          infoEmbed(
            'Aucune news trouvée',
            `Aucune news n’a été trouvée sur la période **${window.label}**.`,
          ),
        ],
      });
      return;
    }

    const candidates = items.filter((item) => {
      const alreadyInValidation = Boolean(item.queueMessageId);
      const alreadyInPublic = Boolean(item.publicMessageId);
      const alreadyHandledByStatus = item.status === 'APPROVED' || item.status === 'REJECTED';
      return !alreadyInValidation && !alreadyInPublic && !alreadyHandledByStatus;
    });
    const skippedCount = items.length - candidates.length;

    if (candidates.length === 0) {
      await interaction.editReply({
        embeds: [
          infoEmbed(
            'News déjà traitées',
            `Les **${items.length}** news trouvées sur **${window.label}** ont déjà été envoyées ou publiées.`,
          ),
        ],
      });
      return;
    }

    const failures: string[] = [];
    let processedCount = 0;

    for (const item of candidates) {
      try {
        if (autoPublish) {
          await sendApprovedItem(interaction.client, item.id, 'rss');
        } else {
          await sendToValidationQueue(interaction.client, item.id, 'rss');
        }
        processedCount += 1;
      } catch {
        failures.push(item.title);
      }
    }

    const destination = autoPublish ? 'auto-publication' : 'validation';
    const summaryLines = [
      `Période traitée : **${window.label}**`,
      `News trouvées : **${items.length}**`,
      `News envoyées en ${destination} : **${processedCount}**`,
      skippedCount > 0 ? `News déjà traitées ignorées : **${skippedCount}**` : null,
      failures.length > 0 ? `Échecs : **${failures.length}**` : null,
    ].filter((line): line is string => Boolean(line));

    const resultEmbed = processedCount > 0
      ? successEmbed(
          autoPublish ? 'Lot auto-publié' : 'Lot envoyé en validation',
          summaryLines.join('\n') + (failures.length > 0 ? `\n\nArticles en erreur : ${failures.slice(0, 5).join(', ')}` : ''),
        )
      : errorEmbed(
          'Lot non traité',
          summaryLines.join('\n') + (failures.length > 0 ? `\n\nArticles en erreur : ${failures.slice(0, 5).join(', ')}` : ''),
        );

    await interaction.editReply({ embeds: [resultEmbed] });
    return;
  }

  if (subcommand === 'rattrapage') {
    const guildId = interaction.guildId!;
    const limit = interaction.options.getInteger('limite') ?? 50;
    const { start, end } = getParisDayRange();

    const filteredItems = await prisma.feedItem.findMany({
      where: {
        feed: { guildId },
        interestDecision: 'FILTERED_OUT',
        createdAt: { gte: start, lt: end },
      },
      include: { feed: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    if (filteredItems.length === 0) {
      await interaction.editReply({
        embeds: [infoEmbed('Aucun sujet filtré', 'Aucune news n\'a été filtrée par l\'algo aujourd\'hui.')],
      });
      return;
    }

    const lines = filteredItems.map((item, index) => {
      const topics = item.topics.length > 0 ? item.topics.slice(0, 3).join(', ') : 'sujet non détecté';
      return `${index + 1}. **${item.title}**\n   ↳ ${item.feed.name} • ${topics}`;
    });

    const embed = new EmbedBuilder()
      .setColor(COLORS.warning)
      .setTitle('🧠 Sujets non envoyés (filtrés par goûts)')
      .setDescription(lines.join('\n\n').slice(0, 3900))
      .setFooter({ text: 'Sélectionne les sujets à reclasser comme intéressants.' })
      .setTimestamp();

    const options = filteredItems.slice(0, 50).map((item) => ({
      label: item.title.length > 95 ? `${item.title.slice(0, 92)}...` : item.title,
      value: item.id,
      description: (item.topics.length > 0 ? item.topics.join(', ') : item.feed.name).slice(0, 95),
    }));

    const rows: ActionRowBuilder<StringSelectMenuBuilder>[] = [];
    const firstBatch = options.slice(0, 25);
    const secondBatch = options.slice(25, 50);

    if (firstBatch.length > 0) {
      rows.push(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('news:recovery:topics:1')
            .setPlaceholder('Marquer des sujets comme intéressants (1/2)')
            .setMinValues(1)
            .setMaxValues(Math.min(5, firstBatch.length))
            .addOptions(firstBatch),
        ),
      );
    }

    if (secondBatch.length > 0) {
      rows.push(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('news:recovery:topics:2')
            .setPlaceholder('Marquer des sujets comme intéressants (2/2)')
            .setMinValues(1)
            .setMaxValues(Math.min(5, secondBatch.length))
            .addOptions(secondBatch),
        ),
      );
    }

    await interaction.editReply({ embeds: [embed], components: rows });
    return;
  }

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

function parseDurationWindow(input: string): { ms: number; label: string } | null {
  const normalized = input.trim().toLowerCase();
  const match = normalized.match(/^(\d+)(m|h|d|j|w)$/);
  if (!match) return null;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const unit = match[2];
  const multiplierByUnit: Record<string, number> = {
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    j: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
  };

  const ms = amount * multiplierByUnit[unit];
  if (!Number.isFinite(ms) || ms <= 0) return null;

  const unitLabelByUnit: Record<string, string> = {
    m: amount === 1 ? 'minute' : 'minutes',
    h: amount === 1 ? 'heure' : 'heures',
    d: amount === 1 ? 'jour' : 'jours',
    j: amount === 1 ? 'jour' : 'jours',
    w: amount === 1 ? 'semaine' : 'semaines',
  };

  return {
    ms,
    label: `${amount} ${unitLabelByUnit[unit]}`,
  };
}

