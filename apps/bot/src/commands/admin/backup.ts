import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  ComponentType,
  type ChatInputCommandInteraction,
} from 'discord.js';
import prisma from '../../utils/db.js';
import { errorEmbed, infoEmbed, successEmbed, baseEmbed, COLORS } from '../../utils/embeds.js';
import { createBackup } from '../../services/system/backupService.js';
import { restoreBackup, RestoreOptions } from '../../services/system/restoreService.js';
import { extractTrackingInfo, resolveModuleFromCommand, wrapModuleTracking } from '../../utils/moduleTracking.js';

const MAX_BACKUPS_PER_GUILD = 3;

export const data = new SlashCommandBuilder()
  .setName('backup')
  .setDescription('💾 Gère les sauvegardes du serveur (roles, salons, permissions, emojis, stickers)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) =>
    sub
      .setName('create')
      .setDescription('Crée une nouvelle sauvegarde du serveur')
      .addStringOption((option) =>
        option.setName('nom').setDescription('Nom de la sauvegarde (défaut: nom du serveur + date)').setRequired(false),
      )
      .addStringOption((option) =>
        option.setName('description').setDescription('Description de la sauvegarde').setRequired(false),
      )
      .addBooleanOption((option) =>
        option.setName('inclure_messages').setDescription('Inclure les messages (défaut: false)').setRequired(false),
      )
      .addBooleanOption((option) =>
        option.setName('inclure_membres').setDescription('Inclure les membres (défaut: true)').setRequired(false),
      )
      .addBooleanOption((option) =>
        option.setName('inclure_roles').setDescription('Inclure les rôles (défaut: true)').setRequired(false),
      )
      .addBooleanOption((option) =>
        option.setName('inclure_salons').setDescription('Inclure les salons (défaut: true)').setRequired(false),
      )
      .addBooleanOption((option) =>
        option.setName('inclure_emojis').setDescription('Inclure les emojis (défaut: true)').setRequired(false),
      )
      .addBooleanOption((option) =>
        option.setName('inclure_stickers').setDescription('Inclure les stickers (défaut: true)').setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('list')
      .setDescription('Liste toutes les sauvegardes du serveur'),
  )
  .addSubcommand((sub) =>
    sub
      .setName('restore')
      .setDescription('Restaure une sauvegarde')
      .addStringOption((option) =>
        option.setName('id').setDescription('ID de la sauvegarde à restaurer').setRequired(true).setAutocomplete(true),
      )
      .addBooleanOption((option) =>
        option.setName('mode_complet').setDescription('Restauration complète (défaut: false = sélective)').setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('delete')
      .setDescription('Supprime une sauvegarde')
      .addStringOption((option) =>
        option.setName('id').setDescription('ID de la sauvegarde à supprimer').setRequired(true).setAutocomplete(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('export')
      .setDescription('Exporte une sauvegarde en fichier JSON')
      .addStringOption((option) =>
        option.setName('id').setDescription('ID de la sauvegarde à exporter').setRequired(true).setAutocomplete(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('import')
      .setDescription('Importe une sauvegarde depuis un fichier JSON')
      .addAttachmentOption((option) =>
        option.setName('fichier').setDescription('Fichier JSON de la sauvegarde').setRequired(true),
      )
      .addStringOption((option) =>
        option.setName('nom').setDescription('Nom de la sauvegarde importée').setRequired(false),
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const subcommand = interaction.options.getSubcommand();

  const moduleInfo = resolveModuleFromCommand('backup');
  const trackingInfo = extractTrackingInfo(interaction);

  try {
    switch (subcommand) {
      case 'create':
        await handleCreate(interaction, guildId, moduleInfo, trackingInfo);
        break;
      case 'list':
        await handleList(interaction, guildId);
        break;
      case 'restore':
        await handleRestore(interaction, guildId);
        break;
      case 'delete':
        await handleDelete(interaction, guildId);
        break;
      case 'export':
        await handleExport(interaction, guildId);
        break;
      case 'import':
        await handleImport(interaction, guildId);
        break;
    }
  } catch (error) {
    console.error('Error in backup command:', error);
    await interaction.reply({
      embeds: [errorEmbed('Une erreur est survenue lors de l\'exécution de la commande.')],
      ephemeral: true,
    });
  }
}

async function handleCreate(
  interaction: ChatInputCommandInteraction,
  guildId: string,
  moduleInfo: ReturnType<typeof resolveModuleFromCommand>,
  trackingInfo: ReturnType<typeof extractTrackingInfo>,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild!;
  const customName = interaction.options.getString('nom');
  const description = interaction.options.getString('description');
  const includeMessages = interaction.options.getBoolean('inclure_messages') ?? false;
  const includeMembers = interaction.options.getBoolean('inclure_membres') ?? true;
  const includeRoles = interaction.options.getBoolean('inclure_roles') ?? true;
  const includeChannels = interaction.options.getBoolean('inclure_salons') ?? true;
  const includeEmojis = interaction.options.getBoolean('inclure_emojis') ?? true;
  const includeStickers = interaction.options.getBoolean('inclure_stickers') ?? true;

  // Vérifier le nombre de backups existants
  const existingBackups = await (prisma as any).serverBackup.count({
    where: { guildId, isPreset: false },
  });

  if (existingBackups >= MAX_BACKUPS_PER_GUILD) {
    await interaction.editReply({
      embeds: [
        errorEmbed(
          `Vous avez atteint la limite de ${MAX_BACKUPS_PER_GUILD} sauvegardes. Supprimez une sauvegarde existante avant d'en créer une nouvelle.`,
        ),
      ],
    });
    return;
  }

  // Générer le nom par défaut si non fourni
  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const defaultName = `${guild.name} - ${dateStr} ${timeStr}`;
  const backupName = customName || defaultName;

  // Créer le backup
  const backup = await createBackup(guild, {
    name: backupName,
    description: description ?? undefined,
    includeMessages,
    includeMembers,
    includeRoles,
    includeChannels,
    includeEmojis,
    includeStickers,
    createdByUserId: interaction.user.id,
    createdByUsername: interaction.user.username,
    createdByTag: interaction.user.discriminator ?? '0000',
  });

  await interaction.editReply({
    embeds: [
      successEmbed(
        `Sauvegarde **${backupName}** créée avec succès!\n\n` +
          `📊 Statistiques:\n` +
          `• Rôles: ${backup.rolesCount}\n` +
          `• Salons: ${backup.channelsCount}\n` +
          `• Membres: ${backup.membersCount}\n` +
          `• Messages: ${backup.messagesCount}\n` +
          `• Emojis: ${backup.emojisCount}\n` +
          `• Stickers: ${backup.stickersCount}\n` +
          `• Taille: ${(backup.sizeBytes / 1024).toFixed(2)} KB`,
      ),
    ],
  });
}

async function handleList(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const backups = await (prisma as any).serverBackup.findMany({
    where: { guildId, isPreset: false },
    orderBy: { createdAt: 'desc' },
  });

  if (backups.length === 0) {
    await interaction.editReply({
      embeds: [infoEmbed('Aucune sauvegarde trouvée. Utilisez `/backup create` pour créer une sauvegarde.')],
    });
    return;
  }

  const embed = baseEmbed(COLORS.primary, { user: interaction.user })
    .setTitle('💾 Sauvegardes du serveur')
    .setDescription(
      backups
        .map(
          (backup: any, index: number) =>
            `**${index + 1}. ${backup.name}**\n` +
            `📅 ${backup.createdAt.toLocaleDateString('fr-FR')} ${backup.createdAt.toLocaleTimeString('fr-FR')}\n` +
            `👤 Par ${backup.createdByUsername}\n` +
            `📊 ${backup.rolesCount} rôles, ${backup.channelsCount} salons, ${backup.membersCount} membres\n` +
            `🆔 \`${backup.id}\``,
        )
        .join('\n\n'),
    )
    .setFooter({ text: `${backups.length}/${MAX_BACKUPS_PER_GUILD} sauvegardes utilisées` });

  await interaction.editReply({ embeds: [embed] });
}

async function handleRestore(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const backupId = interaction.options.getString('id', true);
  const fullRestore = interaction.options.getBoolean('mode_complet') ?? false;

  const backup = await (prisma as any).serverBackup.findUnique({
    where: { id: backupId },
  });

  if (!backup) {
    await interaction.editReply({
      embeds: [errorEmbed('Sauvegarde non trouvée.')],
    });
    return;
  }

  if (backup.guildId !== guildId) {
    await interaction.editReply({
      embeds: [errorEmbed('Cette sauvegarde n\'appartient pas à ce serveur.')],
    });
    return;
  }

  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply({
      embeds: [errorEmbed('Serveur non trouvé.')],
    });
    return;
  }

  // Préparer les options de restauration
  const restoreOptions: RestoreOptions = {
    fullRestore,
    includeRoles: backup.includeRoles,
    includeChannels: backup.includeChannels,
    includeMembers: backup.includeMembers,
    includeEmojis: backup.includeEmojis,
    includeStickers: backup.includeStickers,
    includeMessages: backup.includeMessages,
    conflictResolution: 'ask',
  };

  try {
    await interaction.editReply({
      embeds: [
        infoEmbed(
          `🔄 Restauration de la sauvegarde **${backup.name}** en cours...\n\n` +
          `Mode: ${fullRestore ? 'Complet' : 'Sélectif'}\n\n` +
          `Cette opération peut prendre plusieurs minutes.`,
        ),
      ],
    });

    await restoreBackup(guild, backup.data as any, restoreOptions, interaction);

    await interaction.followUp({
      embeds: [
        successEmbed(
          `✅ Restauration terminée avec succès!\n\n` +
          `Sauvegarde: **${backup.name}**`,
        ),
      ],
    });
  } catch (error) {
    console.error('Erreur lors de la restauration:', error);
    await interaction.followUp({
      embeds: [
        errorEmbed(
          `❌ Erreur lors de la restauration: ${error instanceof Error ? error.message : 'Erreur inconnue'}`,
        ),
      ],
    });
  }
}

async function handleDelete(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const backupId = interaction.options.getString('id', true);

  const backup = await (prisma as any).serverBackup.findUnique({
    where: { id: backupId },
  });

  if (!backup) {
    await interaction.editReply({
      embeds: [errorEmbed('Sauvegarde non trouvée.')],
    });
    return;
  }

  if (backup.guildId !== guildId) {
    await interaction.editReply({
      embeds: [errorEmbed('Cette sauvegarde n\'appartient pas à ce serveur.')],
    });
    return;
  }

  await (prisma as any).serverBackup.delete({
    where: { id: backupId },
  });

  await interaction.editReply({
    embeds: [successEmbed(`Sauvegarde **${backup.name}** supprimée avec succès.`)],
  });
}

async function handleExport(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const backupId = interaction.options.getString('id', true);

  const backup = await (prisma as any).serverBackup.findUnique({
    where: { id: backupId },
  });

  if (!backup) {
    await interaction.editReply({
      embeds: [errorEmbed('Sauvegarde non trouvée.')],
    });
    return;
  }

  if (backup.guildId !== guildId) {
    await interaction.editReply({
      embeds: [errorEmbed('Cette sauvegarde n\'appartient pas à ce serveur.')],
    });
    return;
  }

  // Créer l'objet JSON à exporter
  const exportData = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    backup: {
      name: backup.name,
      description: backup.description,
      serverName: backup.serverName,
      serverIcon: backup.serverIcon,
      createdByUserId: backup.createdByUserId,
      createdByUsername: backup.createdByUsername,
      createdByTag: backup.createdByTag,
      createdAt: backup.createdAt,
      data: backup.data,
      options: {
        includeMessages: backup.includeMessages,
        includeMembers: backup.includeMembers,
        includeRoles: backup.includeRoles,
        includeChannels: backup.includeChannels,
        includeEmojis: backup.includeEmojis,
        includeStickers: backup.includeStickers,
      },
      stats: {
        rolesCount: backup.rolesCount,
        channelsCount: backup.channelsCount,
        membersCount: backup.membersCount,
        messagesCount: backup.messagesCount,
        emojisCount: backup.emojisCount,
        stickersCount: backup.stickersCount,
        sizeBytes: backup.sizeBytes,
      },
    },
  };

  // Convertir en JSON
  const jsonString = JSON.stringify(exportData, null, 2);
  const buffer = Buffer.from(jsonString, 'utf-8');

  // Vérifier la taille (limite Discord: 25MB)
  if (buffer.length > 25 * 1024 * 1024) {
    await interaction.editReply({
      embeds: [errorEmbed('La sauvegarde est trop volumineuse pour être exportée (limite Discord: 25MB).')],
    });
    return;
  }

  // Envoyer le fichier
  await interaction.editReply({
    content: `📦 Export de la sauvegarde **${backup.name}**`,
    files: [
      {
        attachment: buffer,
        name: `${backup.name.replace(/[^a-zA-Z0-9]/g, '_')}_backup.json`,
      },
    ],
  });
}

async function handleImport(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const attachment = interaction.options.getAttachment('fichier', true);
  const customName = interaction.options.getString('nom');

  if (!attachment.name.endsWith('.json')) {
    await interaction.editReply({
      embeds: [errorEmbed('Le fichier doit être au format JSON.')],
    });
    return;
  }

  // Télécharger le fichier
  let buffer: Buffer;
  try {
    const response = await fetch(attachment.url);
    buffer = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    await interaction.editReply({
      embeds: [errorEmbed('Erreur lors du téléchargement du fichier.')],
    });
    return;
  }

  // Parser le JSON
  let importData: any;
  try {
    const jsonString = buffer.toString('utf-8');
    importData = JSON.parse(jsonString);
  } catch (error) {
    await interaction.editReply({
      embeds: [errorEmbed('Le fichier JSON est invalide.')],
    });
    return;
  }

  // Valider la structure
  if (!importData.version || !importData.backup) {
    await interaction.editReply({
      embeds: [errorEmbed('Le fichier de sauvegarde a une structure invalide.')],
    });
    return;
  }

  const backupData = importData.backup;

  // Vérifier le nombre de backups existants
  const existingBackups = await (prisma as any).serverBackup.count({
    where: { guildId, isPreset: false },
  });

  if (existingBackups >= MAX_BACKUPS_PER_GUILD) {
    await interaction.editReply({
      embeds: [
        errorEmbed(
          `Vous avez atteint la limite de ${MAX_BACKUPS_PER_GUILD} sauvegardes. Supprimez une sauvegarde existante avant d'en importer une nouvelle.`,
        ),
      ],
    });
    return;
  }

  // Générer le nom du backup
  const backupName = customName || backupData.name || `Import - ${backupData.serverName || 'Serveur'} - ${new Date().toLocaleDateString('fr-FR')}`;

  try {
    // Créer le backup dans la base de données
    const newBackup = await (prisma as any).serverBackup.create({
      data: {
        guildId,
        name: backupName,
        description: backupData.description,
        data: backupData.data,
        includeMessages: backupData.options?.includeMessages ?? false,
        includeMembers: backupData.options?.includeMembers ?? true,
        includeRoles: backupData.options?.includeRoles ?? true,
        includeChannels: backupData.options?.includeChannels ?? true,
        includeEmojis: backupData.options?.includeEmojis ?? true,
        includeStickers: backupData.options?.includeStickers ?? true,
        createdByUserId: interaction.user.id,
        createdByUsername: interaction.user.username,
        createdByTag: interaction.user.discriminator ?? '0000',
        serverName: backupData.serverName || 'Importé',
        serverIcon: backupData.serverIcon,
        sizeBytes: backupData.stats?.sizeBytes || 0,
        rolesCount: backupData.stats?.rolesCount || 0,
        channelsCount: backupData.stats?.channelsCount || 0,
        membersCount: backupData.stats?.membersCount || 0,
        messagesCount: backupData.stats?.messagesCount || 0,
        emojisCount: backupData.stats?.emojisCount || 0,
        stickersCount: backupData.stats?.stickersCount || 0,
        isPreset: true,
      },
    });

    await interaction.editReply({
      embeds: [
        successEmbed(
          `✅ Sauvegarde importée avec succès!\n\n` +
          `Nom: **${backupName}**\n` +
          `Original: ${backupData.name}\n` +
          `Serveur original: ${backupData.serverName}\n\n` +
          `📊 Statistiques:\n` +
          `• Rôles: ${backupData.stats?.rolesCount || 0}\n` +
          `• Salons: ${backupData.stats?.channelsCount || 0}\n` +
          `• Membres: ${backupData.stats?.membersCount || 0}\n` +
          `• Emojis: ${backupData.stats?.emojisCount || 0}\n` +
          `• Stickers: ${backupData.stats?.stickersCount || 0}`,
        ),
      ],
    });
  } catch (error) {
    console.error('Erreur lors de l\'import:', error);
    await interaction.editReply({
      embeds: [
        errorEmbed(
          `❌ Erreur lors de l'import: ${error instanceof Error ? error.message : 'Erreur inconnue'}`,
        ),
      ],
    });
  }
}
