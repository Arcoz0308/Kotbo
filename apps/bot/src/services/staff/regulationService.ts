import {
  type Client,
  EmbedBuilder,
  type TextChannel,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Guild
} from 'discord.js';
import prisma from '../../utils/db.js';
import { logger } from '../../utils/logger.js';
import { createNotification } from './staffLeadershipService.js';
import { fetchAllMembers } from '../../utils/discord.js';
import { resolveGuildLocale, type BotLocale } from '../../utils/i18n.js';
import * as m from '../../lib/paraglide/messages.js';

export type RegulationArticle = {
  id: string;
  title: string;
  description: string;
  emoji: string | null;
  sortOrder: number;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function getArticleEmoji(article: RegulationArticle): string {
  const emoji = article.emoji?.trim();
  return emoji ? emoji : '📌';
}

export function buildRegulationEmbed(params: {
  guildName: string;
  guildId: string;
  articles: RegulationArticle[];
  publishedAt?: Date;
  locale: BotLocale;
}): EmbedBuilder {
  const { locale } = params;
  const activeArticles = params.articles.filter((article) => article.enabled);
  const publishedRelative = params.publishedAt
    ? `<t:${Math.floor(params.publishedAt.getTime() / 1000)}:R>`
    : m.panel_regulation_updated_now({}, { locale });

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(m.panel_regulation_title({}, { locale }))
    .setDescription([
      m.panel_regulation_welcome({ guild: params.guildName }, { locale }),
      m.panel_regulation_read({}, { locale }),
      m.panel_regulation_synced({}, { locale }),
    ].join('\n'))
    .addFields({
      name: m.panel_regulation_summary({}, { locale }),
      value: [
        m.panel_regulation_articles_active({ count: activeArticles.length }, { locale }),
        m.panel_regulation_articles_total({ count: params.articles.length }, { locale }),
        m.panel_regulation_updated({ when: publishedRelative }, { locale }),
      ].join(' · '),
      inline: false,
    });

  const visibleArticles = activeArticles.slice(0, 24);
  for (const [index, article] of visibleArticles.entries()) {
    embed.addFields({
      name: m.panel_regulation_article_heading(
        { emoji: getArticleEmoji(article), index: index + 1, title: article.title },
        { locale },
      ),
      value: article.description.trim() || m.panel_regulation_article_no_desc({}, { locale }),
      inline: false,
    });
  }

  if (activeArticles.length > visibleArticles.length) {
    embed.addFields({
      name: m.panel_regulation_more_title({}, { locale }),
      value: m.panel_regulation_more_value(
        { count: activeArticles.length - visibleArticles.length },
        { locale },
      ),
      inline: false,
    });
  }

  embed.setFooter({ text: m.panel_regulation_footer({}, { locale }) });
  embed.setTimestamp(params.publishedAt ?? new Date());
  return embed;
}

export async function loadRegulationArticles(guildId: string): Promise<RegulationArticle[]> {
  return prisma.guildRegulationArticle.findMany({
    where: { guildId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
}

export async function publishOrUpdateRegulationMessage(client: Client, guildId: string) {
  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    select: {
      configChannelId: true,
      regulationChannelId: true,
      regulationMessageId: true,
      regulationVerificationEnabled: true,
      regulationRoleId: true,
    },
  });

  const targetChannelId = guild?.regulationChannelId ?? guild?.configChannelId;
  if (!targetChannelId) {
    throw new Error("Le salon de publication du règlement n'est pas défini.");
  }

  const discordGuild = client.guilds.cache.get(guildId);
  const guildName = discordGuild?.name ?? `Serveur ${guildId}`;
  const locale = await resolveGuildLocale(guildId, discordGuild?.preferredLocale ?? null);
  const articles = await loadRegulationArticles(guildId);
  const embed = buildRegulationEmbed({
    guildName,
    guildId,
    articles,
    publishedAt: new Date(),
    locale,
  });

  const channel = await client.channels.fetch(targetChannelId).catch(() => null) as TextChannel | null;
  if (!channel || !('send' in channel)) {
    throw new Error('Le salon de publication du règlement est introuvable ou inaccessible.');
  }

  const components = [];
  if (guild?.regulationVerificationEnabled) {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('regulation_accept')
        .setLabel(m.panel_regulation_accept_button({}, { locale }))
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅')
    );
    components.push(row);
  }

  let mode: 'created' | 'updated' = 'created';
  let messageId = guild?.regulationMessageId ?? null;

  if (messageId) {
    const existingMessage = await channel.messages.fetch(messageId).catch(() => null);
    if (existingMessage) {
      await existingMessage.edit({ embeds: [embed], components });
      mode = 'updated';
    } else {
      const sentMessage = await channel.send({ embeds: [embed], components, allowedMentions: { parse: [] } });
      messageId = sentMessage.id;
    }
  } else {
    const sentMessage = await channel.send({ embeds: [embed], components, allowedMentions: { parse: [] } });
    messageId = sentMessage.id;
  }

  await prisma.guild.update({
    where: { id: guildId },
    data: { regulationMessageId: messageId },
  });

  logger.info('Règlement', `${mode === 'updated' ? 'Mise à jour' : 'Publication'} du règlement pour ${guildId} dans ${targetChannelId}.`);

  // Notifier selon la configuration
  const featureConfig = await prisma.dashboardFeatureConfig.findUnique({
    where: { guildId_featureKey: { guildId, featureKey: 'regulation' } },
  });

  if (featureConfig?.notifyViaDM) {
    if (featureConfig.notifyOnlyStaffRoles) {
      // Notifier uniquement le staff
      const staff = await prisma.staffMember.findMany({
        where: { guildId }
      });
      if (staff.length > 0) {
        await Promise.all(staff.map(staffMember => createNotification(
          guildId,
          staffMember.userId,
          'Règlement mis à jour',
          "Le règlement du serveur a été mis à jour. Merci d'en prendre connaissance.",
          'INFO',
          '/regulation',
          true
        ).catch(() => null)));
      }
    } else {
      // Notifier TOUS les membres du serveur (hors bots)
      try {
        if (discordGuild) {
          const members = await fetchAllMembers(discordGuild).catch(() => null);
          if (members) {
            const memberList = Array.from(members.values()).filter(member => !member.user.bot);
            await Promise.all(memberList.map(member =>
              createNotification(
                guildId,
                member.id,
                'Règlement mis à jour',
                "Le règlement du serveur a été mis à jour. Merci d'en prendre connaissance.",
                'INFO',
                '/regulation',
                true
              ).catch(() => null)
            ));
          }
        }
      } catch (err) {
        logger.error('Règlement', `Erreur lors de la notification DM de tous les membres: ${err}`);
      }
    }
  }

  return { mode, messageId, targetChannelId };
}

export async function applyRegulationLock(
  discordGuild: Guild,
  verifiedRoleId: string,
  regulationChannelId: string,
  enabled: boolean
) {
  try {
    const verifiedRole = discordGuild.roles.cache.get(verifiedRoleId);
    if (!verifiedRole) {
      logger.error('RegulationLock', `Rôle de vérification introuvable (${verifiedRoleId}) pour le serveur ${discordGuild.name}`);
      return;
    }

    const channels = await discordGuild.channels.fetch();
    for (const channel of channels.values()) {
      if (!channel) continue;

      if (
        channel.type !== ChannelType.GuildText &&
        channel.type !== ChannelType.GuildVoice &&
        channel.type !== ChannelType.GuildCategory &&
        channel.type !== ChannelType.GuildAnnouncement &&
        channel.type !== ChannelType.GuildStageVoice
      ) {
        continue;
      }

      const isRegulationChannel = channel.id === regulationChannelId;

      if (enabled) {
        if (isRegulationChannel) {
          await channel.permissionOverwrites.edit(discordGuild.roles.everyone, {
            ViewChannel: true,
          }).catch((err) => logger.warn('RegulationLock', `Impossible de modifier les perms de règlement pour @everyone: ${err}`));
        } else {
          await channel.permissionOverwrites.edit(discordGuild.roles.everyone, {
            ViewChannel: false,
          }).catch((err) => logger.warn('RegulationLock', `Impossible de masquer le salon ${channel.name} pour @everyone: ${err}`));
          
          await channel.permissionOverwrites.edit(verifiedRole, {
            ViewChannel: true,
          }).catch((err) => logger.warn('RegulationLock', `Impossible d'autoriser le salon ${channel.name} pour le rôle de vérification: ${err}`));
        }
      } else {
        if (!isRegulationChannel) {
          await channel.permissionOverwrites.delete(discordGuild.roles.everyone).catch(() => null);
          await channel.permissionOverwrites.delete(verifiedRole).catch(() => null);
        }
      }
    }
    logger.info('RegulationLock', `Verrouillage du règlement ${enabled ? 'appliqué' : 'retiré'} sur le serveur ${discordGuild.name}.`);
  } catch (err) {
    logger.error('RegulationLock', `Erreur lors de l'application du verrouillage règlement:`, err);
  }
}
