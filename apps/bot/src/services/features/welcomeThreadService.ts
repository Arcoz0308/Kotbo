import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  ThreadAutoArchiveDuration,
  type ButtonInteraction,
  type Client,
  type ColorResolvable,
  type Guild,
  type GuildMember,
  type MessageActionRowComponentBuilder,
  type NewsChannel,
  type StringSelectMenuInteraction,
  type TextChannel,
  type ThreadChannel,
  type Webhook,
} from 'discord.js';
import type { WelcomeMenuPage, WelcomeThreadConfig, WelcomeThreadStep } from '@prisma/client';
import prisma from '../../utils/db.js';
import { logger } from '../../utils/logger.js';
import { resolvePlaceholders, type PlaceholderContext } from '../../utils/placeholders.js';

const TAG = 'WelcomeThreadService';
const WEBHOOK_NAME = 'Kotbo Accueil';

// Cache mémoire du webhook par salon : évite un appel API fetchWebhooks() à chaque arrivée de membre
const webhookCache = new Map<string, Webhook>();

/** Intervalle de rafraîchissement de l'indicateur "est en train d'écrire" (Discord l'affiche ~10s) */
const TYPING_REFRESH_MS = 8_000;
/** Bornes de l'intervalle entre deux messages scénarisés */
const MIN_STEP_DELAY_MS = 250;
const MAX_STEP_DELAY_MS = 120_000;
/** Limites Discord sur les composants */
const MAX_MENU_PAGES = 25;
export const MAX_THREAD_STEPS = 20;

// Type écrit à la main plutôt que Prisma.WelcomeThreadConfigGetPayload<{ include: ... }> :
// ce générique force tsc à réexpanser tout le graphe de relations du schéma (143 modèles)
// à chaque usage, ce qui provoque des OOM du typechecker sur ce projet.
export type WelcomeThreadConfigWithRelations = WelcomeThreadConfig & {
  steps: WelcomeThreadStep[];
  pages: WelcomeMenuPage[];
};

/**
 * Récupère ou initialise la configuration du thread d'accueil d'une guilde
 */
export async function getOrCreateWelcomeThreadConfig(guildId: string): Promise<WelcomeThreadConfigWithRelations> {
  const include = {
    steps: { orderBy: { order: 'asc' as const } },
    pages: { orderBy: { order: 'asc' as const } },
  };

  const existing = await prisma.welcomeThreadConfig.findUnique({ where: { guildId }, include });
  if (existing) return existing;

  return prisma.welcomeThreadConfig.create({ data: { guildId }, include });
}

export function clampStepDelay(delayMs: number): number {
  if (!Number.isFinite(delayMs)) return MIN_STEP_DELAY_MS;
  return Math.min(Math.max(Math.round(delayMs), MIN_STEP_DELAY_MS), MAX_STEP_DELAY_MS);
}

export function resolveAutoArchiveDuration(minutes: number): ThreadAutoArchiveDuration {
  switch (minutes) {
    case 60: return ThreadAutoArchiveDuration.OneHour;
    case 4320: return ThreadAutoArchiveDuration.ThreeDays;
    case 10080: return ThreadAutoArchiveDuration.OneWeek;
    default: return ThreadAutoArchiveDuration.OneDay;
  }
}

export function parseEmbedColor(color: string | null | undefined): ColorResolvable {
  if (color && /^#[0-9a-fA-F]{6}$/.test(color.trim())) {
    return color.trim() as ColorResolvable;
  }
  return '#5865F2';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Point d'entrée : crée le thread d'accueil et lance la séquence scénarisée
 */
export async function handleWelcomeThread(member: GuildMember, _client: Client): Promise<void> {
  try {
    const config = await getOrCreateWelcomeThreadConfig(member.guild.id);
    if (!config.enabled || !config.channelId) return;

    const channel = member.guild.channels.cache.get(config.channelId);
    if (!channel) return;
    if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) return;

    const ctx: PlaceholderContext = { guild: member.guild, member };
    const threadName = (resolvePlaceholders(config.threadNameTemplate, ctx).trim()
      || `Bienvenue ${member.user.username}`).slice(0, 100);
    const autoArchiveDuration = resolveAutoArchiveDuration(config.autoArchiveMinutes);
    const reason = `Thread d'accueil pour ${member.user.tag}`;

    let thread: ThreadChannel;
    if (channel.type === ChannelType.GuildText && config.threadMode === 'private') {
      thread = await channel.threads.create({
        name: threadName,
        autoArchiveDuration,
        type: ChannelType.PrivateThread,
        invitable: false,
        reason,
      });
    } else {
      thread = await channel.threads.create({ name: threadName, autoArchiveDuration, reason });
    }

    await thread.members.add(member.id).catch(() => null);

    // Séquence détachée : les délais entre messages ne doivent pas bloquer le traitement du join
    void runWelcomeSequence(channel, thread, member, config).catch((err) => {
      logger.error(TAG, `Erreur séquence d'accueil pour ${member.id}:`, err);
    });
  } catch (err) {
    logger.error(TAG, `Erreur création du thread d'accueil pour ${member.id}:`, err);
  }
}

/**
 * Envoie les messages scénarisés via webhook (persona personnalisée) puis l'embed menu
 */
async function runWelcomeSequence(
  parentChannel: TextChannel | NewsChannel,
  thread: ThreadChannel,
  member: GuildMember,
  config: WelcomeThreadConfigWithRelations,
): Promise<void> {
  const ctx: PlaceholderContext = { guild: member.guild, member };
  const steps = config.steps.slice(0, MAX_THREAD_STEPS);
  const webhook = steps.length > 0 ? await getOrCreateWelcomeWebhook(parentChannel) : null;

  for (const step of steps) {
    const delay = clampStepDelay(step.delayMs);
    if (config.typingEnabled) {
      await showTyping(thread, delay);
    } else {
      await sleep(delay);
    }

    await sendStepMessage(webhook, thread, member, config, step, ctx);
  }

  if (config.menuEnabled) {
    const embed = buildWelcomeMenuEmbed(config, ctx);
    const components = buildWelcomeMenuComponents(config);
    await thread.send({ embeds: [embed], components }).catch((err) => {
      logger.warn(TAG, `Impossible d'envoyer l'embed d'accueil dans ${thread.id}:`, err);
    });
  }
}

async function sendStepMessage(
  webhook: Webhook | null,
  thread: ThreadChannel,
  member: GuildMember,
  config: WelcomeThreadConfigWithRelations,
  step: WelcomeThreadStep,
  ctx: PlaceholderContext,
): Promise<void> {
  const content = resolvePlaceholders(step.content, ctx).slice(0, 2000);
  if (!content) return;

  const allowedMentions = { users: [member.id] };

  if (webhook) {
    try {
      await webhook.send({
        content,
        username: (step.name ?? config.webhookName).slice(0, 80),
        avatarURL: step.avatarUrl ?? config.webhookAvatarUrl ?? undefined,
        threadId: thread.id,
        allowedMentions,
      });
      return;
    } catch (err) {
      // Webhook supprimé côté Discord (10015) : purge le cache pour forcer une recréation au prochain join
      webhookCache.delete(webhook.channelId);
      logger.warn(TAG, `Envoi webhook échoué dans ${thread.id}, fallback bot:`, err);
    }
  }

  await thread.send({ content, allowedMentions }).catch(() => null);
}

/**
 * Maintient l'indicateur "est en train d'écrire" pendant toute la durée demandée
 */
async function showTyping(thread: ThreadChannel, durationMs: number): Promise<void> {
  let remaining = durationMs;
  while (remaining > 0) {
    await thread.sendTyping().catch(() => null);
    const wait = Math.min(remaining, TYPING_REFRESH_MS);
    await sleep(wait);
    remaining -= wait;
  }
}

/**
 * Récupère ou crée le webhook d'accueil sur le salon parent (les webhooks ne vivent pas dans les threads)
 */
async function getOrCreateWelcomeWebhook(channel: TextChannel | NewsChannel): Promise<Webhook | null> {
  const cached = webhookCache.get(channel.id);
  if (cached) return cached;

  try {
    const webhooks = await channel.fetchWebhooks();
    const existing = webhooks.find(
      (w) => w.owner?.id === channel.client.user?.id && w.name === WEBHOOK_NAME,
    );
    const webhook = existing?.token ? existing : await channel.createWebhook({
      name: WEBHOOK_NAME,
      reason: "Webhook du système d'accueil personnalisé",
    });

    webhookCache.set(channel.id, webhook);
    return webhook;
  } catch (err) {
    logger.warn(TAG, `Impossible de créer le webhook d'accueil pour ${channel.id}:`, err);
    return null;
  }
}

export function buildWelcomeMenuEmbed(
  config: WelcomeThreadConfigWithRelations,
  ctx: PlaceholderContext,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(resolvePlaceholders(config.embedTitle, ctx).slice(0, 256))
    .setDescription(resolvePlaceholders(config.embedDescription, ctx).slice(0, 4096))
    .setColor(parseEmbedColor(config.embedColor));

  if (config.embedImageUrl) embed.setImage(config.embedImageUrl);
  if (config.embedThumbnailUrl) embed.setThumbnail(config.embedThumbnailUrl);
  return embed;
}

/**
 * Construit les composants du menu de présentation (boutons ou menu déroulant)
 */
export function buildWelcomeMenuComponents(
  config: WelcomeThreadConfigWithRelations,
): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  const pages = config.pages.slice(0, MAX_MENU_PAGES);
  if (pages.length === 0) return [];

  if (config.menuStyle === 'select') {
    const select = new StringSelectMenuBuilder()
      .setCustomId('wpage_select')
      .setPlaceholder(config.menuPlaceholder.slice(0, 150) || 'Découvrir le serveur...')
      .addOptions(pages.map((page) => ({
        label: page.label.slice(0, 100),
        value: page.id,
        ...(page.summary ? { description: page.summary.slice(0, 100) } : {}),
        ...(page.emoji ? { emoji: page.emoji } : {}),
      })));

    return [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(select)];
  }

  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
  for (let i = 0; i < pages.length; i += 5) {
    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>();
    for (const page of pages.slice(i, i + 5)) {
      // Les pages "Lien" utilisent un vrai bouton de lien Discord : navigation
      // gérée côté client, aucune interaction n'est envoyée au bot.
      if (page.actionType === 'LINK' && page.linkUrl) {
        const linkButton = new ButtonBuilder()
          .setLabel(page.label.slice(0, 80))
          .setStyle(ButtonStyle.Link)
          .setURL(page.linkUrl);
        if (page.emoji) linkButton.setEmoji(page.emoji);
        row.addComponents(linkButton);
        continue;
      }

      const button = new ButtonBuilder()
        .setCustomId(`wpage:${page.id}`)
        .setLabel(page.label.slice(0, 80))
        .setStyle(page.actionType === 'ROLE' ? ButtonStyle.Success : ButtonStyle.Secondary);
      if (page.emoji) button.setEmoji(page.emoji);
      row.addComponents(button);
    }
    rows.push(row);
  }
  return rows;
}

export function buildMenuPageEmbed(page: WelcomeMenuPage, ctx?: PlaceholderContext): EmbedBuilder {
  const titleRaw = page.embedTitle ?? '';
  const descriptionRaw = page.embedDescription ?? '';
  const title = ctx ? resolvePlaceholders(titleRaw, ctx) : titleRaw;
  const description = ctx ? resolvePlaceholders(descriptionRaw, ctx) : descriptionRaw;

  const embed = new EmbedBuilder()
    .setTitle(title.slice(0, 256))
    .setDescription(description.slice(0, 4096))
    .setColor(parseEmbedColor(page.embedColor));

  if (page.embedImageUrl) embed.setImage(page.embedImageUrl);
  if (page.embedThumbnailUrl) embed.setThumbnail(page.embedThumbnailUrl);
  return embed;
}

/**
 * Ajoute, retire ou bascule le rôle configuré sur une page "Rôle" du menu d'accueil
 */
async function handleMenuRoleAction(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  guild: Guild,
  page: WelcomeMenuPage,
  member: GuildMember | undefined,
): Promise<void> {
  const roleId = page.roleId;
  if (!roleId || !member) {
    await interaction.reply({
      content: "❌ Ce bouton n'est pas correctement configuré.",
      flags: [MessageFlags.Ephemeral],
    }).catch(() => null);
    return;
  }

  const role = guild.roles.cache.get(roleId);
  const botMember = guild.members.me;
  if (!role || !botMember) {
    await interaction.reply({
      content: '❌ Le rôle configuré est introuvable.',
      flags: [MessageFlags.Ephemeral],
    }).catch(() => null);
    return;
  }

  if (role.managed || role.position >= botMember.roles.highest.position) {
    await interaction.reply({
      content: '❌ Le bot ne peut pas gérer ce rôle (rôle intégré ou supérieur à son propre rôle le plus élevé).',
      flags: [MessageFlags.Ephemeral],
    }).catch(() => null);
    return;
  }

  const hasRole = member.roles.cache.has(roleId);

  try {
    if (page.roleAction === 'REMOVE') {
      if (!hasRole) {
        await interaction.reply({ content: `ℹ️ Vous n'avez pas le rôle <@&${roleId}>.`, flags: [MessageFlags.Ephemeral] });
        return;
      }
      await member.roles.remove(roleId);
      await interaction.reply({ content: `✅ Le rôle <@&${roleId}> vous a été retiré.`, flags: [MessageFlags.Ephemeral] });
      return;
    }

    if (page.roleAction === 'TOGGLE') {
      if (hasRole) {
        await member.roles.remove(roleId);
        await interaction.reply({ content: `✅ Le rôle <@&${roleId}> vous a été retiré.`, flags: [MessageFlags.Ephemeral] });
      } else {
        await member.roles.add(roleId);
        await interaction.reply({ content: `✅ Le rôle <@&${roleId}> vous a été attribué.`, flags: [MessageFlags.Ephemeral] });
      }
      return;
    }

    // ADD (défaut)
    if (hasRole) {
      await interaction.reply({ content: `ℹ️ Vous avez déjà le rôle <@&${roleId}>.`, flags: [MessageFlags.Ephemeral] });
      return;
    }
    await member.roles.add(roleId);
    await interaction.reply({ content: `✅ Le rôle <@&${roleId}> vous a été attribué.`, flags: [MessageFlags.Ephemeral] });
  } catch (err) {
    logger.warn(TAG, `Erreur gestion de rôle (menu accueil) pour ${member.id}:`, err);
    await interaction.reply({
      content: '❌ Une erreur est survenue (permissions insuffisantes du bot pour gérer ce rôle).',
      flags: [MessageFlags.Ephemeral],
    }).catch(() => null);
  }
}

/**
 * Répond aux clics sur le menu de présentation (bouton `wpage:<id>` ou menu déroulant `wpage_select`)
 */
export async function handleWelcomeMenuInteraction(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
): Promise<void> {
  const { guildId, guild } = interaction;
  if (!guildId || !guild) return;

  const pageId = interaction.isButton()
    ? interaction.customId.split(':')[1]
    : interaction.values[0];
  if (!pageId) return;

  const page = await prisma.welcomeMenuPage.findFirst({ where: { id: pageId, guildId } });
  if (!page) {
    await interaction.reply({
      content: "❌ Cette page de présentation n'existe plus.",
      flags: [MessageFlags.Ephemeral],
    }).catch(() => null);
    return;
  }

  const member = interaction.member && 'guild' in interaction.member ? interaction.member as GuildMember : undefined;

  if (page.actionType === 'ROLE') {
    await handleMenuRoleAction(interaction, guild, page, member);
    return;
  }

  if (page.actionType === 'LINK') {
    const url = page.linkUrl?.trim();
    await interaction.reply({
      content: url ? `🔗 ${url}` : "❌ Aucun lien n'est configuré pour ce bouton.",
      flags: [MessageFlags.Ephemeral],
    }).catch(() => null);
    return;
  }

  const embed = buildMenuPageEmbed(page, { guild, member });
  await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] }).catch(() => null);
}
