import { SlashCommandBuilder, type ChatInputCommandInteraction, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { successEmbed, errorEmbed, infoEmbed, COLORS, truncate } from '../utils/embeds.js';
import prisma from '../utils/db.js';
import { createPagination } from '../utils/pagination.js';
import {
  getGuildRecommendationWeights,
  resetGuildRecommendationWeights,
  setGuildRecommendationWeights,
} from '../services/personalFeedService.js';
import { extractInterestTopics } from '../services/interestService.js';
import { sendWeeklyRecap } from '../services/recapService.js';

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function healthEmoji(score: number): string {
  if (score >= 80) return '🟢';
  if (score >= 55) return '🟡';
  return '🔴';
}

function computeFeedHealth(args: {
  enabled: boolean;
  autoPublish: boolean;
  lastPolledAt: Date | null;
  lastPollStatus: string | null;
  lastPollError: string | null;
  recentCount: number;
  configChannelId: string | null;
  publicChannelId: string | null;
}): { score: number; reasons: string[] } {
  if (!args.enabled) {
    return { score: 0, reasons: ['Flux désactivé'] };
  }

  let score = 100;
  const reasons: string[] = [];

  if (!args.lastPolledAt) {
    score -= 25;
    reasons.push('jamais pollé');
  }

  if (args.lastPollStatus === 'ERROR') {
    score -= 45;
    reasons.push('dernier poll en erreur');
  }

  if (args.lastPolledAt) {
    const ageMs = Date.now() - args.lastPolledAt.getTime();
    if (ageMs > 24 * 60 * 60 * 1000) {
      score -= 35;
      reasons.push('poll >24h');
    } else if (ageMs > 6 * 60 * 60 * 1000) {
      score -= 20;
      reasons.push('poll >6h');
    }
  }

  if (args.recentCount === 0) {
    score -= 15;
    reasons.push('aucun article sur 7j');
  }

  if (!args.autoPublish && !args.configChannelId) {
    score -= 30;
    reasons.push('salon validation manquant');
  }

  if (args.autoPublish && !args.publicChannelId) {
    score -= 30;
    reasons.push('salon public manquant');
  }

  if (args.lastPollError && args.lastPollStatus === 'ERROR') {
    reasons.push(`erreur: ${truncate(args.lastPollError, 70)}`);
  }

  return { score: clampScore(score), reasons: reasons.slice(0, 3) };
}

export const data = new SlashCommandBuilder()
  .setName('admin')
  .setDescription('🔧 Commandes administrateur')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sub =>
    sub
      .setName('info')
      .setDescription('Affiche les informations de configuration actuelles')
  )
  .addSubcommand(sub =>
    sub
      .setName('add-daily-algo')
      .setDescription('Ajoute un nouveau problème dans la banque Daily Algo')
      .addStringOption(option =>
        option
          .setName('titre')
          .setDescription('Titre du problème')
          .setRequired(true),
      )
      .addStringOption(option =>
        option
          .setName('question')
          .setDescription('Énoncé du Daily Algo')
          .setRequired(true),
      )
      .addStringOption(option =>
        option
          .setName('solution')
          .setDescription('Solution attendue')
          .setRequired(true),
      )
      .addStringOption(option =>
        option
          .setName('difficulte')
          .setDescription('Niveau de difficulté')
          .addChoices(
            { name: 'Facile', value: 'facile' },
            { name: 'Moyen', value: 'moyen' },
            { name: 'Difficile', value: 'difficile' },
          )
          .setRequired(true),
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('set-algo-channel')
      .setDescription('Définit le salon pour le Daily Algo')
      .addChannelOption(option =>
        option
          .setName('channel')
          .setDescription('Le salon des défis quotidiens')
          .setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('set-releases-channel')
      .setDescription('Définit le salon pour les releases GitHub')
      .addChannelOption(option =>
        option
          .setName('channel')
          .setDescription('Le salon des releases GitHub')
          .setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('health-report')
      .setDescription('Rapport santé des flux RSS avec alertes et priorités')
      .addIntegerOption(option =>
        option
          .setName('limite')
          .setDescription('Nombre max de flux à afficher (5-50)')
          .setRequired(false)
          .setMinValue(5)
          .setMaxValue(50)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('reco-weights')
      .setDescription('Configurer les poids du moteur de recommandation (runtime)')
      .addNumberOption(option =>
        option
          .setName('topic')
          .setDescription('Poids du score thématique (0 à 3)')
          .setRequired(false)
          .setMinValue(0)
          .setMaxValue(3)
      )
      .addNumberOption(option =>
        option
          .setName('fraicheur')
          .setDescription('Poids du boost de fraîcheur (0 à 3)')
          .setRequired(false)
          .setMinValue(0)
          .setMaxValue(3)
      )
      .addNumberOption(option =>
        option
          .setName('historique')
          .setDescription('Poids du score historique (0 à 3)')
          .setRequired(false)
          .setMinValue(0)
          .setMaxValue(3)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('reco-weights-reset')
      .setDescription('Réinitialiser les poids de recommandation aux valeurs par défaut')
  )
  .addSubcommand(sub =>
    sub
      .setName('trend-topics')
      .setDescription('Afficher les thèmes dominants des news approuvées')
      .addStringOption(option =>
        option
          .setName('periode')
          .setDescription('Fenêtre temporelle à analyser')
          .setRequired(false)
          .addChoices(
            { name: '7 jours', value: '7d' },
            { name: '30 jours', value: '30d' },
          )
      )
      .addIntegerOption(option =>
        option
          .setName('limite')
          .setDescription('Nombre de thèmes à retourner (5 à 25)')
          .setRequired(false)
          .setMinValue(5)
          .setMaxValue(25)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('publish-weekly-recap')
      .setDescription('Génère et publie le recap hebdomadaire (Weekly Feed Actu)')
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  if (!guildId) {
    await interaction.reply({
      embeds: [errorEmbed('Erreur', 'Cette commande doit être utilisée dans un serveur.')],
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await prisma.guild.upsert({ where: { id: guildId }, update: {}, create: { id: guildId } });

  if (subcommand === 'info') {
    const guild = await prisma.guild.findUnique({
      where: { id: guildId },
      select: {
        dailyAlgoChannelId: true,
        dailyAlgoValidationChannelId: true,
        dailyAlgoEnabled: true,
        dailyAlgoTime: true,
        githubReleasesChannelId: true,
        githubReleasesEnabled: true,
        githubRepositories: true,
      },
    });

    await interaction.reply({
      embeds: [
        infoEmbed(
          'Configuration actuelle',
          'Paramètres persistés en base de données',
          [
            {
              name: 'Salon Daily Algo',
              value: guild?.dailyAlgoChannelId ? `<#${guild.dailyAlgoChannelId}>` : '❌ Non configuré',
              inline: true,
            },
            {
              name: 'Salon validation Daily Algo',
              value: guild?.dailyAlgoValidationChannelId ? `<#${guild.dailyAlgoValidationChannelId}>` : '❌ Non configuré',
              inline: true,
            },
            {
              name: 'Salon releases GitHub',
              value: guild?.githubReleasesChannelId ? `<#${guild.githubReleasesChannelId}>` : '❌ Non configuré',
              inline: true,
            },
            {
              name: 'Daily Algo',
              value: guild?.dailyAlgoEnabled ? `✅ Activé (${guild.dailyAlgoTime} UTC)` : '❌ Désactivé',
              inline: true,
            },
            {
              name: 'Releases GitHub',
              value: guild?.githubReleasesEnabled
                ? `✅ Activé (${guild.githubRepositories.length} repos)`
                : '❌ Désactivé',
              inline: false,
            },
          ]
        ),
      ],
      flags: [MessageFlags.Ephemeral],
    });
  } else if (subcommand === 'add-daily-algo') {
    const titre = interaction.options.getString('titre', true).trim();
    const question = interaction.options.getString('question', true).trim();
    const solution = interaction.options.getString('solution', true).trim();
    const difficulte = interaction.options.getString('difficulte', true).trim();

    const existing = await prisma.dailyAlgoProblem.findFirst({
      where: {
        title: titre,
        language: 'fr',
      },
    });

    if (existing) {
      await interaction.reply({
        embeds: [
          infoEmbed(
            'Daily Algo déjà présent',
            `Le problème **${titre}** existe déjà dans la banque française.`
          ),
        ],
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    await prisma.dailyAlgoProblem.create({
      data: {
        title: titre,
        description: question,
        solution,
        difficulty: difficulte,
        language: 'fr',
      },
    });

    await interaction.reply({
      embeds: [
        successEmbed(
          'Daily Algo ajouté',
          `Le problème **${titre}** a été ajouté à la banque et pourra être sélectionné une seule fois.`
        ),
      ],
      flags: [MessageFlags.Ephemeral],
    });
  } else if (subcommand === 'set-algo-channel') {
    const channel = interaction.options.getChannel('channel', true);

    if (channel.type !== 0 && channel.type !== 5) { // 5 = GUILD_NEWS (announce channel)
      await interaction.reply({
        embeds: [errorEmbed('Erreur', 'Le salon doit être un salon texte')],
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    await interaction.reply({
      embeds: [
        successEmbed(
          'Salon Daily Algo configuré',
          `Le Daily Algo sera publié dans ${channel.toString()}`
        ),
      ],
      flags: [MessageFlags.Ephemeral],
    });

    await prisma.guild.update({
      where: { id: guildId },
      data: { dailyAlgoChannelId: channel.id },
    });
  } else if (subcommand === 'set-releases-channel') {
    const channel = interaction.options.getChannel('channel', true);

    if (channel.type !== 0 && channel.type !== 5) { // 5 = GUILD_NEWS (announce channel)
      await interaction.reply({
        embeds: [errorEmbed('Erreur', 'Le salon doit être un salon texte')],
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    await interaction.reply({
      embeds: [
        successEmbed(
          'Salon releases GitHub configuré',
          `Les releases GitHub seront publiées dans ${channel.toString()}`
        ),
      ],
      flags: [MessageFlags.Ephemeral],
    });

    await prisma.guild.update({
      where: { id: guildId },
      data: { githubReleasesChannelId: channel.id },
    });
  } else if (subcommand === 'health-report') {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const limit = interaction.options.getInteger('limite') ?? 25;
    const guild = await prisma.guild.findUnique({
      where: { id: guildId },
      select: {
        configChannelId: true,
        publicChannelId: true,
      },
    });

    const feeds = await prisma.feed.findMany({
      where: { guildId },
      orderBy: { name: 'asc' },
      take: Math.max(5, Math.min(50, limit)),
    });

    if (feeds.length === 0) {
      await interaction.editReply({ embeds: [infoEmbed('Aucun flux', 'Ajoute des flux avec /feed add avant de lancer ce rapport.')] });
      return;
    }

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const groupedCounts = await prisma.feedItem.groupBy({
      by: ['feedId'],
      where: {
        feedId: { in: feeds.map((feed) => feed.id) },
        createdAt: { gte: since },
      },
      _count: { _all: true },
    });
    const countMap = new Map(groupedCounts.map((entry) => [entry.feedId, entry._count._all]));

    const rows = feeds.map((feed) => {
      const health = computeFeedHealth({
        enabled: feed.enabled,
        autoPublish: feed.autoPublish,
        lastPolledAt: feed.lastPolledAt,
        lastPollStatus: feed.lastPollStatus,
        lastPollError: feed.lastPollError,
        recentCount: countMap.get(feed.id) ?? 0,
        configChannelId: guild?.configChannelId ?? null,
        publicChannelId: guild?.publicChannelId ?? null,
      });

      return {
        feed,
        health,
        recentCount: countMap.get(feed.id) ?? 0,
      };
    }).sort((a, b) => b.health.score - a.health.score);

    const lines = rows.map(({ feed, health, recentCount }) => {
      const lastPoll = feed.lastPolledAt ? `<t:${Math.floor(feed.lastPolledAt.getTime() / 1000)}:R>` : 'jamais';
      const details = health.reasons.length > 0 ? ` (${health.reasons.join(' • ')})` : '';
      return `${healthEmoji(health.score)} **${feed.name}** · ${health.score}/100\n↳ 7j: ${recentCount} · dernier poll: ${lastPoll}${details}`;
    });

    const critical = rows.filter((row) => row.health.score < 55).slice(0, 3);
    const footerPrefix = critical.length > 0
      ? `Alertes: ${critical.map((row) => `${row.feed.name} ${row.health.score}/100`).join(' | ')}`
      : 'Aucune alerte critique';

    await createPagination({
      interaction,
      items: lines,
      pageSize: 8,
      title: '🩺 Rapport santé des flux RSS',
      color: COLORS.info,
      footerPrefix,
    });
  } else if (subcommand === 'reco-weights') {
    const topic = interaction.options.getNumber('topic');
    const freshness = interaction.options.getNumber('fraicheur');
    const historical = interaction.options.getNumber('historique');

    const current = getGuildRecommendationWeights(guildId);
    const next = setGuildRecommendationWeights(guildId, {
      topic: topic ?? undefined,
      freshness: freshness ?? undefined,
      historical: historical ?? undefined,
    });

    await interaction.reply({
      embeds: [
        successEmbed(
          'Poids de recommandation mis à jour',
          [
            `Valeurs précédentes: topic=${current.topic.toFixed(2)} • fraîcheur=${current.freshness.toFixed(2)} • historique=${current.historical.toFixed(2)}`,
            `Nouvelles valeurs: topic=${next.topic.toFixed(2)} • fraîcheur=${next.freshness.toFixed(2)} • historique=${next.historical.toFixed(2)}`,
            'Note: réglage runtime (réinitialisé au redémarrage du bot).',
          ].join('\n'),
        ),
      ],
      flags: [MessageFlags.Ephemeral],
    });
  } else if (subcommand === 'reco-weights-reset') {
    const defaults = resetGuildRecommendationWeights(guildId);
    await interaction.reply({
      embeds: [
        infoEmbed(
          'Poids réinitialisés',
          `Valeurs par défaut: topic=${defaults.topic.toFixed(2)} • fraîcheur=${defaults.freshness.toFixed(2)} • historique=${defaults.historical.toFixed(2)}`,
        ),
      ],
      flags: [MessageFlags.Ephemeral],
    });
  } else if (subcommand === 'trend-topics') {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const period = interaction.options.getString('periode') ?? '7d';
    const limit = interaction.options.getInteger('limite') ?? 10;
    const days = period === '30d' ? 30 : 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const items = await prisma.feedItem.findMany({
      where: {
        feed: { guildId },
        status: 'APPROVED',
        createdAt: { gte: since },
      },
      select: {
        title: true,
        titleTranslated: true,
        description: true,
        descriptionTranslated: true,
        topics: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });

    if (items.length === 0) {
      await interaction.editReply({
        embeds: [infoEmbed('Aucune donnée', `Aucune news approuvée sur les ${days} derniers jours.`)],
      });
      return;
    }

    const topicMap = new Map<string, number>();
    for (const item of items) {
      const topics = item.topics.length > 0
        ? item.topics
        : extractInterestTopics(item.titleTranslated ?? item.title, item.descriptionTranslated ?? item.description);
      for (const topic of topics) {
        topicMap.set(topic, (topicMap.get(topic) ?? 0) + 1);
      }
    }

    const top = Array.from(topicMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.max(5, Math.min(25, limit)));

    if (top.length === 0) {
      await interaction.editReply({
        embeds: [infoEmbed('Aucune tendance exploitable', 'Les news analysées ne contiennent pas assez de topics.')],
      });
      return;
    }

    const lines = top.map(([topic, count], index) => `${index + 1}. \`${topic}\` — ${count} occurrence(s)`);
    await createPagination({
      interaction,
      items: lines,
      pageSize: 10,
      title: `📈 Tendances thèmes (${days} jours)`,
      color: COLORS.info,
      footerPrefix: `News analysées: ${items.length}`,
    });
  } else if (subcommand === 'publish-weekly-recap') {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    try {
      await sendWeeklyRecap(interaction.client, guildId);
      await interaction.editReply({
        embeds: [successEmbed('Recap Hebdomadaire lancé', 'Le recap hebdomadaire a été généré et envoyé dans le salon public.')],
      });
    } catch (error: any) {
      await interaction.editReply({
        embeds: [errorEmbed('Erreur de publication', error.message || 'Une erreur inconnue est survenue.')],
      });
    }
  }
}
