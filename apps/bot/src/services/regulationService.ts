import { type Client, EmbedBuilder, type TextChannel } from 'discord.js';
import prisma from '../utils/db.js';
import { logger } from '../utils/logger.js';
import { createNotification } from './staffLeadershipService.js';

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
}): EmbedBuilder {
  const activeArticles = params.articles.filter((article) => article.enabled);
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📜 Règlement du serveur')
    .setDescription([
      `Bienvenue sur **${params.guildName}**.`,
      'Merci de lire le règlement ci-dessous et de respecter les articles à tout moment.',
      'Les règles listées ici sont synchronisées avec les rapports de sanction du dashboard.',
    ].join('\n'))
    .addFields({
      name: 'Résumé',
      value: [
        `Articles actifs: **${activeArticles.length}**`,
        `Articles totaux: **${params.articles.length}**`,
        `Mise à jour: ${params.publishedAt ? `<t:${Math.floor(params.publishedAt.getTime() / 1000)}:R>` : 'à l’instant'}`,
      ].join(' · '),
      inline: false,
    });

  const visibleArticles = activeArticles.slice(0, 24);
  for (const [index, article] of visibleArticles.entries()) {
    embed.addFields({
      name: `${getArticleEmoji(article)} Article ${index + 1} · ${article.title}`,
      value: article.description.trim() || 'Aucune description fournie.',
      inline: false,
    });
  }

  if (activeArticles.length > visibleArticles.length) {
    embed.addFields({
      name: '… et plus',
      value: `${activeArticles.length - visibleArticles.length} article(s) supplémentaire(s) non affiché(s) dans ce message.`,
      inline: false,
    });
  }

  embed.setFooter({ text: 'Kotbo · Règlement synchronisé' });
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
    },
  });

  const targetChannelId = guild?.regulationChannelId ?? guild?.configChannelId;
  if (!targetChannelId) {
    throw new Error('Le salon de publication du règlement n’est pas défini.');
  }

  const discordGuild = client.guilds.cache.get(guildId);
  const guildName = discordGuild?.name ?? `Serveur ${guildId}`;
  const articles = await loadRegulationArticles(guildId);
  const embed = buildRegulationEmbed({
    guildName,
    guildId,
    articles,
    publishedAt: new Date(),
  });

  const channel = await client.channels.fetch(targetChannelId).catch(() => null) as TextChannel | null;
  if (!channel || !('send' in channel)) {
    throw new Error('Le salon de publication du règlement est introuvable ou inaccessible.');
  }

  let mode: 'created' | 'updated' = 'created';
  let messageId = guild?.regulationMessageId ?? null;

  if (messageId) {
    const existingMessage = await channel.messages.fetch(messageId).catch(() => null);
    if (existingMessage) {
      await existingMessage.edit({ embeds: [embed] });
      mode = 'updated';
    } else {
      const sentMessage = await channel.send({ embeds: [embed] });
      messageId = sentMessage.id;
    }
  } else {
    const sentMessage = await channel.send({ embeds: [embed] });
    messageId = sentMessage.id;
  }

  await prisma.guild.update({
    where: { id: guildId },
    data: { regulationMessageId: messageId },
  });

  logger.info('Règlement', `${mode === 'updated' ? 'Mise à jour' : 'Publication'} du règlement pour ${guildId} dans ${targetChannelId}.`);

  // Notifier tout le staff
  const staff = await prisma.staffMember.findMany({
    where: { guildId }
  });

  if (staff.length > 0) {
    await Promise.all(staff.map(m => createNotification(
      guildId,
      m.userId,
      'Règlement mis à jour',
      'Le règlement du serveur a été mis à jour. Merci d\'en prendre connaissance.',
      'INFO',
      '/regulation'
    ).catch(() => null)));
  }

  return { mode, messageId, targetChannelId };
}
