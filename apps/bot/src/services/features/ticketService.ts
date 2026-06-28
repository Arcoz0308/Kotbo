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
  ContainerBuilder,
  SeparatorSpacingSize,
  type GuildMember,
  type Guild,
  type ThreadChannel,
  Message
} from 'discord.js';
import prisma from '../../utils/db.js';
import { logger } from '../../utils/logger.js';
import { COLORS, COLORS_RAW, successEmbed, errorEmbed, v2, text, separator } from '../../utils/embeds.js';
import { resolveEmojiShortcodes } from '../../utils/emojis.js';
import { generateTranscript } from './transcriptService.js';
import { buildMemberCasePanel } from '../moderation/memberCaseService.js';
import { handleTicketTrigger } from './autoResponseService.js';

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
  mode?: 'CHANNEL' | 'DM' | 'THREAD' | null;
  anonymous?: boolean;
  staffServerRelay?: boolean;
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

        const mode = item.mode === 'CHANNEL' || item.mode === 'DM' || item.mode === 'THREAD'
          ? item.mode as 'CHANNEL' | 'DM' | 'THREAD'
          : null;

        return {
          id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `ticket-type-${index + 1}`,
          label: typeof item.label === 'string' && item.label.trim() ? item.label.trim().slice(0, 80) : `Ticket ${index + 1}`,
          description: typeof item.description === 'string' ? item.description.trim().slice(0, 200) : null,
          emoji: typeof item.emoji === 'string' ? item.emoji.trim().slice(0, 16) : null,
          categoryId: typeof item.categoryId === 'string' && item.categoryId.trim() ? item.categoryId.trim() : null,
          staffRoleId: typeof item.staffRoleId === 'string' && item.staffRoleId.trim() ? item.staffRoleId.trim() : null,
          buttonStyle,
          mode,
          anonymous: item.anonymous === true,
          staffServerRelay: item.staffServerRelay === true,
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

function resolveTicketPanelType(guildConfig: unknown, typeId?: string | null): TicketPanelTypeConfig {
  const ticketTypes = normalizeTicketPanelTypes(guildConfig.ticketTypes, {
    label: guildConfig.ticketEmbedButtonText || 'Ouvrir un ticket',
    description: guildConfig.ticketEmbedDesc || "Cliquez sur le bouton ci-dessous pour ouvrir un ticket d'assistance.",
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
  guildConfig: unknown,
  executor: { id: string; username: string },
  newName: string,
): Promise<string> {
  if (!ticket.channelId) {
    throw new Error("Ce ticket n'a pas de salon actif à renommer.");
  }

  const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
  if (!channel || !(channel instanceof TextChannel)) {
    throw new Error("Le salon du ticket est introuvable ou n'est pas un salon textuel.");
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
export function canManageTicket(member: GuildMember | APIInteractionGuildMember | null | undefined, guildConfig: unknown, ticketStaffRoleId?: string | null): boolean {
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
 * Sends the ticket opening embed in the configured channel using V2 components.
 * Buttons or dropdown are embedded directly inside the container.
 */
export async function sendTicketSetupEmbed(client: Client, guildId: string): Promise<void> {
  const guildConfig = await prisma.guild.findUnique({ where: { id: guildId } });
  if (!guildConfig || !guildConfig.ticketChannelId) {
    throw new Error("Le salon d'embed des tickets n'est pas configuré.");
  }

  const channel = client.channels.cache.get(guildConfig.ticketChannelId);
  if (!channel || !(channel instanceof TextChannel)) {
    throw new Error("Le salon d'embed des tickets est introuvable ou n'est pas un salon textuel.");
  }

  const colorHex = guildConfig.ticketEmbedColor || '#5865F2';
  const color = typeof colorHex === 'string' ? parseInt(colorHex.replace('#', ''), 16) : COLORS_RAW.primary;

  const ticketTypes = normalizeTicketPanelTypes(guildConfig.ticketTypes, {
    label: guildConfig.ticketEmbedButtonText || 'Ouvrir un ticket',
    description: guildConfig.ticketEmbedDesc || "Cliquez sur le bouton ci-dessous pour ouvrir un ticket d'assistance.",
    categoryId: guildConfig.ticketCategoryId ?? null,
    staffRoleId: guildConfig.ticketStaffRoleId ?? null,
    emoji: '📩',
    buttonStyle: 'PRIMARY',
  });

  const title = resolveEmojiShortcodes(guildConfig.ticketEmbedTitle || 'Support Technique');
  let desc = resolveEmojiShortcodes(guildConfig.ticketEmbedDesc || "Cliquez sur le bouton ci-dessous pour ouvrir un ticket d'assistance.");
  if (ticketTypes.length > 0) {
    desc += '\n\n**Types de tickets**\n';
    ticketTypes.forEach(t => {
      desc += `${t.emoji || '📩'} **${t.label}** — ${t.description}\n`;
    });
  }

  const container = new ContainerBuilder().setAccentColor(color);
  container.addTextDisplayComponents(text(`### ${title}`));
  container.addTextDisplayComponents(text(desc));
  container.addSeparatorComponents(separator(true, SeparatorSpacingSize.Small));

  const embedType = guildConfig.ticketEmbedType || 'BUTTONS';

  if (embedType === 'DROPDOWN') {
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

    container.addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu)
    );
  } else {
    const buttons = ticketTypes.map((type) => new ButtonBuilder()
      .setCustomId(`ticket:open_modal:${type.id}`)
      .setLabel(type.label.slice(0, 80))
      .setStyle(resolveButtonStyle(type.buttonStyle))
      .setEmoji(type.emoji || '📩'));

    for (let index = 0; index < buttons.length; index += 5) {
      container.addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(index, index + 5))
      );
    }
  }

  container.addSeparatorComponents(separator(false, SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(text('-# Kotbo • Système de tickets'));

  await channel.send(v2(container));
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
    const _updated = await prisma.ticket.update({
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
            .setColor(COLORS.warning as unknown)
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
      await interaction.editReply({ content: "❌ Impossible de générer la fiche de l'utilisateur." });
    }
    return;
  }

  // 4. Action: Fermer
  if (action === 'close') {
    // Le créateur ou le staff peut fermer
    const isOpener = ticket.userId === user.id;
    const isStaff = canManageTicket(member as GuildMember, guildConfig, ticket.staffRoleId);

    if (!isOpener && !isStaff) {
      await interaction.reply({ content: "❌ Vous n'avez pas la permission de fermer ce ticket.", flags: [MessageFlags.Ephemeral] });
      return;
    }

    if (ticket.status === 'CLOSED') {
      await interaction.reply({ content: '⚠️ Le ticket est déjà fermé.', flags: [MessageFlags.Ephemeral] });
      return;
    }

    await interaction.deferUpdate();
    await closeTicket(client, ticketId, user.id, user.username);
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
        .addFields([{ name: "Lien d'accès", value: `🌐 [Consulter le transcript](${publicLink})` }])
        .setColor(COLORS.primary as unknown)
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
  // ─── DM direct ticket (from /ticket open in DM) ──────────
  if (customId.startsWith('modal:ticket:open:dm_direct:')) {
    const targetGuildId = customId.split(':')[4];
    return handleDmDirectTicket(client, interaction, targetGuildId);
  }

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
    const ticketMode = ticketType.mode || (guildConfig as any).ticketMode || 'CHANNEL';
    const isAnonymous = ticketType.anonymous === true && ticketMode === 'DM';
    const useStaffServerRelay = ticketType.staffServerRelay === true;

    try {
      const ticketStaffRoleId = ticketType.staffRoleId || guildConfig.ticketStaffRoleId || null;
      const staffMention = ticketStaffRoleId ? `<@&${ticketStaffRoleId}>` : null;

      if (ticketMode === 'DM') {
        // ─── Mode DM : ticket via messages privés ───────────────────────
        let relayChannel: TextChannel | null = null;
        let staffServerGuildId: string | null = null;

        if (useStaffServerRelay) {
          const staffLink = await prisma.staffServerLink.findFirst({
            where: { mainGuildId: guildId, enabled: true },
          });
          if (staffLink) {
            staffServerGuildId = staffLink.staffGuildId;
            const staffGuild = client.guilds.cache.get(staffLink.staffGuildId);
            const logChannelId = staffLink.staffLogChannelId;
            if (logChannelId && staffGuild) {
              const ch = staffGuild.channels.cache.get(logChannelId);
              if (ch instanceof TextChannel) relayChannel = ch;
            }
            if (!relayChannel && staffGuild) {
              const fallback = staffGuild.channels.cache.find(
                (c) => c instanceof TextChannel && c.name.includes('ticket'),
              );
              if (fallback instanceof TextChannel) relayChannel = fallback;
            }
          }
        }

        if (!relayChannel) {
          const relayChannelId = (guildConfig as any).ticketDmRelayChannelId || guildConfig.ticketLogChannelId;
          const fetched = relayChannelId ? await client.channels.fetch(relayChannelId).catch(() => null) : null;
          if (fetched instanceof TextChannel) relayChannel = fetched;
        }

        if (!relayChannel) {
          await interaction.editReply({ content: '❌ Aucun salon de relais configuré pour le mode MP. Contactez un administrateur.' });
          return;
        }

        const displayName = isAnonymous ? 'Membre Anonyme' : user.username;

        const ticket = await prisma.ticket.create({
          data: {
            guildId,
            mode: 'DM',
            ticketTypeId: ticketType.id,
            ticketTypeLabel: ticketType.label,
            staffRoleId: ticketStaffRoleId,
            categoryId: null,
            userId: user.id,
            username: user.username,
            reason,
            description,
            status: 'OPEN',
            isAnonymous,
            staffServerGuildId,
          }
        });

        const threadName = isAnonymous
          ? `🎫 Anonyme — ${reason}`.slice(0, 100)
          : `🎫 ${user.username} — ${reason}`.slice(0, 100);

        const thread = await relayChannel.threads.create({
          name: threadName,
          autoArchiveDuration: 10080,
          reason: `Ticket DM de ${displayName}`
        });

        await prisma.ticket.update({ where: { id: ticket.id }, data: { threadId: thread.id } });

        const creatorLine = isAnonymous
          ? '**Créateur :** Anonyme (identité masquée)'
          : `**Créateur :** <@${user.id}> (${user.username})`;

        const staffEmbed = new EmbedBuilder()
          .setTitle(`🎫 Nouveau Ticket MP · ${ticketType.label}`)
          .setDescription(`${creatorLine}\n**Raison :** ${reason}\n\n**Description :**\n${description}\n\n> Les messages envoyés ici seront relayés en MP à l'utilisateur.`)
          .setColor(COLORS.primary as any)
          .setTimestamp()
          .setFooter({ text: `Kotbo · Ticket ID: ${ticket.id}` });

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`ticket:claim:${ticket.id}`).setLabel('Prendre en charge').setStyle(ButtonStyle.Primary).setEmoji('🛠️'),
          new ButtonBuilder().setCustomId(`ticket:info:${ticket.id}`).setLabel('Infos Membre').setStyle(ButtonStyle.Secondary).setEmoji('🔍'),
          new ButtonBuilder().setCustomId(`ticket:close:${ticket.id}`).setLabel('Fermer').setStyle(ButtonStyle.Danger).setEmoji('🔒')
        );

        await thread.send({
          content: staffMention ? `${staffMention} 🔔 Nouveau ticket en MP.` : '🔔 Nouveau ticket en MP.',
          embeds: [staffEmbed],
          components: [row]
        });

        const dmEmbed = new EmbedBuilder()
          .setTitle(`🎫 Ticket ouvert · ${guild.name}`)
          .setDescription(`Votre ticket d'assistance a bien été créé !\nLe personnel va prendre en charge votre demande. **Répondez directement ici** pour communiquer avec le staff.\n\n**Raison :** ${reason}\n**Description :** ${description}`)
          .setColor(COLORS.primary as unknown)
          .setTimestamp()
          .setFooter({ text: `Kotbo · Ticket ID: ${ticket.id}` });

        try {
          const dmUser = await client.users.fetch(user.id);
          await dmUser.send({ embeds: [dmEmbed] });
        } catch {
          await thread.send({ embeds: [errorEmbed('MP bloqués', `<@${user.id}> a ses messages privés désactivés. Le ticket ne pourra pas fonctionner en mode MP.`)] });
        }

        await logTicketEvent(client, guildConfig, 'OPENED', ticket, user);
        await handleTicketTrigger(guildId, user.id, ticketType.id, reason, description, client, ticket.id);
        await interaction.editReply({ content: `✅ Votre ticket a été créé ! Consultez vos messages privés pour communiquer avec le staff.` });

      } else if (ticketMode === 'THREAD') {
        // ─── Mode Thread : ticket dans un fil de discussion ─────────────
        const parentChannelId = guildConfig.ticketChannelId || guildConfig.ticketLogChannelId;
        const parentChannel = parentChannelId ? await client.channels.fetch(parentChannelId).catch(() => null) : null;

        if (!parentChannel || !(parentChannel instanceof TextChannel)) {
          await interaction.editReply({ content: '❌ Aucun salon configuré pour le mode Thread. Contactez un administrateur.' });
          return;
        }

        const ticket = await prisma.ticket.create({
          data: {
            guildId,
            mode: 'THREAD',
            ticketTypeId: ticketType.id,
            ticketTypeLabel: ticketType.label,
            staffRoleId: ticketStaffRoleId,
            categoryId: null,
            userId: user.id,
            username: user.username,
            reason,
            description,
            status: 'OPEN'
          }
        });

        const thread = await parentChannel.threads.create({
          name: `🎫 ${user.username} — ${reason}`.slice(0, 100),
          autoArchiveDuration: 10080,
          type: ChannelType.PrivateThread,
          reason: `Ticket Thread de ${user.username}`
        });

        await thread.members.add(user.id).catch(() => null);

        await prisma.ticket.update({ where: { id: ticket.id }, data: { threadId: thread.id, channelId: thread.id } });

        const welcomeEmbed = new EmbedBuilder()
          .setTitle(`🎫 Ticket d'Assistance · ${ticketType.label}`)
          .setDescription(`Bonjour <@${user.id}> !\n${staffMention ? `Le personnel ${staffMention} va prendre en charge votre demande rapidement.` : 'Un membre du personnel va prendre en charge votre demande rapidement.'}\n\n**Description du problème :**\n${description}`)
          .setColor(COLORS.primary as unknown)
          .setTimestamp()
          .setFooter({ text: `Kotbo · Ticket ID: ${ticket.id}` });

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`ticket:claim:${ticket.id}`).setLabel('Prendre en charge').setStyle(ButtonStyle.Primary).setEmoji('🛠️'),
          new ButtonBuilder().setCustomId(`ticket:info:${ticket.id}`).setLabel('Infos Membre').setStyle(ButtonStyle.Secondary).setEmoji('🔍'),
          new ButtonBuilder().setCustomId(`ticket:close:${ticket.id}`).setLabel('Fermer').setStyle(ButtonStyle.Danger).setEmoji('🔒')
        );

        await thread.send({
          content: `${staffMention ? `${staffMention} ` : ''}<@${user.id}> 🔔 Bienvenue dans votre ticket d'assistance.`,
          embeds: [welcomeEmbed],
          components: [row]
        });

        await logTicketEvent(client, guildConfig, 'OPENED', ticket, user);
        await handleTicketTrigger(guildId, user.id, ticketType.id, reason, description, client, ticket.id);
        await interaction.editReply({ content: `✅ Votre ticket a été créé : <#${thread.id}>.` });

      } else {
        // ─── Mode CHANNEL (défaut) : créer un salon texte ───────────────
        const ticketCategoryId = ticketType.categoryId || guildConfig.ticketCategoryId || null;
        const ticketCategory = ticketCategoryId
          ? guild.channels.cache.get(ticketCategoryId)
          : null;

        const cleanedUsername = user.username.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'membre';
        const channelName = `ticket-${cleanedUsername}`;

        const permissionOverwrites: unknown[] = [
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

        const ticketChannel = await guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: ticketCategory && ticketCategory.type === ChannelType.GuildCategory ? ticketCategory.id : undefined,
          topic: `Ticket de ${user.username} — Raison : ${reason}`,
          permissionOverwrites
        });

        const ticket = await prisma.ticket.create({
          data: {
            guildId,
            channelId: ticketChannel.id,
            mode: 'CHANNEL',
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

        const welcomeEmbed = new EmbedBuilder()
          .setTitle(`🎫 Ticket d'Assistance · ${ticketType.label}`)
          .setDescription(`Bonjour <@${user.id}> !\n${staffMention ? `Le personnel ${staffMention} va prendre en charge votre demande rapidement.` : 'Un membre du personnel va prendre en charge votre demande rapidement.'} En attendant, merci de bien détailler vos questions ou explications.\n\n**Description du problème :**\n${description}`)
          .setColor(COLORS.primary as unknown)
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

        await logTicketEvent(client, guildConfig, 'OPENED', ticket, user);
        await handleTicketTrigger(guildId, user.id, ticketType.id, reason, description, client, ticket.id);
        await interaction.editReply({ content: `✅ Votre ticket a été créé avec succès : <#${ticketChannel.id}>.` });
      }

    } catch (err) {
      logger.error('Ticket', 'Error creating ticket:', err);
      await interaction.editReply({
        content: "❌ Une erreur est survenue lors de l'ouverture du ticket. Veuillez contacter un administrateur."
      });
    }
  }
}

/**
 * Creates a DM ticket from /ticket open in DMs.
 */
async function handleDmDirectTicket(
  client: Client,
  interaction: ModalSubmitInteraction,
  targetGuildId: string,
): Promise<void> {
  const user = interaction.user;

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const guildConfig = await prisma.guild.findUnique({ where: { id: targetGuildId } });
  if (!guildConfig) {
    await interaction.editReply({ content: '❌ Ce serveur n\'est pas configuré.' });
    return;
  }

  const guild = client.guilds.cache.get(targetGuildId);
  if (!guild) {
    await interaction.editReply({ content: '❌ Le bot n\'est pas présent sur ce serveur.' });
    return;
  }

  const existingTicket = await prisma.ticket.findFirst({
    where: { guildId: targetGuildId, userId: user.id, status: { in: ['OPEN', 'CLAIMED'] } },
  });
  if (existingTicket) {
    await interaction.editReply({ content: `⚠️ Vous avez déjà un ticket ouvert sur **${guild.name}**.` });
    return;
  }

  const reason = interaction.fields.getTextInputValue('reason');
  const description = interaction.fields.getTextInputValue('description');

  const ticketStaffRoleId = guildConfig.ticketStaffRoleId || null;
  const staffMention = ticketStaffRoleId ? `<@&${ticketStaffRoleId}>` : null;

  let relayChannel: TextChannel | null = null;
  let staffServerGuildId: string | null = null;

  const staffLink = await prisma.staffServerLink.findFirst({
    where: { mainGuildId: targetGuildId, enabled: true },
  });
  if (staffLink) {
    staffServerGuildId = staffLink.staffGuildId;
    const staffGuild = client.guilds.cache.get(staffLink.staffGuildId);
    if (staffLink.staffLogChannelId && staffGuild) {
      const ch = staffGuild.channels.cache.get(staffLink.staffLogChannelId);
      if (ch instanceof TextChannel) relayChannel = ch;
    }
  }

  if (!relayChannel) {
    const relayChannelId = (guildConfig as any).ticketDmRelayChannelId || guildConfig.ticketLogChannelId;
    if (relayChannelId) {
      const fetched = await client.channels.fetch(relayChannelId).catch(() => null);
      if (fetched instanceof TextChannel) relayChannel = fetched;
    }
  }

  if (!relayChannel) {
    await interaction.editReply({ content: '❌ Aucun salon de relais configuré sur ce serveur.' });
    return;
  }

  const ticket = await prisma.ticket.create({
    data: {
      guildId: targetGuildId,
      mode: 'DM',
      ticketTypeId: null,
      ticketTypeLabel: 'MP Direct',
      staffRoleId: ticketStaffRoleId,
      categoryId: null,
      userId: user.id,
      username: user.username,
      reason,
      description,
      status: 'OPEN',
      staffServerGuildId,
    },
  });

  const thread = await relayChannel.threads.create({
    name: `🎫 ${user.username} — ${reason}`.slice(0, 100),
    autoArchiveDuration: 10080,
    reason: `Ticket DM direct de ${user.username}`,
  });

  await prisma.ticket.update({ where: { id: ticket.id }, data: { threadId: thread.id } });

  const staffEmbed = new EmbedBuilder()
    .setTitle(`🎫 Nouveau Ticket MP · MP Direct`)
    .setDescription(
      `**Créateur :** <@${user.id}> (${user.username})\n` +
      `**Raison :** ${reason}\n\n` +
      `**Description :**\n${description}\n\n` +
      `> Les messages envoyés ici seront relayés en MP à l'utilisateur.`,
    )
    .setColor(COLORS.primary as any)
    .setTimestamp()
    .setFooter({ text: `Kotbo · Ticket ID: ${ticket.id}` });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`ticket:claim:${ticket.id}`).setLabel('Prendre en charge').setStyle(ButtonStyle.Primary).setEmoji('🛠️'),
    new ButtonBuilder().setCustomId(`ticket:info:${ticket.id}`).setLabel('Infos Membre').setStyle(ButtonStyle.Secondary).setEmoji('🔍'),
    new ButtonBuilder().setCustomId(`ticket:close:${ticket.id}`).setLabel('Fermer').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
  );

  await thread.send({
    content: staffMention ? `${staffMention} 🔔 Nouveau ticket en MP.` : '🔔 Nouveau ticket en MP.',
    embeds: [staffEmbed],
    components: [row],
  });

  const dmEmbed = new EmbedBuilder()
    .setTitle(`🎫 Ticket ouvert · ${guild.name}`)
    .setDescription(
      `Votre ticket d'assistance a bien été créé !\n` +
      `Le personnel va prendre en charge votre demande. **Répondez directement ici** pour communiquer avec le staff.\n\n` +
      `**Raison :** ${reason}\n**Description :** ${description}`,
    )
    .setColor(COLORS.primary as any)
    .setTimestamp()
    .setFooter({ text: `Kotbo · Ticket ID: ${ticket.id}` });

  try {
    await user.send({ embeds: [dmEmbed] });
  } catch {
    await thread.send({
      embeds: [errorEmbed('MP bloqués', `<@${user.id}> a ses messages privés désactivés.`)],
    });
  }

  await logTicketEvent(client, guildConfig, 'OPENED', ticket, user);
  await handleTicketTrigger(targetGuildId, user.id, null, reason, description, client, ticket.id);
  await interaction.editReply({ content: `✅ Votre ticket a été créé sur **${guild.name}** ! Consultez vos messages privés.` });
}

/**
 * Relays a DM message from a ticket creator to the staff thread.
 */
export async function relayDmToThread(client: Client, message: Message): Promise<void> {
  if (message.author.bot || message.guild) return;

  const ticket = await prisma.ticket.findFirst({
    where: {
      userId: message.author.id,
      mode: 'DM',
      status: { in: ['OPEN', 'CLAIMED'] },
      threadId: { not: null }
    },
    orderBy: { createdAt: 'desc' }
  });
  if (!ticket || !ticket.threadId) return;

  try {
    const thread = await client.channels.fetch(ticket.threadId).catch(() => null);
    if (!thread || !thread.isThread()) return;

    const authorName = ticket.isAnonymous ? 'Membre Anonyme' : message.author.username;
    const authorIcon = ticket.isAnonymous ? undefined : message.author.displayAvatarURL();

    const relayEmbed = new EmbedBuilder()
      .setAuthor({ name: authorName, ...(authorIcon ? { iconURL: authorIcon } : {}) })
      .setDescription(message.content || '*Pièce jointe*')
      .setColor(COLORS.primary as any)
      .setTimestamp();

    const files = message.attachments.map(a => a.url);
    await (thread as ThreadChannel).send({ embeds: [relayEmbed], files });

    await message.react('✅').catch(() => null);
  } catch (err) {
    logger.error('Ticket', 'Error relaying DM to thread:', err);
  }
}

/**
 * Relays a staff thread message to the DM ticket creator.
 */
export async function relayThreadToDm(client: Client, message: Message): Promise<void> {
  if (message.author.bot || !message.channel.isThread()) return;

  const ticket = await prisma.ticket.findFirst({
    where: {
      threadId: message.channel.id,
      mode: 'DM',
      status: { in: ['OPEN', 'CLAIMED'] }
    }
  });
  if (!ticket) return;

  try {
    const dmUser = await client.users.fetch(ticket.userId);
    if (!dmUser) return;

    const _guildConfig = await prisma.guild.findUnique({ where: { id: ticket.guildId } });
    const guildName = client.guilds.cache.get(ticket.guildId)?.name || 'Serveur';

    const relayEmbed = new EmbedBuilder()
      .setAuthor({ name: `${message.author.username} · ${guildName}`, iconURL: message.author.displayAvatarURL() })
      .setDescription(message.content || '*Pièce jointe*')
      .setColor(COLORS.primary as unknown)
      .setTimestamp()
      .setFooter({ text: `Ticket: ${ticket.reason}` });

    const files = message.attachments.map(a => a.url);
    await dmUser.send({ embeds: [relayEmbed], files });
  } catch (err) {
    logger.error('Ticket', 'Error relaying thread to DM:', err);
  }
}

/**
 * Logs ticket events in the designated logs channel.
 */
async function logTicketEvent(
  client: Client,
  guildConfig: unknown,
  action: 'OPENED' | 'CLAIMED' | 'CLOSED' | 'REOPENED' | 'DELETED' | 'RENAMED',
  ticket: unknown,
  executor: unknown,
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
        .setColor(COLORS.success as unknown)
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
        .setColor(COLORS.warning as unknown)
        .addFields([
          { name: 'Créateur', value: `<@${ticket.userId}>`, inline: true },
          { name: 'Staff', value: `<@${executor.id}>`, inline: true }
        ]);
      break;

    case 'CLOSED':
      embed
        .setTitle('🔒 Ticket Fermé')
        .setDescription(`Le ticket <#${ticket.channelId}> a été fermé par <@${executor.id}>.`)
        .setColor(COLORS.danger as unknown)
        .addFields([
          { name: 'Créateur', value: `<@${ticket.userId}>`, inline: true },
          { name: 'Fermé par', value: `<@${executor.id}>`, inline: true }
        ]);
      break;

    case 'REOPENED':
      embed
        .setTitle('🔓 Ticket Réouvert')
        .setDescription(`Le ticket <#${ticket.channelId}> a été réouvert par <@${executor.id}>.`)
        .setColor(COLORS.primary as unknown)
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
        .setColor(COLORS.primary as unknown)
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

export async function closeTicket(
  client: Client,
  ticketId: string,
  closedByUserId: string,
  closedByUsername: string
): Promise<void> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId }
  });
  if (!ticket || ticket.status === 'CLOSED') return;

  const guildConfig = await prisma.guild.findUnique({
    where: { id: ticket.guildId }
  });
  if (!guildConfig) return;

  // Mettre à jour en BDD
  const updatedTicket = await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      status: 'CLOSED',
      closedById: closedByUserId,
      closedByName: closedByUsername,
      closedAt: new Date()
    }
  });

  const channelId = ticket.channelId || ticket.threadId;
  if (channelId) {
    const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
    if (channel && (channel instanceof TextChannel || channel.isThread())) {
      const ticketChannel = channel as TextChannel;
      // Rename channel
      await renameChannelToClosed(client, ticketChannel.id).catch(() => null);

      // Retirer les permissions d'écriture et lecture de l'opener
      try {
        if (ticketChannel.permissionOverwrites && typeof ticketChannel.permissionOverwrites.edit === 'function') {
          await ticketChannel.permissionOverwrites.edit(ticket.userId, {
            ViewChannel: false,
            SendMessages: false
          });
        }
      } catch (err) {
        logger.error('Ticket', 'Error removing opener permissions from closed channel:', err);
      }

      const closeEmbed = new EmbedBuilder()
        .setTitle('🔒 Ticket Fermé')
        .setDescription(`Le ticket a été fermé par <@${closedByUserId}>.\n\nLes membres du personnel peuvent maintenant exporter la transcription ou supprimer définitivement le salon.`)
        .setColor(COLORS.danger as unknown)
        .setTimestamp();

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`ticket:reopen:${ticketId}`).setLabel('Réouvrir').setStyle(ButtonStyle.Success).setEmoji('🔓'),
        new ButtonBuilder().setCustomId(`ticket:delete:${ticketId}`).setLabel('Supprimer').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
      );

      await ticketChannel.send({ embeds: [closeEmbed], components: [row] }).catch(() => null);
    }
  }

  // Logger
  await logTicketEvent(client, guildConfig, 'CLOSED', updatedTicket, { id: closedByUserId, username: closedByUsername });

  // Satisfaction survey
  try {
    const { sendSatisfactionSurvey } = await import('./ticketSatisfactionService.js');
    await sendSatisfactionSurvey(client, ticket.guildId, ticketId, ticket.userId, ticket.claimedById ?? undefined);
  } catch (err) {
    logger.error('Ticket', 'Erreur envoi sondage satisfaction:', err);
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

/**
 * Checks open tickets for inactivity and sends automated warnings if configured.
 */
export async function checkTicketInactivity(client: Client): Promise<void> {
  try {
    const guilds = await prisma.guild.findMany({
      where: { ticketInactivityEnabled: true },
      select: {
        id: true,
        ticketInactivityHours: true,
        ticketInactivityMessage: true,
      },
    });

    for (const guildConfig of guilds) {
      const activeTickets = await prisma.ticket.findMany({
        where: {
          guildId: guildConfig.id,
          status: { in: ['OPEN', 'CLAIMED'] },
          channelId: { not: null },
          inactivityAlertSent: false,
        },
      });

      const inactivityTimeMs = guildConfig.ticketInactivityHours * 60 * 60 * 1000;

      for (const ticket of activeTickets) {
        if (!ticket.channelId) continue;

        const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
        if (!channel || !(channel instanceof TextChannel)) continue;

        const messages = await channel.messages.fetch({ limit: 1 }).catch(() => null);
        const lastMessage = messages?.first();

        let lastActivityTimestamp = ticket.createdAt.getTime();
        let shouldAlert = false;

        if (lastMessage) {
          // Si le dernier message a été envoyé par le créateur, on n'alerte pas
          if (lastMessage.author.id === ticket.userId) {
            continue;
          }
          lastActivityTimestamp = lastMessage.createdTimestamp;
        }

        if (Date.now() - lastActivityTimestamp > inactivityTimeMs) {
          shouldAlert = true;
        }

        if (shouldAlert) {
          // Formater le message d'inactivité
          const userMention = `<@${ticket.userId}>`;
          const rawMessage = guildConfig.ticketInactivityMessage || "Bonjour {user}, votre ticket est inactif depuis un moment. N'hésitez pas à y répondre si vous avez toujours besoin d'aide !";
          const formattedMessage = rawMessage.replace(/{user}/g, userMention);

          await channel.send({ content: formattedMessage }).catch(() => null);

          await prisma.ticket.update({
            where: { id: ticket.id },
            data: { inactivityAlertSent: true },
          });

          logger.info('Ticket', `Alerte d'inactivité envoyée dans le ticket ${ticket.id} (${ticket.channelId})`);
        }
      }
    }
  } catch (err) {
    logger.error('Ticket', "Erreur lors de la vérification de l'inactivité des tickets:", err);
  }
}
