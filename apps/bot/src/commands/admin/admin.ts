import type { SlashCommandDefinition } from '../../commands.js';
import { SlashCommandBuilder, type ChatInputCommandInteraction, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { successEmbed, errorEmbed, infoEmbed, COLORS, truncate } from '../../utils/embeds.js';
import prisma from '../../utils/db.js';
import { createPagination } from '../../utils/pagination.js';
import { logger } from '../../utils/logger.js';
import {
  getModuleStatsSummary,
  getModuleActivationStats,
  getModuleUsageStats,
  getModulePerformanceStats,
  KOTBO_MODULES,
} from '../../services/analytics/moduleStatsService.js';



const data = new SlashCommandBuilder()
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
      .setName('stats')
      .setDescription('📊 Affiche les statistiques globales et des modules')
      .addStringOption(option =>
        option
          .setName('type')
          .setDescription('Type de statistiques')
          .setRequired(true)
          .addChoices(
            { name: 'Global', value: 'global' },
            { name: 'Modules', value: 'modules' },
            { name: 'Activation', value: 'activation' },
            { name: 'Usage', value: 'usage' },
            { name: 'Performance', value: 'performance' },
          )
      )
      .addIntegerOption(option =>
        option
          .setName('period')
          .setDescription('Période en jours (défaut: 30)')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(365)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('rescan-stats')
      .setDescription('📊 Scrapper l\'historique des messages pour initialiser les statistiques')
      .addBooleanOption(option =>
        option
          .setName('forcer')
          .setDescription('Forcer le re-scrap complet (recommencer à zéro)')
          .setRequired(false)
      )
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand() as string;
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
        functionName: 'solve',
        functionArgs: [{ name: 'input', type: 'unknown' }],
        unitTests: [{ name: 'placeholder', args: [null], expected: null }],
        allowedLanguages: ['javascript', 'typescript', 'python'],
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

  } else if (subcommand === 'stats') {
    const type = interaction.options.getString('type', true);
    const period = interaction.options.getInteger('period') || 30;
    const moduleName = interaction.options.getString('module') as any || undefined;

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    try {
      if (type === 'global') {
        // Stats globales existantes (guilds, users, sanctions, dailyAlgo, uptime, memory, shards)
        const guilds = await prisma.guild.findMany({ select: { id: true } });
        const guildCount = guilds.length;
        
        const totalMembers = await prisma.memberProfile.groupBy({
          by: ['guildId'],
          _count: true,
        });
        const userCount = totalMembers.reduce((acc, g) => acc + g._count, 0);

        const activeSanctions = await prisma.sanction.count({ where: { status: 'ACTIVE' } });
        const dailyAlgoSubmissions = await prisma.dailyAlgoSubmission.count();

        const uptime = Math.floor(process.uptime());
        const uptimeHours = Math.floor(uptime / 3600);
        const uptimeMinutes = Math.floor((uptime % 3600) / 60);
        const uptimeSeconds = uptime % 60;

        const memoryUsage = process.memoryUsage();
        const memoryMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);

        await interaction.editReply({
          embeds: [
            infoEmbed(
              '📊 Statistiques Globales Kotbo',
              `Période: ${period} jours`,
              [
                {
                  name: 'Serveurs',
                  value: guildCount.toString(),
                  inline: true,
                },
                {
                  name: 'Utilisateurs',
                  value: userCount.toString(),
                  inline: true,
                },
                {
                  name: 'Sanctions actives',
                  value: activeSanctions.toString(),
                  inline: true,
                },
                {
                  name: 'Submissions Daily Algo',
                  value: dailyAlgoSubmissions.toString(),
                  inline: true,
                },
                {
                  name: 'Uptime',
                  value: `${uptimeHours}h ${uptimeMinutes}m ${uptimeSeconds}s`,
                  inline: true,
                },
                {
                  name: 'Mémoire',
                  value: `${memoryMB} MB`,
                  inline: true,
                },
              ]
            ),
          ],
        });
      } else if (type === 'modules') {
        // Résumé complet des modules
        const summary = await getModuleStatsSummary({ guildId, periodDays: period });

        const fields = summary.topModules.slice(0, 10).map((m, i) => ({
          name: `${i + 1}. ${m.moduleName}`,
          value: `Utilisation: ${m.totalUsage} | Temps moyen: ${Math.round(m.avgExecutionTimeMs)}ms | Erreurs: ${Math.round(m.errorRate)}%`,
          inline: false,
        }));

        await interaction.editReply({
          embeds: [
            infoEmbed(
              '📊 Statistiques des Modules',
              `Période: ${period} jours | Top 10 modules`,
              fields
            ),
          ],
        });
      } else if (type === 'activation') {
        // Stats d'activation
        const activation = await getModuleActivationStats(guildId);
        const enabledCount = activation.filter(a => a.enabled).length;
        const disabledCount = activation.length - enabledCount;

        const fields = activation.slice(0, 15).map(a => ({
          name: `${a.moduleName}`,
          value: a.enabled ? '✅ Activé' : '❌ Désactivé',
          inline: true,
        }));

        await interaction.editReply({
          embeds: [
            infoEmbed(
              '📊 Activation des Modules',
              `Activés: ${enabledCount} | Désactivés: ${disabledCount}`,
              fields
            ),
          ],
        });
      } else if (type === 'usage') {
        // Stats d'utilisation
        const usage = await getModuleUsageStats({ guildId, moduleName, periodDays: period });

        const groupedByModule = new Map<string, { totalUsage: number; commandExecutions: number; apiCalls: number; eventTriggers: number }>();
        for (const u of usage) {
          const existing = groupedByModule.get(u.moduleName) || { totalUsage: 0, commandExecutions: 0, apiCalls: 0, eventTriggers: 0 };
          existing.totalUsage += u.totalUsage;
          existing.commandExecutions += u.commandExecutions;
          existing.apiCalls += u.apiCalls;
          existing.eventTriggers += u.eventTriggers;
          groupedByModule.set(u.moduleName, existing);
        }

        const sorted = Array.from(groupedByModule.entries())
          .map(([moduleName, stats]) => ({ moduleName, ...stats }))
          .sort((a, b) => b.totalUsage - a.totalUsage)
          .slice(0, 15);

        const fields = sorted.map((m, i) => ({
          name: `${i + 1}. ${m.moduleName}`,
          value: `Total: ${m.totalUsage} | Cmd: ${m.commandExecutions} | API: ${m.apiCalls} | Events: ${m.eventTriggers}`,
          inline: false,
        }));

        await interaction.editReply({
          embeds: [
            infoEmbed(
              '📊 Utilisation des Modules',
              `Période: ${period} jours${moduleName ? ` | Module: ${moduleName}` : ''}`,
              fields
            ),
          ],
        });
      } else if (type === 'performance') {
        // Stats de performance
        const performance = await getModulePerformanceStats({ guildId, moduleName, periodDays: period });

        const groupedByModule = new Map<string, { avgExecutionTimeMs: number; totalExecutions: number; errorCount: number; errorRate: number }>();
        for (const p of performance) {
          const existing = groupedByModule.get(p.moduleName) || { avgExecutionTimeMs: 0, totalExecutions: 0, errorCount: 0, errorRate: 0 };
          existing.avgExecutionTimeMs = (existing.avgExecutionTimeMs * existing.totalExecutions + p.avgExecutionTimeMs * p.totalExecutions) / (existing.totalExecutions + p.totalExecutions);
          existing.totalExecutions += p.totalExecutions;
          existing.errorCount += p.errorCount;
          existing.errorRate = (existing.errorCount / existing.totalExecutions) * 100;
          groupedByModule.set(p.moduleName, existing);
        }

        const sorted = Array.from(groupedByModule.entries())
          .map(([moduleName, stats]) => ({ moduleName, ...stats }))
          .sort((a, b) => b.totalExecutions - a.totalExecutions)
          .slice(0, 15);

        const fields = sorted.map((m, i) => ({
          name: `${i + 1}. ${m.moduleName}`,
          value: `Exécutions: ${m.totalExecutions} | Temps moyen: ${Math.round(m.avgExecutionTimeMs)}ms | Erreurs: ${Math.round(m.errorRate)}%`,
          inline: false,
        }));

        await interaction.editReply({
          embeds: [
            infoEmbed(
              '📊 Performance des Modules',
              `Période: ${period} jours${moduleName ? ` | Module: ${moduleName}` : ''}`,
              fields
            ),
          ],
        });
      }
    } catch (err) {
      logger.error('AdminCommand', 'Error fetching stats:', err);
      await interaction.editReply({
        embeds: [errorEmbed('Erreur', 'Impossible de récupérer les statistiques.')],
      });
    }
  } else if (subcommand === 'rescan-stats') {
    const force = interaction.options.getBoolean('forcer') ?? false;

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    try {
      const { startHistoricalScraping } = await import('../../services/analytics/messageScraperService.js');
      await startHistoricalScraping(interaction.client, guildId, force);

      await interaction.editReply({
        embeds: [
          successEmbed(
            'Scan des Statistiques Lancé',
            `Le scraping historique des messages a été démarré avec succès en arrière-plan.\n\n` +
            `• **Mode forcé :** ${force ? 'Oui (recommencer à zéro)' : 'Non'}\n` +
            `• Vous pouvez suivre l'avancement dans les logs ou via le statut en base de données.`
          ),
        ],
      });
    } catch (err) {
      console.error('Error starting historical scraping from admin:', err);
      await interaction.editReply({
        embeds: [
          errorEmbed(
            'Erreur',
            `Impossible de démarrer le scraping : ${err instanceof Error ? err.message : String(err)}`
          ),
        ],
      });
    }
  }
}

export const adminCommand = { data, execute } satisfies SlashCommandDefinition;
