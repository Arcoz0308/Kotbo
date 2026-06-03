import {
  type Client,
  type APIInteractionGuildMember,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
  TextChannel,
  ChannelType,
  PermissionFlagsBits,
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
  type GuildMember,
  type Guild
} from 'discord.js';
import prisma from '../utils/db.js';
import { logger } from '../utils/logger.js';
import { COLORS, successEmbed, errorEmbed } from '../utils/embeds.js';
import { generateTranscript } from './transcriptService.js';
import { buildMemberCasePanel } from './memberCaseService.js';

function sanitizeTicketChannelName(input: string): string {
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!cleaned) return '';
  return cleaned.slice(0, 100);
}

export function buildTicketChannelName(input: string, fallbackSeed: string): string {
  const sanitizedInput = sanitizeTicketChannelName(input);
  const sanitizedFallback = sanitizeTicketChannelName(fallbackSeed) || 'ticket';
  const baseName = sanitizedInput || sanitizedFallback;
  const prefixedName = baseName.startsWith('ticket-') ? baseName : `ticket-${baseName}`;
  return prefixedName.slice(0, 100);
}

type TicketPanelTypeConfig = {
  id: string;
  label: string;
  description?: string | null;
  emoji?: string | null;
  categoryId?: string | null;
  staffRoleId?: string | null;
  buttonStyle?: 'PRIMARY' | 'SECONDARY' | 'SUCCESS' | 'DANGER';
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeTicketPanelTypes(rawTypes: unknown, fallback: {
  label: string;
  description: string;
  categoryId: string | null;
  staffRoleId: string | null;
  buttonStyle?: TicketPanelTypeConfig['buttonStyle'];
  emoji?: string | null;
}): TicketPanelTypeConfig[] {
  if (Array.isArray(rawTypes) && rawTypes.length > 0) {
    return rawTypes
      .filter(isRecord)
      .map((item, index) => {
        const buttonStyle: TicketPanelTypeConfig['buttonStyle'] = item.buttonStyle === 'SECONDARY' || item.buttonStyle === 'SUCCESS' || item.buttonStyle === 'DANGER'
          ? item.buttonStyle
          : 'PRIMARY';

        return {
          id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `ticket-type-${index + 1}`,
          label: typeof item.label === 'string' && item.label.trim() ? item.label.trim().slice(0, 80) : `Ticket ${index + 1}`,
          description: typeof item.description === 'string' ? item.description.trim().slice(0, 200) : null,
          emoji: typeof item.emoji === 'string' ? item.emoji.trim().slice(0, 16) : null,
          categoryId: typeof item.categoryId === 'string' && item.categoryId.trim() ? item.categoryId.trim() : null,
          staffRoleId: typeof item.staffRoleId === 'string' && item.staffRoleId.trim() ? item.staffRoleId.trim() : null,
          buttonStyle,
        };
      })
      .filter((item) => item.label.length > 0);
  }

  return [{
    id: 'legacy',
    label: fallback.label,
    description: fallback.description,
    emoji: fallback.emoji ?? '📩',
    categoryId: fallback.categoryId,
    staffRoleId: fallback.staffRoleId,
    buttonStyle: fallback.buttonStyle ?? 'PRIMARY',
  }];
}

function resolveTicketPanelType(guildConfig: any, typeId?: string | null): TicketPanelTypeConfig {
  const ticketTypes = normalizeTicketPanelTypes(guildConfig.ticketTypes, {
    label: guildConfig.ticketEmbedButtonText || 'Ouvrir un ticket',
    description: guildConfig.ticketEmbedDesc || 'Cliquez sur le bouton ci-dessous pour ouvrir un ticket d\'assistance.',
    categoryId: guildConfig.ticketCategoryId ?? null,
    staffRoleId: guildConfig.ticketStaffRoleId ?? null,
    emoji: '📩',
    buttonStyle: 'PRIMARY',
  });

  if (!typeId) {
    return ticketTypes[0];
  }

  return ticketTypes.find((type) => type.id === typeId) ?? ticketTypes[0];
}

function resolveButtonStyle(style?: TicketPanelTypeConfig['buttonStyle']): ButtonStyle {
  switch (style) {
    case 'SECONDARY': return ButtonStyle.Secondary;
    case 'SUCCESS': return ButtonStyle.Success;
    case 'DANGER': return ButtonStyle.Danger;
    default: return ButtonStyle.Primary;
  }
}

export async function renameTicketChannel(
  client: Client,
  ticket: { id: string; guildId: string; channelId: string | null; userId: string; username: string; reason: string; description: string },
  guildConfig: any,
  executor: { id: string; username: string },
  newName: string,
): Promise<string> {
  if (!ticket.channelId) {
    throw new Error('Ce ticket n\'a pas de salon actif à renommer.');
  }

  const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
  if (!channel || !(channel instanceof TextChannel)) {
    throw new Error('Le salon du ticket est introuvable ou n\'est pas un salon textuel.');
  }

  const finalName = buildTicketChannelName(newName, ticket.username || ticket.userId);
  await channel.setName(finalName, `Ticket renommé par ${executor.username}`);

  await logTicketEvent(client, guildConfig, 'RENAMED', ticket, executor, finalName);

  await channel.send({
    embeds: [successEmbed('Ticket renommé', `Le salon a été renommé en **#${finalName}** par <@${executor.id}>.`)],
  }).catch(() => null);

  return finalName;
}

/**
 * Checks if a member has permission to moderate/manage tickets.
 */
export function canManageTicket(member: GuildMember | APIInteractionGuildMember | null | undefined, guildConfig: any, ticketStaffRoleId?: string | null): boolean {
  if (!member) return false;

  const permissionBits = (member as GuildMember | APIInteractionGuildMember).permissions;
  const permissions = typeof permissionBits === 'string'
    ? new PermissionsBitField(BigInt(permissionBits))
    : new PermissionsBitField(permissionBits ?? 0n);
  if (permissions.has(PermissionFlagsBits.Administrator)) return true;

  const guildMemberRoles = (member as GuildMember).roles as { cache?: Map<string, unknown> } | undefined;
  const roleIds = guildMemberRoles?.cache
    ? Array.from(guildMemberRoles.cache.keys())
    : Array.isArray((member as APIInteractionGuildMember).roles)
      ? (member as APIInteractionGuildMember).roles
      : [];

  if (guildConfig.moderatorRoleId && roleIds.includes(guildConfig.moderatorRoleId)) return true;
  const effectiveTicketStaffRoleId = ticketStaffRoleId || guildConfig.ticketStaffRoleId;
  if (effectiveTicketStaffRoleId && roleIds.includes(effectiveTicketStaffRoleId)) return true;
  return false;
}

/**
 * Sends the ticket opening embed in the configured channel.
 */
export async function sendTicketSetupEmbed(client: Client, guildId: string): Promise<void> {
  const guildConfig = await prisma.guild.findUnique({ where: { id: guildId } });
  if (!guildConfig || !guildConfig.ticketChannelId) {
    throw new Error('Le salon d\'embed des tickets n\'est pas configuré.');
  }

  const channel = client.channels.cache.get(guildConfig.ticketChannelId);
  if (!channel || !(channel instanceof TextChannel)) {
    throw new Error('Le salon d\'embed des tickets est introuvable ou n\'est pas un salon textuel.');
  }

  const colorHex = guildConfig.ticketEmbedColor || '#5865F2';
  const ticketTypes = normalizeTicketPanelTypes(guildConfig.ticketTypes, {
    label: guildConfig.ticketEmbedButtonText || 'Ouvrir un ticket',
    description: guildConfig.ticketEmbedDesc || 'Cliquez sur le bouton ci-dessous pour ouvrir un ticket d\'assistance.',
    categoryId: guildConfig.ticketCategoryId ?? null,
    staffRoleId: guildConfig.ticketStaffRoleId ?? null,
    emoji: '📩',
    buttonStyle: 'PRIMARY',
  });
  
  let desc = guildConfig.ticketEmbedDesc || 'Cliquez sur le bouton ci-dessous pour ouvrir un ticket d\'assistance.';
  if (ticketTypes.length > 0) {
    desc += '\n\n**Types de tickets**\n';
    ticketTypes.forEach(t => {
      desc += `${t.emoji || '📩'} **${t.label}** — ${t.description}\n`;
    });
  }

  // Build a minimal embed: only title, description and color. No role/category details.
  const embed = new EmbedBuilder()
    .setTitle(guildConfig.ticketEmbedTitle || 'Support Technique')
    .setDescription(desc)
    .setColor(colorHex as any)
    .setTimestamp();

  const embedType = (guildConfig as any).ticketEmbedType || 'BUTTONS';

  if (embedType === 'DROPDOWN') {
    // Create dropdown menu
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('ticket:select_type')
      .setPlaceholder('Sélectionnez un type de ticket...')
      .addOptions(
        ticketTypes.map((type) => ({
          label: type.label.slice(0, 80),
          description: type.description?.slice(0, 100) || undefined,
          value: type.id,
          emoji: type.emoji || undefined,
        }))
      );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
    await channel.send({ embeds: [embed], components: [row] });
  } else {
    // Create buttons (default behavior)
    const buttons = ticketTypes.map((type) => new ButtonBuilder()
      .setCustomId(`ticket:open_modal:${type.id}`)
      .setLabel(type.label.slice(0, 80))
      .setStyle(resolveButtonStyle(type.buttonStyle))
      .setEmoji(type.emoji || '📩'));

    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    for (let index = 0; index < buttons.length; index += 5) {
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(index, index + 5)));
    }

    await channel.send({ embeds: [embed], components: rows });
  }
  logger.success('Ticket', `Embed d'ouverture envoyé avec succès dans #${channel.name} (${guildId})`);
}

/**
 * Handles select menu interactions for ticket type selection
 */
export async function handleTicketSelectMenu(client: Client, customId: string, interaction: StringSelectMenuInteraction): Promise<void> {
  const { guildId, user, member, guild } = interaction;
  if (!guildId || !guild || !member) return;

  if (customId !== 'ticket:select_type') return;

  const guildConfig = await prisma.guild.findUnique({ where: { id: guildId } });
  if (!guildConfig) {
    await interaction.reply({ content: '❌ Configuration du serveur introuvable.', flags: [MessageFlags.Ephemeral] });
    return;
  }

  const typeId = interaction.values[0];
  const ticketType = resolveTicketPanelType(guildConfig, typeId);

  // Vérifier si un ticket est déjà ouvert pour cet utilisateur
  const existing = await prisma.ticket.findFirst({
    where: {
      guildId,
      userId: user.id,
      status: { in: ['OPEN', 'CLAIMED'] }
    }
  });

  if (existing && existing.channelId) {
    const ch = guild.channels.cache.get(existing.channelId);
    if (ch) {
      await interaction.reply({
        content: `⚠️ Vous avez déjà un ticket d'ouvert : <#${existing.channelId}>. Merci de l'utiliser !`,
        flags: [MessageFlags.Ephemeral]
      });
      return;
    }
  }

  const modal = new ModalBuilder()
    .setCustomId(`modal:ticket:open:${ticketType.id}`)
    .setTitle((ticketType.label || guildConfig.ticketEmbedTitle || 'Ouvrir un ticket').substring(0, 45));

  const isSalon = ticketType.label.toLowerCase().includes('salon');

  const reasonInput = new TextInputBuilder()
    .setCustomId('reason')
    .setLabel('Sujet / Raison de la demande')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Ex : Problème avec mon grade, Plainte, etc.')
    .setRequired(true)
    .setMaxLength(100);

  if (isSalon) {
    reasonInput.setValue('Demande de salon');
  }

  const descInput = new TextInputBuilder()
    .setCustomId('description')
    .setLabel('Description détaillée')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Détaillez au maximum votre demande afin de faciliter le traitement par notre staff...')
    .setRequired(true)
    .setMaxLength(1000);

  if (isSalon) {
    descInput.setValue('Créé le pour moi');
  }

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(descInput)
  );

  await interaction.showModal(modal);
}

/**
 * Handles all button interactions starting with "ticket:"
 */
export async function handleTicketButton(client: Client, customId: string, interaction: ButtonInteraction): Promise<void> {
  const { guildId, user, member, guild } = interaction;
  if (!guildId || !guild || !member) return;

  const guildConfig = await prisma.guild.findUnique({ where: { id: guildId } });
  if (!guildConfig) {
    await interaction.reply({ content: '❌ Configuration du serveur introuvable.', flags: [MessageFlags.Ephemeral] });
    return;
  }

  // 1. Clic sur "Ouvrir un ticket" -> Afficher le modal
  if (customId === 'ticket:open_modal' || customId.startsWith('ticket:open_modal:')) {
    const typeId = customId.startsWith('ticket:open_modal:') ? customId.split(':')[2] : null;
    const ticketType = resolveTicketPanelType(guildConfig, typeId);

    // Vérifier si un ticket est déjà ouvert pour cet utilisateur
    const existing = await prisma.ticket.findFirst({
      where: {
        guildId,
        userId: user.id,
        status: { in: ['OPEN', 'CLAIMED'] }
      }
    });

    if (existing && existing.channelId) {
      const ch = guild.channels.cache.get(existing.channelId);
      if (ch) {
        await interaction.reply({
          content: `⚠️ Vous avez déjà un ticket d'ouvert : <#${existing.channelId}>. Merci de l'utiliser !`,
          flags: [MessageFlags.Ephemeral]
        });
        return;
      }
    }

    const modal = new ModalBuilder()
      .setCustomId(typeId ? `modal:ticket:open:${ticketType.id}` : 'modal:ticket:open')
      .setTitle((ticketType.label || guildConfig.ticketEmbedTitle || 'Ouvrir un ticket').substring(0, 45));

    const isSalon = ticketType.label.toLowerCase().includes('salon');

    const reasonInput = new TextInputBuilder()
      .setCustomId('reason')
      .setLabel('Sujet / Raison de la demande')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Ex : Problème avec mon grade, Plainte, etc.')
      .setRequired(true)
      .setMaxLength(100);

    if (isSalon) {
      reasonInput.setValue('Demande de salon');
    }

    const descInput = new TextInputBuilder()
      .setCustomId('description')
      .setLabel('Description détaillée')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Détaillez au maximum votre demande afin de faciliter le traitement par notre staff...')
      .setRequired(true)
      .setMaxLength(1000);

    if (isSalon) {
      descInput.setValue('Créé le pour moi');
    }

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(descInput)
    );

    await interaction.showModal(modal);
    return;
  }

  // Autres boutons requièrent de décoder l'ID
  const parts = customId.split(':');
  const action = parts[1];
  const ticketId = parts[2];

  if (!action || !ticketId) return;

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) {
    await interaction.reply({ content: '❌ Ticket introuvable en base de données.', flags: [MessageFlags.Ephemeral] });
    return;
  }

  // Helper to fetch staff level
  async function getStaffLevel(guildId: string, userId: string): Promise<number> {
    const staff = await prisma.staffMember.findUnique({
      where: { guildId_userId: { guildId, userId } }
    });
    if (!staff) return 0;
    const role = await prisma.staffRole.findFirst({
      where: { guildId, name: staff.grade, enabled: true }
    });
    return role ? role.level : 0;
  }

  // 2. Action: Claim
  if (action === 'claim') {
    if (!canManageTicket(member as GuildMember, guildConfig, ticket.staffRoleId)) {
      await interaction.reply({ content: '❌ Seuls les membres du personnel peuvent prendre en charge un ticket.', flags: [MessageFlags.Ephemeral] });
      return;
    }

    const allowOverclaim = guildConfig.ticketAllowOverclaim ?? true;
    const overclaimPermission = guildConfig.ticketOverclaimPermission || 'ANY';

    if (ticket.status === 'CLAIMED') {
      if (!allowOverclaim || overclaimPermission === 'NONE') {
        await interaction.reply({ content: `⚠️ Ce ticket est déjà pris en charge par <@${ticket.claimedById}>. La sur-revendication est désactivée.`, flags: [MessageFlags.Ephemeral] });
        return;
      }

      if (ticket.claimedById === user.id) {
        await interaction.reply({ content: `⚠️ Vous prenez déjà en charge ce ticket.`, flags: [MessageFlags.Ephemeral] });
        return;
      }

      if (overclaimPermission === 'SUPERIOR_OR_EQUAL') {
        const claimantIsAdmin = (member as GuildMember).permissions.has(PermissionFlagsBits.Administrator);
        if (!claimantIsAdmin) {
          const claimantLevel = await getStaffLevel(guildId, user.id);
          const currentLevel = ticket.claimedById ? await getStaffLevel(guildId, ticket.claimedById) : 0;

          if (claimantLevel < currentLevel) {
            await interaction.reply({
              content: `❌ Vous ne pouvez pas sur-revendiquer ce ticket car le grade de l'intervenant actuel est supérieur au vôtre.`,
              flags: [MessageFlags.Ephemeral]
            });
            return;
          }
        }
      }
    }

    await interaction.deferUpdate();

    // Mettre à jour en base de données
    const updated = await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status: 'CLAIMED',
        claimedById: user.id,
        claimedByName: user.username
      }
    });

    // Mettre à jour l'embed de bienvenue
    const ticketChannel = interaction.channel as TextChannel;
    if (ticketChannel) {
      try {
        const welcomeMessage = await ticketChannel.messages.fetch(interaction.message.id);
        const oldEmbed = welcomeMessage.embeds[0];
        if (oldEmbed) {
          const updatedEmbed = EmbedBuilder.from(oldEmbed)
            .setColor(COLORS.warning as any)
            .setDescription(`Ce ticket est actuellement pris en charge par **${user.username}**.\n\n**Auteur :** <@${ticket.userId}>\n**Raison :** ${ticket.reason}\n**Description :** ${ticket.description}`)
            .setFields([
              { name: 'Statut', value: `🛠️ Pris en charge par <@${user.id}>`, inline: true }
            ]);

          const componentsList: ButtonBuilder[] = [];
          
          if (allowOverclaim && overclaimPermission !== 'NONE') {
            componentsList.push(
              new ButtonBuilder().setCustomId(`ticket:claim:${ticketId}`).setLabel('Sur-revendiquer').setStyle(ButtonStyle.Primary).setEmoji('🛠️')
            );
          }

          componentsList.push(
            new ButtonBuilder().setCustomId(`ticket:info:${ticketId}`).setLabel('Infos Membre').setStyle(ButtonStyle.Secondary).setEmoji('🔍'),
            new ButtonBuilder().setCustomId(`ticket:close:${ticketId}`).setLabel('Fermer').setStyle(ButtonStyle.Danger).setEmoji('🔒')
          );

          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(componentsList);

          await welcomeMessage.edit({ embeds: [updatedEmbed], components: [row] });
        }
      } catch (err) {
        logger.error('Ticket', 'Error updating welcome embed:', err);
      }

      await ticketChannel.send({
        embeds: [successEmbed('Pris en charge', `Ce ticket est désormais pris en charge par <@${user.id}>.`)]
      });
    }

    // Logger
    await logTicketEvent(client, guildConfig, 'CLAIMED', ticket, user);
    return;
  }

  // 3. Action: Info / Casier de la personne
  if (action === 'info') {
    if (!canManageTicket(member as GuildMember, guildConfig, ticket.staffRoleId)) {
      await interaction.reply({ content: '❌ Permissions insuffisantes.', flags: [MessageFlags.Ephemeral] });
      return;
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    try {
      const panel = await buildMemberCasePanel(guild, ticket.userId, 'resume', 0);
      await interaction.editReply({
        embeds: [panel.embed],
        components: panel.components,
        files: panel.files
      });
    } catch (err) {
      logger.error('Ticket', 'Error building member profile card for ticket:', err);
      await interaction.editReply({ content: '❌ Impossible de générer la fiche de l\'utilisateur.' });
    }
    return;
  }

  // 4. Action: Fermer
  if (action === 'close') {
    // Le créateur ou le staff peut fermer
    const isOpener = ticket.userId === user.id;
    const isStaff = canManageTicket(member as GuildMember, guildConfig, ticket.staffRoleId);

    if (!isOpener && !isStaff) {
      await interaction.reply({ content: '❌ Vous n\'avez pas la permission de fermer ce ticket.', flags: [MessageFlags.Ephemeral] });
      return;
    }

    if (ticket.status === 'CLOSED') {
      await interaction.reply({ content: '⚠️ Le ticket est déjà fermé.', flags: [MessageFlags.Ephemeral] });
      return;
    }

    await interaction.deferUpdate();

    // Mettre à jour en BDD
    await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status: 'CLOSED',
        closedById: user.id,
        closedByName: user.username,
        closedAt: new Date()
      }
    });

    const ticketChannel = interaction.channel as TextChannel;
    if (ticketChannel) {
      // Rename channel
      await renameChannelToClosed(client, ticketChannel.id).catch(() => null);

      // Retirer les permissions d'écriture et lecture de l'opener
      try {
        await ticketChannel.permissionOverwrites.edit(ticket.userId, {
          ViewChannel: false,
          SendMessages: false
        });
      } catch (err) {
        logger.error('Ticket', 'Error removing opener permissions from closed channel:', err);
      }

      const closeEmbed = new EmbedBuilder()
        .setTitle('🔒 Ticket Fermé')
        .setDescription(`Le ticket a été fermé par <@${user.id}>.\n\nLes membres du personnel peuvent maintenant exporter la transcription ou supprimer définitivement le salon.`)
        .setColor(COLORS.danger as any)
        .setTimestamp();

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`ticket:reopen:${ticketId}`).setLabel('Réouvrir').setStyle(ButtonStyle.Success).setEmoji('🔓'),
        new ButtonBuilder().setCustomId(`ticket:delete:${ticketId}`).setLabel('Supprimer').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
      );

      await ticketChannel.send({ embeds: [closeEmbed], components: [row] });
    }

    // Logger
    await logTicketEvent(client, guildConfig, 'CLOSED', ticket, user);
    return;
  }

  // 5. Action: Réouvrir
  if (action === 'reopen') {
    if (!canManageTicket(member as GuildMember, guildConfig, ticket.staffRoleId)) {
      await interaction.reply({ content: '❌ Seuls les membres du personnel peuvent réouvrir un ticket.', flags: [MessageFlags.Ephemeral] });
      return;
    }

    await interaction.deferUpdate();

    // Mettre à jour en BDD
    await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status: 'OPEN',
        closedById: null,
        closedByName: null,
        closedAt: null
      }
    });

    const ticketChannel = interaction.channel as TextChannel;
    if (ticketChannel) {
      // Rename channel
      await renameChannelToOpen(client, ticketChannel.id).catch(() => null);

      // Restaurer les permissions de l'opener
      try {
        await ticketChannel.permissionOverwrites.edit(ticket.userId, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true
        });
      } catch (err) {
        logger.error('Ticket', 'Error restoring opener permissions:', err);
      }

      // Supprimer le message d'interaction précédent ou juste en envoyer un nouveau
      await ticketChannel.send({
        embeds: [successEmbed('Ticket Réouvert', `Le ticket a été réouvert par <@${user.id}>. Le créateur a de nouveau accès au salon.`)]
      });
    }

    // Logger
    await logTicketEvent(client, guildConfig, 'REOPENED', ticket, user);
    return;
  }

  // 6. Action: Supprimer (avec transcription obligatoire !)
  if (action === 'delete') {
    if (!canManageTicket(member as GuildMember, guildConfig, ticket.staffRoleId)) {
      await interaction.reply({ content: '❌ Seuls les membres du personnel peuvent supprimer un ticket.', flags: [MessageFlags.Ephemeral] });
      return;
    }

    const ticketChannel = interaction.channel as TextChannel;
    if (!ticketChannel) return;

    await interaction.reply({ content: '⏳ Transcription en cours et suppression imminente du salon...' });

    try {
      // 1. Générer la transcription
      const transcriptData = await generateTranscript(ticketChannel);

      // 2. Enregistrer la transcription et fermer le ticket en BDD
      await prisma.ticket.update({
        where: { id: ticketId },
        data: {
          channelId: null, // Plus de salon actif
          status: 'CLOSED',
          transcriptId: transcriptData.id
        }
      });

      // 3. Logger l'événement avec le lien de transcription
      const dashboardUrl = process.env.DASHBOARD_URL || 'http://localhost:5173';
      const publicLink = `${dashboardUrl}/transcripts/${transcriptData.id}`;
      
      await logTicketEvent(client, guildConfig, 'DELETED', ticket, user, publicLink);

      // 4. Envoyer en MP aux personnes concernées (créateur, staff claim, staff close, staff delete) sans doublons
      const usersToDm = new Set<string>();
      if (ticket.userId) usersToDm.add(ticket.userId);
      if (ticket.claimedById) usersToDm.add(ticket.claimedById);
      if (ticket.closedById) usersToDm.add(ticket.closedById);
      if (user.id) usersToDm.add(user.id);
      
      const dmEmbed = new EmbedBuilder()
        .setTitle('📄 Transcription de ticket')
        .setDescription(`Le ticket d'assistance **${ticket.reason}** du serveur **${guild.name}** a été supprimé.\n\nVoici le lien pour consulter la transcription complète :`)
        .addFields([{ name: 'Lien d\'accès', value: `🌐 [Consulter le transcript](${publicLink})` }])
        .setColor(COLORS.primary as any)
        .setTimestamp();
        
      for (const dmUserId of usersToDm) {
        try {
          const dmUser = await client.users.fetch(dmUserId);
          if (dmUser) await dmUser.send({ embeds: [dmEmbed] });
        } catch (err) {
          // Ignorer si les MPs sont bloqués
        }
      }

      // 5. Supprimer le salon Discord après 3 secondes
      setTimeout(async () => {
        try {
          await ticketChannel.delete(`Ticket supprimé par ${user.username} (Transcript ID: ${transcriptData.id})`);
        } catch (delErr) {
          logger.error('Ticket', 'Error deleting ticket channel:', delErr);
        }
      }, 3000);

    } catch (err) {
      logger.error('Ticket', 'Error deleting ticket and generating transcript:', err);
      await interaction.followUp({ content: '❌ Une erreur est survenue lors de la transcription. Suppression annulée.', flags: [MessageFlags.Ephemeral] });
    }
    return;
  }
}

/**
 * Handles all modal submissions starting with "modal:ticket:"
 */
export async function handleTicketModalSubmit(client: Client, customId: string, interaction: ModalSubmitInteraction): Promise<void> {
  const { guildId, user, guild } = interaction;
  if (!guildId || !guild) return;

  const guildConfig = await prisma.guild.findUnique({ where: { id: guildId } });
  if (!guildConfig) {
    await interaction.reply({ content: '❌ Configuration du serveur introuvable.', flags: [MessageFlags.Ephemeral] });
    return;
  }

  if (customId === 'modal:ticket:open' || customId.startsWith('modal:ticket:open:')) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const reason = interaction.fields.getTextInputValue('reason');
    const description = interaction.fields.getTextInputValue('description');
    const typeId = customId.startsWith('modal:ticket:open:') ? customId.split(':')[3] : null;
    const ticketType = resolveTicketPanelType(guildConfig, typeId);

    try {
      // 1. Créer le salon de ticket
      const ticketCategoryId = ticketType.categoryId || guildConfig.ticketCategoryId || null;
      const ticketCategory = ticketCategoryId
        ? guild.channels.cache.get(ticketCategoryId)
        : null;

      const cleanedUsername = user.username.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'membre';
      const channelName = `ticket-${cleanedUsername}`;

      const ticketStaffRoleId = ticketType.staffRoleId || guildConfig.ticketStaffRoleId || null;

      // Configurer les permissions
      const permissionOverwrites: any[] = [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.AttachFiles
          ]
        }
      ];

      // Ajouter le rôle staff si configuré
      if (ticketStaffRoleId) {
        permissionOverwrites.push({
          id: ticketStaffRoleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.AttachFiles
          ]
        });
      }

      // Ajouter le rôle modérateur général s'il existe
      if (guildConfig.moderatorRoleId) {
        permissionOverwrites.push({
          id: guildConfig.moderatorRoleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.AttachFiles
          ]
        });
      }

      // Créer le salon Discord
      const ticketChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: ticketCategory && ticketCategory.type === ChannelType.GuildCategory ? ticketCategory.id : undefined,
        topic: `Ticket de ${user.username} — Raison : ${reason}`,
        permissionOverwrites
      });

      // 2. Créer l'enregistrement en BDD
      const ticket = await prisma.ticket.create({
        data: {
          guildId,
          channelId: ticketChannel.id,
          ticketTypeId: ticketType.id,
          ticketTypeLabel: ticketType.label,
          staffRoleId: ticketStaffRoleId,
          categoryId: ticketCategoryId,
          userId: user.id,
          username: user.username,
          reason,
          description,
          status: 'OPEN'
        }
      });

      // 3. Envoyer l'embed de bienvenue et le panel dans le salon
      const staffMention = ticketStaffRoleId ? `<@&${ticketStaffRoleId}>` : null;

      const welcomeEmbed = new EmbedBuilder()
        .setTitle(`🎫 Ticket d'Assistance · ${ticketType.label}`)
        .setDescription(`Bonjour <@${user.id}> !\n${staffMention ? `Le personnel ${staffMention} va prendre en charge votre demande rapidement.` : 'Un membre du personnel va prendre en charge votre demande rapidement.'} En attendant, merci de bien détailler vos questions ou explications.\n\n**Description du problème :**\n${description}`)
        .setColor(COLORS.primary as any)
        .setTimestamp()
        .setFooter({ text: `Kotbo · Ticket ID: ${ticket.id}` });

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`ticket:claim:${ticket.id}`).setLabel('Prendre en charge').setStyle(ButtonStyle.Primary).setEmoji('🛠️'),
        new ButtonBuilder().setCustomId(`ticket:info:${ticket.id}`).setLabel('Infos Membre').setStyle(ButtonStyle.Secondary).setEmoji('🔍'),
        new ButtonBuilder().setCustomId(`ticket:close:${ticket.id}`).setLabel('Fermer').setStyle(ButtonStyle.Danger).setEmoji('🔒')
      );

      await ticketChannel.send({
        content: `${staffMention ? `${staffMention} ` : ''}<@${user.id}> 🔔 Bienvenue dans votre ticket d'assistance.`,
        embeds: [welcomeEmbed],
        components: [row]
      });

      // 4. Logger l'événement d'ouverture
      await logTicketEvent(client, guildConfig, 'OPENED', ticket, user);

      // 5. Répondre à l'interaction
      await interaction.editReply({
        content: `✅ Votre ticket a été créé avec succès : <#${ticketChannel.id}>.`
      });

    } catch (err) {
      logger.error('Ticket', 'Error creating ticket:', err);
      await interaction.editReply({
        content: '❌ Une erreur est survenue lors de l\'ouverture du ticket. Veuillez contacter un administrateur.'
      });
    }
  }
}

/**
 * Logs ticket events in the designated logs channel.
 */
async function logTicketEvent(
  client: Client,
  guildConfig: any,
  action: 'OPENED' | 'CLAIMED' | 'CLOSED' | 'REOPENED' | 'DELETED' | 'RENAMED',
  ticket: any,
  executor: any,
  transcriptLink?: string
): Promise<void> {
  if (!guildConfig.ticketLogChannelId) return;

  const logChannel = client.channels.cache.get(guildConfig.ticketLogChannelId);
  if (!logChannel || !(logChannel instanceof TextChannel)) return;

  const embed = new EmbedBuilder()
    .setTimestamp()
    .setFooter({ text: `Kotbo · Ticket ID: ${ticket.id}` });

  switch (action) {
    case 'OPENED':
      embed
        .setTitle('🎫 Nouveau Ticket Créé')
        .setDescription(`Le ticket <#${ticket.channelId}> a été ouvert.`)
        .setColor(COLORS.success as any)
        .addFields([
          { name: 'Type', value: ticket.ticketTypeLabel || ticket.ticketTypeId || 'Ticket standard', inline: true },
          { name: 'Créateur', value: `<@${ticket.userId}> (${ticket.username})`, inline: true },
          { name: 'Raison', value: ticket.reason, inline: true },
          { name: 'Description', value: ticket.description }
        ]);
      break;

    case 'CLAIMED':
      embed
        .setTitle('🛠️ Ticket Pris en Charge')
        .setDescription(`Le ticket <#${ticket.channelId}> a été pris en charge par <@${executor.id}>.`)
        .setColor(COLORS.warning as any)
        .addFields([
          { name: 'Créateur', value: `<@${ticket.userId}>`, inline: true },
          { name: 'Staff', value: `<@${executor.id}>`, inline: true }
        ]);
      break;

    case 'CLOSED':
      embed
        .setTitle('🔒 Ticket Fermé')
        .setDescription(`Le ticket <#${ticket.channelId}> a été fermé par <@${executor.id}>.`)
        .setColor(COLORS.danger as any)
        .addFields([
          { name: 'Créateur', value: `<@${ticket.userId}>`, inline: true },
          { name: 'Fermé par', value: `<@${executor.id}>`, inline: true }
        ]);
      break;

    case 'REOPENED':
      embed
        .setTitle('🔓 Ticket Réouvert')
        .setDescription(`Le ticket <#${ticket.channelId}> a été réouvert par <@${executor.id}>.`)
        .setColor(COLORS.primary as any)
        .addFields([
          { name: 'Créateur', value: `<@${ticket.userId}>`, inline: true },
          { name: 'Réouvert par', value: `<@${executor.id}>`, inline: true }
        ]);
      break;

    case 'DELETED':
      embed
        .setTitle('🗑️ Ticket Supprimé')
        .setDescription(`Le ticket ouvert par **${ticket.username}** a été définitivement supprimé par <@${executor.id}>.`)
        .setColor(0x000000)
        .addFields([
          { name: 'Créateur', value: `<@${ticket.userId}>`, inline: true },
          { name: 'Supprimé par', value: `<@${executor.id}>`, inline: true }
        ]);

      if (transcriptLink) {
        embed.addFields([{ name: 'Transcription publique', value: `🌐 [Consulter le transcript](${transcriptLink})` }]);
      }
      break;

    case 'RENAMED':
      embed
        .setTitle('✏️ Ticket Renommé')
        .setDescription(`Le ticket <#${ticket.channelId}> a été renommé en **#${transcriptLink || 'inconnu'}** par <@${executor.id}>.`)
        .setColor(COLORS.primary as any)
        .addFields([
          { name: 'Créateur', value: `<@${ticket.userId}>`, inline: true },
          { name: 'Renommé par', value: `<@${executor.id}>`, inline: true }
        ]);
      break;
  }

  try {
    await logChannel.send({ embeds: [embed] });
  } catch (err) {
    logger.error('Ticket', 'Error sending to ticket log channel:', err);
  }
}

export async function renameChannelToClosed(client: Client, channelId: string): Promise<void> {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (channel && channel instanceof TextChannel) {
    const currentName = channel.name;
    const newName = currentName.startsWith('ticket-') ? currentName.replace(/^ticket-/, 'fermer-') : `fermer-${currentName}`;
    if (newName !== currentName) {
      await channel.setName(newName, 'Ticket fermé').catch((err) => 
        logger.error('Ticket', `Error renaming channel ${channelId} to closed:`, err)
      );
    }
  }
}

export async function renameChannelToOpen(client: Client, channelId: string): Promise<void> {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (channel && channel instanceof TextChannel) {
    const currentName = channel.name;
    const newName = currentName.startsWith('fermer-') ? currentName.replace(/^fermer-/, 'ticket-') : `ticket-${currentName}`;
    if (newName !== currentName) {
      await channel.setName(newName, 'Ticket réouvert').catch((err) => 
        logger.error('Ticket', `Error renaming channel ${channelId} to open:`, err)
      );
    }
  }
}
