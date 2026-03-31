import {
  type Interaction,
  type Client,
  TextChannel,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalSubmitInteraction,
  MessageFlags,
  type ButtonInteraction,
  type ColorResolvable,
  type AnySelectMenuInteraction,
} from 'discord.js';
import prisma from '../utils/db.js';
import { logger } from '../utils/logger.js';
import { COLORS, errorEmbed, successEmbed, feedStatusEmoji, truncate } from '../utils/embeds.js';
import { sendConfigPanel, sendFeedsPanel, buildAddFeedModal, sendRoleSelectionPanel, sendChannelSelectionPanel, sendDigestPanel, sendDigestRoleSelectionPanel, buildDigestModal, sendYouTubeConfigPanel, sendYouTubeRoleSelectionPanel } from '../panels/configPanel.js';
import { sendApprovedItem } from '../services/notificationService.js';
import { sendDMSubscribePanel } from '../services/notificationService.js';
import { translate } from '../services/translationService.js';
import { PermissionFlagsBits, type GuildMember } from 'discord.js';
import { extractKeywords } from '../utils/keywords.js';
import {
  createSession,
  getSession,
  deleteSession,
  advanceSession,
  sessionKey,
  type KeywordSession,
} from './keywordSessionStore.js';

async function canModerate(member: GuildMember | null, guildId: string): Promise<boolean> {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;

  const guild = await prisma.guild.findUnique({ where: { id: guildId } });
  if (guild?.moderatorRoleId && member.roles.cache.has(guild.moderatorRoleId)) {
    return true;
  }

  return false;
}

export async function handleButton(interaction: Interaction, client: Client): Promise<void> {
  if (!interaction.isButton()) return;

  const { customId, guildId, user } = interaction;
  if (!guildId) return;

  // ── Config Panel Buttons ─────────────────────────────────────────────────

  if (customId === 'config:feeds') {
    await sendFeedsPanel(client, guildId, interaction);
    return;
  }

  if (customId === 'config:back' || customId === 'config:refresh') {
    await sendConfigPanel(client, guildId, interaction);
    return;
  }

  if (customId === 'config:feed:add') {
    await interaction.showModal(buildAddFeedModal());
    return;
  }

  if (customId === 'config:youtube_panel') {
    await sendYouTubeConfigPanel(client, guildId, interaction);
    return;
  }

  if (customId === 'config:youtube_toggle') {
    const guild = await prisma.guild.findUnique({ where: { id: guildId } });
    if (!guild) return;

    await prisma.guild.update({
      where: { id: guildId },
      data: { youtubeEnabled: !guild.youtubeEnabled },
    });
    
    await sendYouTubeConfigPanel(client, guildId, interaction);
    return;
  }

  if (customId === 'config:yt_role_short') {
    await sendYouTubeRoleSelectionPanel(client, guildId, interaction, 'short');
    return;
  }

  if (customId === 'config:yt_role_video') {
    await sendYouTubeRoleSelectionPanel(client, guildId, interaction, 'video');
    return;
  }

  if (customId === 'config:reset_yt_short_role') {
    await prisma.guild.update({ where: { id: guildId }, data: { youtubeShortRoleId: null } });
    await sendYouTubeConfigPanel(client, guildId, interaction);
    return;
  }

  if (customId === 'config:reset_yt_video_role') {
    await prisma.guild.update({ where: { id: guildId }, data: { youtubeVideoRoleId: null } });
    await sendYouTubeConfigPanel(client, guildId, interaction);
    return;
  }

  if (customId === 'config:digest') {
    await sendDigestPanel(client, guildId, interaction);
    return;
  }

  if (customId === 'config:digest:panel') {
    await sendDigestPanel(client, guildId, interaction);
    return;
  }

  if (customId === 'config:digest:toggle') {
    const guild = await prisma.guild.findUnique({ where: { id: guildId } });
    if (!guild) return;
    await prisma.guild.update({
      where: { id: guildId },
      data: { digestEnabled: !guild.digestEnabled },
    });
    await sendDigestPanel(client, guildId, interaction);
    return;
  }

  if (customId === 'config:digest:freq') {
    const guild = await prisma.guild.findUnique({ where: { id: guildId } });
    if (!guild) return;
    const currentFreq = (guild as any).digestFrequency;
    await prisma.guild.update({
      where: { id: guildId },
      data: { digestFrequency: currentFreq === 'DAILY' ? 'WEEKLY' : 'DAILY' } as any,
    });
    await sendDigestPanel(client, guildId, interaction);
    return;
  }

  if (customId === 'config:digest:text') {
    const guild = await prisma.guild.findUnique({ where: { id: guildId } });
    await interaction.showModal(buildDigestModal(guild));
    return;
  }

  if (customId === 'config:digest:role') {
    await sendDigestRoleSelectionPanel(client, guildId, interaction);
    return;
  }

  if (customId === 'config:digest:reset_role') {
    await prisma.guild.update({ where: { id: guildId }, data: { digestRoleId: null } as any });
    await sendDigestPanel(client, guildId, interaction);
    return;
  }

  if (customId === 'config:translation') {
    const guild = await prisma.guild.findUnique({ where: { id: guildId } });
    if (!guild) return;
    await prisma.guild.update({ where: { id: guildId }, data: { translationEnabled: !guild.translationEnabled } });
    await sendConfigPanel(client, guildId, interaction);
    return;
  }

  if (customId === 'config:channels') {
    await interaction.reply({
      content: '📌 Pour modifier les salons de base (Config/Public), utilisez `/setup`. Pour le salon YouTube, utilisez le bouton "Salon YT" ci-dessous.',
      ephemeral: true,
    });
    return;
  }

  if (customId === 'config:set_mod_role') {
    await sendRoleSelectionPanel(client, guildId, interaction);
    return;
  }

  if (customId === 'config:set_yt_channel') {
    await sendChannelSelectionPanel(client, guildId, interaction);
    return;
  }

  if (customId === 'config:reset_mod_role') {
    await prisma.guild.update({ where: { id: guildId }, data: { moderatorRoleId: null } });
    await sendConfigPanel(client, guildId, interaction);
    return;
  }

  if (customId === 'config:reset_yt_channel') {
    await prisma.guild.update({ where: { id: guildId }, data: { youtubeChannelId: null } });
    await sendConfigPanel(client, guildId, interaction);
    return;
  }

  // ── Feed Select Actions ──────────────────────────────────────────────────

  if (customId.startsWith('feed:toggle:')) {
    const feedId = customId.split(':')[2];
    const feed = await prisma.feed.findUnique({ where: { id: feedId } });
    if (feed) {
      await prisma.feed.update({ where: { id: feedId }, data: { enabled: !feed.enabled } });
      await sendFeedsPanel(client, guildId, interaction);
    }
    return;
  }

  if (customId.startsWith('feed:delete:')) {
    const feedId = customId.split(':')[2];
    const feed = await prisma.feed.findUnique({ where: { id: feedId } });
    if (feed) {
      await prisma.feed.delete({ where: { id: feedId } });
      await sendFeedsPanel(client, guildId, interaction);
    }
    return;
  }

  // ── Validation Buttons (validate:approve/reject/translate/pin:type:id) ───

  if (customId.startsWith('validate:')) {
    const parts = customId.split(':');
    const action = parts[1]; // approve | reject | translate | pin
    const type = parts[2] as 'rss' | 'youtube';
    const itemId = parts[3];

    // Check permissions
    const member = interaction.member as GuildMember;
    if (!(await canModerate(member, guildId))) {
      await interaction.reply({ content: '❌ Vous n\'avez pas le rôle modérateur requis pour cette action.', ephemeral: true });
      return;
    }

    await interaction.deferUpdate();

    if (action === 'approve') {
      await sendApprovedItem(client, itemId, type);
      try {
        await interaction.message.delete();
      } catch (e) {
        logger.error('Handler', `Failed to delete message: ${e}`);
      }
      logger.success('Handler', `Approved ${type} item ${itemId} by ${user.tag}`);

      // Start keyword inclusion dialog
      if (type === 'rss') {
        const item = await prisma.feedItem.findUnique({ where: { id: itemId }, include: { feed: true } });
        if (item) {
          await startKeywordDialog(interaction, itemId, item.feed.id, guildId, item.title, item.description, 'include');
        }
      }
    }

    else if (action === 'reject') {
      if (type === 'rss') {
        await prisma.feedItem.update({ where: { id: itemId }, data: { status: 'REJECTED' } });
      } else {
        await prisma.youTubeItem.update({ where: { id: itemId }, data: { status: 'REJECTED' } });
      }
      try {
        await interaction.message.delete();
      } catch (e) {
        logger.error('Handler', `Failed to delete message: ${e}`);
      }
      logger.info('Handler', `Rejected ${type} item ${itemId}`);

      // Start keyword exclusion dialog
      if (type === 'rss') {
        const item = await prisma.feedItem.findUnique({ where: { id: itemId }, include: { feed: true } });
        if (item) {
          await startKeywordDialog(interaction, itemId, item.feed.id, guildId, item.title, item.description, 'exclude');
        }
      }
    }

    else if (action === 'translate') {
      if (type !== 'rss') { await interaction.followUp({ content: 'Traduction non disponible pour YouTube.', flags: [MessageFlags.Ephemeral] }); return; }
      const item = await prisma.feedItem.findUnique({ where: { id: itemId } });
      if (!item) return;
      const guild = await prisma.guild.findUnique({ where: { id: guildId } });
      const targetLang = guild?.defaultTranslateTo ?? 'FR';

      const titleFR = await translate(item.title, targetLang);
      const descFR = item.description ? await translate(item.description, targetLang) : null;

      if (titleFR) {
        await prisma.feedItem.update({
          where: { id: itemId },
          data: { titleTranslated: titleFR, descriptionTranslated: descFR },
        });
        const embed = EmbedBuilder.from(interaction.message.embeds[0])
          .setTitle(truncate(titleFR, 256))
          .setDescription(descFR ?? interaction.message.embeds[0].description);
        await interaction.message.edit({ embeds: [embed] });
      } else {
        await interaction.followUp({ content: '⚠️ Erreur lors de la traduction.', flags: [MessageFlags.Ephemeral] });
      }
    }

    else if (action === 'pin') {
      if (type === 'rss') {
        await prisma.feedItem.update({ where: { id: itemId }, data: { pinned: true } });
      }
      const embed = EmbedBuilder.from(interaction.message.embeds[0]).setFooter({ text: `📌 Sera épinglé à la validation · ID: ${itemId}` });
      await interaction.message.edit({ embeds: [embed] });
    }
    return;
  }

  // ── Keyword filter dialog buttons ────────────────────────────────────────

  if (customId.startsWith('kw:')) {
    await handleKeywordButton(interaction);
    return;
  }

  // ── Public post pin button ────────────────────────────────────────────────

  if (customId.startsWith('public:pin:')) {
    const parts = customId.split(':');
    const type = parts[2];
    const itemId = parts[3];
    await interaction.deferUpdate();
    try {
      if (type === 'rss') {
        const item = await prisma.feedItem.findUnique({ where: { id: itemId } });
        if (!item) return;

        const isPinned = item.pinned;

        if (isPinned) {
          await interaction.message.unpin();
          await prisma.feedItem.update({ where: { id: itemId }, data: { pinned: false } });
        } else {
          await interaction.message.pin();
          await prisma.feedItem.update({ where: { id: itemId }, data: { pinned: true } });
          
          setTimeout(async () => {
            if (interaction.channel) {
              const fetched = await interaction.channel.messages.fetch({ limit: 10 }).catch(() => null);
              if (fetched) {
                const sysMsg = fetched.find((m) => m.type === 6 && m.reference?.messageId === interaction.message.id);
                if (sysMsg) await sysMsg.delete().catch(() => null);
              }
            }
          }, 1500);
        }

        const row = interaction.message.components[0] as import('discord.js').ActionRow<import('discord.js').MessageActionRowComponent>;
        if (row && row.components) {
          const updatedComponents = row.components.map((c) => {
            const btn = c as import('discord.js').ButtonComponent;
            if (btn.customId === customId) {
              return ButtonBuilder.from(btn).setLabel(isPinned ? 'Épingler' : 'Désépingler');
            }
            return ButtonBuilder.from(btn);
          });
          await interaction.message.edit({ components: [new ActionRowBuilder<ButtonBuilder>().addComponents(updatedComponents)] });
        }
      }
    } catch {
      await interaction.followUp({ content: '❌ Impossible de modifier l\'épinglage de ce message.', flags: [MessageFlags.Ephemeral] });
    }
    return;
  }

  // ── Subscribe Button (public channel) ────────────────────────────────────

  if (customId.startsWith('subscribe:feed:')) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    try {
      await sendDMSubscribePanel(user, guildId);
      await interaction.editReply({ content: '📬 Panneau d\'abonnement envoyé en message privé !' });
    } catch {
      await interaction.editReply({ content: '❌ Impossible de vous envoyer un message privé. Vérifiez vos paramètres Discord.' });
    }
    return;
  }

  // ── DM Subscribe toggles ─────────────────────────────────────────────────

  if (customId.startsWith('dm:toggle:')) {
    const feedId = customId.split(':')[2];
    await interaction.deferUpdate();

    const existing = await prisma.userFeedSub.findFirst({ where: { userId: user.id, feedId } });
    if (existing) {
      await prisma.userFeedSub.delete({ where: { id: existing.id } });
    } else {
      await prisma.userFeedSub.create({ data: { userId: user.id, feedId } });
    }

    // Find the guildId from the feed
    const feed = await prisma.feed.findUnique({ where: { id: feedId } });
    if (feed) {
      await sendDMSubscribePanel(user, feed.guildId);
    }
    return;
  }
}

// ── Keyword Dialog Helpers ───────────────────────────────────────────────────

async function startKeywordDialog(
  interaction: ButtonInteraction,
  itemId: string,
  feedId: string,
  guildId: string,
  title: string,
  description: string | null | undefined,
  mode: 'include' | 'exclude',
): Promise<void> {
  const feed = await prisma.feed.findUnique({ where: { id: feedId } });
  if (!feed) return;

  const rawKeywords = extractKeywords(title, description);
  const keywords = rawKeywords.filter((w) => {
    return !feed.includeKeywords.includes(w) &&
           !feed.excludeKeywords.includes(w) &&
           !feed.ignoredKeywords.includes(w);
  });

  if (keywords.length === 0) return;

  const key = sessionKey(interaction.user.id, itemId);
  createSession(key, { keywords, index: 0, feedId, guildId, mode, messageId: null });

  const actionLabel = mode === 'exclude' ? 'exclure' : 'inclure';
  const modeColor = mode === 'exclude' ? COLORS.danger : COLORS.success;
  const modeEmoji = mode === 'exclude' ? '🚫' : '✅';

  const embed = buildKeywordEmbed(keywords, 0, mode, actionLabel, modeColor, modeEmoji);
  const row = buildKeywordRow(itemId, keywords[0], 0, mode);

  const msg = await interaction.followUp({
    embeds: [embed],
    components: [row],
    flags: [MessageFlags.Ephemeral],
  });

  // Store message ID so we can edit later
  const session = getSession(key);
  if (session) session.messageId = msg.id;
}

function buildKeywordEmbed(
  keywords: string[],
  index: number,
  mode: 'include' | 'exclude',
  actionLabel: string,
  modeColor: ColorResolvable,
  modeEmoji: string,
): EmbedBuilder {
  const word = keywords[index];
  const remaining = keywords.length - index - 1;

  return new EmbedBuilder()
    .setColor(modeColor)
    .setTitle(`${modeEmoji} Veux-tu **${actionLabel}** ce mot-clé ?`)
    .setDescription(
      `## \`${word}\`\n\n` +
      `**Mots-clés détectés dans l'article :** ${keywords.map((k, i) => i === index ? `**\`${k}\`**` : `\`${k}\``).join(', ')}\n\n` +
      `> Choisis une option ci-dessous.${remaining > 0 ? `\n> *${remaining} mot${remaining > 1 ? 's' : ''} restant${remaining > 1 ? 's' : ''} après celui-ci.*` : ''}`,
    )
    .setFooter({ text: `Mot ${index + 1} / ${keywords.length}` })
    .setTimestamp();
}

function buildKeywordRow(
  itemId: string,
  word: string,
  index: number,
  mode: 'include' | 'exclude',
): ActionRowBuilder<ButtonBuilder> {
  const base = `kw:${mode}:${itemId}:${index}`;

  const feedBtn = new ButtonBuilder()
    .setCustomId(`${base}:feed`)
    .setLabel('Pour ce flux')
    .setEmoji('🔒')
    .setStyle(mode === 'exclude' ? ButtonStyle.Danger : ButtonStyle.Success);

  const allBtn = new ButtonBuilder()
    .setCustomId(`${base}:all`)
    .setLabel('Toutes les sources')
    .setEmoji('🌐')
    .setStyle(ButtonStyle.Primary);

  const skipBtn = new ButtonBuilder()
    .setCustomId(`${base}:skip`)
    .setLabel('Passer')
    .setEmoji('⏭️')
    .setStyle(ButtonStyle.Secondary);

  const ignoreAllBtn = new ButtonBuilder()
    .setCustomId(`${base}:ignore_all`)
    .setLabel('Ne plus proposer')
    .setEmoji('🗑️')
    .setStyle(ButtonStyle.Secondary);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(feedBtn, allBtn, skipBtn, ignoreAllBtn);
}

async function handleKeywordButton(interaction: ButtonInteraction): Promise<void> {
  const parts = interaction.customId.split(':');
  if (parts.length < 5) return;

  const [, mode, itemId, indexStr, action] = parts;
  const index = parseInt(indexStr, 10);
  const key = sessionKey(interaction.user.id, itemId);

  const session = getSession(key);
  if (!session) {
    await interaction.reply({
      content: '⏱️ Cette session a expiré. Merci de valider/rejeter un article pour relancer le dialogue.',
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  if (session.index !== index) {
    await interaction.reply({
      content: '⚠️ Ce bouton est obsolète, le dialogue a déjà avancé.',
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const word = session.keywords[index];
  const filterMode = mode as 'include' | 'exclude';
  const field = filterMode === 'exclude' ? 'excludeKeywords' : 'includeKeywords';

  let confirmMsg = '';

  if (action === 'feed') {
    const feed = await prisma.feed.findUnique({ where: { id: session.feedId } });
    if (feed) {
      const existing = filterMode === 'exclude' ? feed.excludeKeywords : feed.includeKeywords;
      if (!existing.includes(word)) {
        await prisma.feed.update({
          where: { id: session.feedId },
          data: { [field]: { push: word } },
        });
      }
      const emoji = filterMode === 'exclude' ? '🚫' : '✅';
      confirmMsg = `${emoji} \`${word}\` ajouté aux mots-clés **${filterMode === 'exclude' ? 'exclus' : 'inclus'}** de **${feed.name}**.`;
    }
  } else if (action === 'all') {
    const feeds = await prisma.feed.findMany({ where: { guildId: session.guildId } });
    let updated = 0;
    for (const feed of feeds) {
      const existing = filterMode === 'exclude' ? feed.excludeKeywords : feed.includeKeywords;
      if (!existing.includes(word)) {
        await prisma.feed.update({
          where: { id: feed.id },
          data: { [field]: { push: word } },
        });
        updated++;
      }
    }
    const emoji = filterMode === 'exclude' ? '🚫' : '✅';
    confirmMsg = `${emoji} \`${word}\` ajouté aux mots-clés **${filterMode === 'exclude' ? 'exclus' : 'inclus'}** de **${updated} flux**.`;
  } else if (action === 'ignore_all') {
    const feeds = await prisma.feed.findMany({ where: { guildId: session.guildId } });
    let updated = 0;
    for (const feed of feeds) {
      if (!feed.ignoredKeywords.includes(word)) {
        await prisma.feed.update({
          where: { id: feed.id },
          data: { ignoredKeywords: { push: word } },
        });
        updated++;
      }
    }
    confirmMsg = `🗑️ \`${word}\` complètement ignoré (ne sera plus proposé).`;
  } else {
    confirmMsg = `⏭️ \`${word}\` passé.`;
  }

  const updated = advanceSession(key);
  if (!updated) return;

  const nextIndex = updated.index;

  if (nextIndex >= updated.keywords.length) {
    deleteSession(key);
    const doneEmbed = new EmbedBuilder()
      .setColor(COLORS.success)
      .setTitle('✅ Filtres mis à jour')
      .setDescription(`${confirmMsg}\n\n**Tous les mots-clés ont été traités !** Les filtres sont maintenant actifs.`)
      .setTimestamp();
    await interaction.update({ embeds: [doneEmbed], components: [] });
  } else {
    const actionLabel = filterMode === 'exclude' ? 'exclure' : 'inclure';
    const modeColor = filterMode === 'exclude' ? COLORS.danger : COLORS.success;
    const modeEmoji = filterMode === 'exclude' ? '🚫' : '✅';

    const nextWord = updated.keywords[nextIndex];
    const nextEmbed = buildKeywordEmbed(updated.keywords, nextIndex, filterMode, actionLabel, modeColor, modeEmoji);
    const footerEmbed = EmbedBuilder.from(nextEmbed).setDescription(
      `> *${confirmMsg}*\n\n` + (nextEmbed.data.description ?? '').toString(),
    );

    const nextRow = buildKeywordRow(itemId, nextWord, nextIndex, filterMode);
    await interaction.update({ embeds: [footerEmbed], components: [nextRow] });
  }
}

export async function handleSelectMenu(interaction: AnySelectMenuInteraction, client: Client): Promise<void> {
  const { customId, guildId, values } = interaction;
  if (!guildId) return;

  if (customId === 'config:feed:select') {
    const feedId = values[0];
    const feed = await prisma.feed.findUnique({ where: { id: feedId } });
    if (!feed) return;

    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle(`📡 ${feed.name}`)
      .addFields(
        { name: '🔗 URL', value: truncate(feed.url, 100), inline: false },
        { name: '🏷️ Catégorie', value: feed.category, inline: true },
        { name: '📶 Statut', value: feedStatusEmoji(feed.enabled) + ' ' + (feed.enabled ? 'Actif' : 'Inactif'), inline: true },
        { name: '⚡ Auto-pub', value: feed.autoPublish ? 'Oui' : 'Non', inline: true },
        { name: '🌍 Langue', value: feed.language ?? 'Auto', inline: true },
        { name: '🌐 Traduire en', value: feed.translateTo ?? 'Désactivé', inline: true },
        { name: '🔔 Rôle', value: feed.roleId ? `<@&${feed.roleId}>` : 'Aucun', inline: true },
        { name: '🔤 Inclure', value: feed.includeKeywords.length ? feed.includeKeywords.join(', ') : 'Aucun', inline: true },
        { name: '🚫 Exclure', value: feed.excludeKeywords.length ? feed.excludeKeywords.join(', ') : 'Aucun', inline: true },
      )
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`feed:toggle:${feedId}`).setLabel(feed.enabled ? '🔴 Désactiver' : '🟢 Activer').setStyle(feed.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`feed:delete:${feedId}`).setLabel('🗑️ Supprimer').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('config:feeds').setLabel('◀ Retour').setStyle(ButtonStyle.Secondary),
    );

    if (interaction.isRepliable()) {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ embeds: [embed], components: [row] });
      } else {
        await interaction.update({ embeds: [embed], components: [row] });
      }
    }
    return;
  }

  if (customId === 'config:select_mod_role') {
    const roleId = values[0];
    await prisma.guild.update({
      where: { id: guildId },
      data: { moderatorRoleId: roleId },
    });
    await sendConfigPanel(client, guildId, interaction);
    return;
  }

  if (customId === 'config:select_yt_channel') {
    const channelId = values[0];
    await prisma.guild.update({
      where: { id: guildId },
      data: { youtubeChannelId: channelId },
    });
    await sendYouTubeConfigPanel(client, guildId, interaction);
    return;
  }

  if (customId === 'config:select_yt_short_role') {
    const roleId = values[0];
    await prisma.guild.update({
      where: { id: guildId },
      data: { youtubeShortRoleId: roleId },
    });
    await sendYouTubeConfigPanel(client, guildId, interaction);
    return;
  }

  if (customId === 'config:select_yt_video_role') {
    const roleId = values[0];
    await prisma.guild.update({
      where: { id: guildId },
      data: { youtubeVideoRoleId: roleId },
    });
    await sendYouTubeConfigPanel(client, guildId, interaction);
    return;
  }

  if (customId === 'config:digest:select_role') {
    const roleId = values[0];
    await prisma.guild.update({
      where: { id: guildId },
      data: { digestRoleId: roleId } as any,
    });
    await sendDigestPanel(client, guildId, interaction);
    return;
  }
}

export async function handleModalSubmit(interaction: ModalSubmitInteraction, client: Client): Promise<void> {
  const { customId, guildId } = interaction;
  if (!guildId) return;

  if (customId === 'modal:feed:add') {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const name = interaction.fields.getTextInputValue('feed_name');
    const url = interaction.fields.getTextInputValue('feed_url');
    const category = interaction.fields.getTextInputValue('feed_category') || 'Général';
    const langInput = interaction.fields.getTextInputValue('feed_lang').trim();
    const autoPublishInput = interaction.fields.getTextInputValue('feed_autopublish').toLowerCase();

    let language: string | null = null;
    let translateTo: string | null = null;
    if (langInput.includes('→') || langInput.includes('->')) {
      const sep = langInput.includes('→') ? '→' : '->';
      const parts = langInput.split(sep).map((s) => s.trim());
      language = parts[0] || null;
      translateTo = parts[1] || null;
    } else if (langInput) {
      language = langInput;
    }

    try { new URL(url); } catch {
      await interaction.editReply({ embeds: [errorEmbed('URL invalide')] });
      return;
    }

    const existing = await prisma.feed.findFirst({ where: { guildId, url } });
    if (existing) {
      await interaction.editReply({ embeds: [errorEmbed('Flux existant', `Ce flux existe déjà : **${existing.name}**`)] });
      return;
    }

    const guild = await prisma.guild.findUnique({ where: { id: guildId } });
    if (!guild) {
      await prisma.guild.create({ data: { id: guildId } });
    }

    await prisma.feed.create({
      data: {
        guildId,
        name,
        url,
        category,
        autoPublish: autoPublishInput === 'oui' || autoPublishInput === 'yes',
        language,
        translateTo,
      },
    });

    await interaction.editReply({ embeds: [successEmbed('Flux ajouté !', `**${name}** → \`${url}\``)] });

    if (interaction.channel) {
      await sendFeedsPanel(client, guildId, interaction.channel as TextChannel);
    }
  }

  if (customId === 'modal:digest:config') {
    await interaction.deferUpdate();
    const time = interaction.fields.getTextInputValue('digest_time');
    let text = interaction.fields.getTextInputValue('digest_text')?.trim() || null;

    if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
      await interaction.followUp({ content: "❌ Format d'heure invalide. Utilisez HH:MM (ex: 08:00)", flags: [MessageFlags.Ephemeral] });
      return;
    }

    await prisma.guild.update({
      where: { id: guildId },
      data: { digestTime: time, digestCustomText: text } as any,
    });

    if (interaction.channel) {
      await sendDigestPanel(client, guildId, interaction.channel as TextChannel);
    }
  }
}
