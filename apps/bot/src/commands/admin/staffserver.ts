import type { SlashCommandDefinition } from '../../commands.js';
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
} from 'discord.js';
import { COLORS, successEmbed, errorEmbed } from '../../utils/embeds.js';
import {
  createStaffServerLink,
  removeStaffServerLink,
  listStaffServerLinks,
  addRoleMapping,
  removeRoleMapping,
  fullSyncStaffRoles,
  autoSetupRoleMappings,
} from '../../services/staff/staffServerService.js';

const data = new SlashCommandBuilder()
  .setName('staffserver')
  .setDescription('Gérer les serveurs staff liés')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) =>
    sub
      .setName('setup')
      .setDescription('Lier un serveur staff à ce serveur principal')
      .addStringOption((opt) =>
        opt.setName('serveur-staff').setDescription('ID du serveur staff').setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName('mode')
          .setDescription('Mode de synchronisation des rôles')
          .setRequired(true)
          .addChoices(
            { name: 'Principal → Staff (hiérarchie ici, rôle simple là-bas)', value: 'MAIN_TO_STAFF' },
            { name: 'Staff → Principal (hiérarchie là-bas, rôle simple ici)', value: 'STAFF_TO_MAIN' },
            { name: 'Bidirectionnel (hiérarchie synchronisée des 2 côtés)', value: 'BIDIRECTIONAL' },
          ),
      )
      .addStringOption((opt) =>
        opt.setName('hierarchie').setDescription('ID de la hiérarchie staff (optionnel, toutes par défaut)'),
      )
      .addRoleOption((opt) =>
        opt.setName('role-staff-simple').setDescription('Rôle "Staff" simple sur le serveur sans hiérarchie'),
      )
      .addChannelOption((opt) =>
        opt
          .setName('log-principal')
          .setDescription('Salon de logs sur ce serveur')
          .addChannelTypes(ChannelType.GuildText),
      )
      .addStringOption((opt) =>
        opt.setName('log-staff').setDescription('ID du salon de logs sur le serveur staff'),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('mapping')
      .setDescription('Ajouter un mapping de rôle entre les 2 serveurs')
      .addStringOption((opt) =>
        opt.setName('link-id').setDescription('ID du lien staff-server').setRequired(true),
      )
      .addRoleOption((opt) =>
        opt.setName('role-principal').setDescription('Rôle Discord sur ce serveur'),
      )
      .addStringOption((opt) =>
        opt.setName('role-staff').setDescription('ID du rôle Discord sur le serveur staff'),
      )
      .addStringOption((opt) =>
        opt.setName('staff-role-id').setDescription('ID du StaffRole en base (optionnel)'),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('unmap')
      .setDescription('Supprimer un mapping de rôle')
      .addStringOption((opt) =>
        opt.setName('mapping-id').setDescription('ID du mapping à supprimer').setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName('list').setDescription('Lister les liens serveur staff'),
  )
  .addSubcommand((sub) =>
    sub
      .setName('sync')
      .setDescription('Forcer une synchronisation complète des rôles')
      .addStringOption((opt) =>
        opt.setName('link-id').setDescription('ID du lien à synchroniser').setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('Supprimer un lien serveur staff')
      .addStringOption((opt) =>
        opt.setName('link-id').setDescription('ID du lien à supprimer').setRequired(true),
      ),
  );

async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();
  await interaction.deferReply({ ephemeral: true });

  switch (sub) {
    case 'setup':
      return handleSetup(interaction);
    case 'mapping':
      return handleMapping(interaction);
    case 'unmap':
      return handleUnmap(interaction);
    case 'list':
      return handleList(interaction);
    case 'sync':
      return handleSync(interaction);
    case 'remove':
      return handleRemove(interaction);
  }
}

async function handleSetup(interaction: ChatInputCommandInteraction) {
  const staffGuildId = interaction.options.getString('serveur-staff', true);
  const syncMode = interaction.options.getString('mode', true) as 'MAIN_TO_STAFF' | 'STAFF_TO_MAIN' | 'BIDIRECTIONAL';
  const hierarchyId = interaction.options.getString('hierarchie') ?? undefined;
  const simpleStaffRole = interaction.options.getRole('role-staff-simple');
  const logChannel = interaction.options.getChannel('log-principal');
  const staffLogChannelId = interaction.options.getString('log-staff') ?? undefined;

  const staffGuild = interaction.client.guilds.cache.get(staffGuildId);
  if (!staffGuild) {
    await interaction.editReply({
      embeds: [errorEmbed('Erreur', 'Le bot n\'est pas présent sur le serveur staff spécifié.')],
    });
    return;
  }

  const result = await createStaffServerLink({
    mainGuildId: interaction.guildId!,
    staffGuildId,
    syncMode,
    hierarchyId,
    simpleStaffRoleId: simpleStaffRole?.id,
    mainLogChannelId: logChannel?.id,
    staffLogChannelId,
    createdByUserId: interaction.user.id,
  });

  if ('error' in result) {
    await interaction.editReply({ embeds: [errorEmbed('Erreur', result.error)] });
    return;
  }

  const syncModeLabels: Record<string, string> = {
    MAIN_TO_STAFF: 'Principal → Staff',
    STAFF_TO_MAIN: 'Staff → Principal',
    BIDIRECTIONAL: 'Bidirectionnel',
  };

  await interaction.editReply({
    embeds: [new EmbedBuilder().setColor(COLORS.warning).setDescription('⏳ Lien créé, configuration automatique des rôles en cours...')],
  });

  const roleSetup = await autoSetupRoleMappings(result, interaction.client);
  const syncResult = await fullSyncStaffRoles(result.id, interaction.client);

  const embed = successEmbed(
    '🏢 Serveur staff lié et synchronisé !',
    `**Serveur staff :** ${staffGuild.name}\n` +
    `**Mode de sync :** ${syncModeLabels[syncMode]}\n` +
    `**Hiérarchie :** ${hierarchyId || 'Toutes'}\n` +
    `**Rôle simple :** ${simpleStaffRole ? `<@&${simpleStaffRole.id}>` : 'Non configuré'}\n` +
    `**ID du lien :** \`${result.id}\`\n\n` +
    `**Rôles auto-configurés :**\n` +
    `• ${roleSetup.matched} rôle(s) existant(s) détecté(s)\n` +
    `• ${roleSetup.created} rôle(s) créé(s) sur ${staffGuild.name}\n` +
    (roleSetup.failed > 0 ? `• ⚠️ ${roleSetup.failed} échec(s)\n` : '') +
    `\n**Sync initiale :** ${syncResult.synced} action(s), ${syncResult.errors} erreur(s)`,
  );

  await interaction.editReply({ embeds: [embed] });
}

async function handleMapping(interaction: ChatInputCommandInteraction) {
  const linkId = interaction.options.getString('link-id', true);
  const mainRole = interaction.options.getRole('role-principal');
  const staffRoleId = interaction.options.getString('role-staff');
  const staffRoleDbId = interaction.options.getString('staff-role-id');

  if (!mainRole && !staffRoleId) {
    await interaction.editReply({
      embeds: [errorEmbed('Erreur', 'Spécifiez au moins un rôle (principal ou staff).')],
    });
    return;
  }

  const mapping = await addRoleMapping({
    staffServerLinkId: linkId,
    staffRoleId: staffRoleDbId ?? undefined,
    mainDiscordRoleId: mainRole?.id,
    staffDiscordRoleId: staffRoleId ?? undefined,
  });

  const embed = successEmbed(
    '🔄 Mapping ajouté',
    `**ID :** \`${mapping.id}\`\n` +
    `**Rôle principal :** ${mainRole ? `<@&${mainRole.id}>` : '*non spécifié*'}\n` +
    `**Rôle staff :** ${staffRoleId ? `\`${staffRoleId}\`` : '*non spécifié*'}\n\n` +
    `Les changements de rôle seront maintenant synchronisés automatiquement.`,
  );

  await interaction.editReply({ embeds: [embed] });
}

async function handleUnmap(interaction: ChatInputCommandInteraction) {
  const mappingId = interaction.options.getString('mapping-id', true);
  await removeRoleMapping(mappingId);

  await interaction.editReply({
    embeds: [successEmbed('🗑️ Mapping supprimé', `Le mapping \`${mappingId}\` a été supprimé.`)],
  });
}

async function handleList(interaction: ChatInputCommandInteraction) {
  const links = await listStaffServerLinks(interaction.guildId!);

  if (links.length === 0) {
    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(COLORS.info).setDescription('Aucun serveur staff lié.')],
    });
    return;
  }

  const syncModeLabels: Record<string, string> = {
    MAIN_TO_STAFF: 'Principal → Staff',
    STAFF_TO_MAIN: 'Staff → Principal',
    BIDIRECTIONAL: 'Bidirectionnel',
  };

  const lines = links.map((l) => {
    const isMain = l.mainGuildId === interaction.guildId;
    const otherGuildId = isMain ? l.staffGuildId : l.mainGuildId;
    const otherGuild = interaction.client.guilds.cache.get(otherGuildId);
    const statusIcon = l.enabled ? '🟢' : '🔴';
    const roleLabel = isMain ? 'Principal' : 'Staff';
    const mappingCount = l.roleMappings.length;

    return (
      `${statusIcon} \`${l.id.slice(0, 8)}\` **${otherGuild?.name || otherGuildId}** (${roleLabel})\n` +
      `  Mode: ${syncModeLabels[l.syncMode]} • ${mappingCount} mapping(s)`
    );
  });

  const embed = new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle('🏢 Serveurs staff liés')
    .setDescription(lines.join('\n\n'))
    .setFooter({ text: `${links.length} lien(s)` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function handleSync(interaction: ChatInputCommandInteraction) {
  const linkId = interaction.options.getString('link-id', true);

  await interaction.editReply({
    embeds: [new EmbedBuilder().setColor(COLORS.warning).setDescription('⏳ Synchronisation en cours...')],
  });

  const result = await fullSyncStaffRoles(linkId, interaction.client);

  const embed = successEmbed(
    '🔄 Synchronisation terminée',
    `**Actions effectuées :** ${result.synced}\n` +
    `**Erreurs :** ${result.errors}`,
  );

  await interaction.editReply({ embeds: [embed] });
}

async function handleRemove(interaction: ChatInputCommandInteraction) {
  const linkId = interaction.options.getString('link-id', true);
  const deleted = await removeStaffServerLink(linkId);

  if (!deleted) {
    await interaction.editReply({ embeds: [errorEmbed('Erreur', 'Lien introuvable.')] });
    return;
  }

  await interaction.editReply({
    embeds: [successEmbed('🗑️ Lien supprimé', `Le lien staff-server \`${linkId}\` a été supprimé.`)],
  });
}

export const staffserverCommand = { data, execute } satisfies SlashCommandDefinition;
