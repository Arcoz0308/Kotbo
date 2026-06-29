import * as discord from 'discord.js';
import { E } from './emojis.js';
import { getClient } from './client.js';

const COLORS_RAW = {
  primary: 0x5865f2,
  success: 0x57f287,
  danger: 0xed4245,
  warning: 0xfee75c,
  info: 0x5865f2,
  dark: 0x2b2d31,
  pink: 0xeb459e,
};

const EMOJI_PREFIX_REGEX = /^(?:<a?:\w+:\d+>|[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/;

function getClientSafe(): discord.Client | null {
  try {
    return getClient();
  } catch {
    return null;
  }
}

// Mentions don't resolve inside Components V2 TextDisplay — strip them
export function stripMentions(text: string, context?: any): string {
  const client = getClientSafe() || context?.client;
  
  let guild = context?.guild;
  if (!guild && context?.channel && 'guild' in context.channel) {
    guild = context.channel.guild;
  }
  if (!guild && client && context?.guildId) {
    guild = client.guilds.cache.get(context.guildId);
  }

  return text
    .replace(/<@&(\d+)>/g, (match, roleId) => {
      if (guild) {
        const role = guild.roles.cache.get(roleId);
        if (role) {
          return `@${role.name}`;
        }
      }
      if (client) {
        const role = client.roles?.cache?.get(roleId);
        if (role) return `@${role.name}`;

        for (const g of client.guilds.cache.values()) {
          const role = g.roles.cache.get(roleId);
          if (role) {
            return `@${role.name}`;
          }
        }
      }
      return '@r\u00F4le';
    })
    .replace(/<@!?(\d+)>/g, (match, userId) => {
      if (guild) {
        const member = guild.members.cache.get(userId);
        if (member) {
          return `@${member.displayName}`;
        }
      }
      if (client) {
        const user = client.users.cache.get(userId);
        if (user) {
          return `@${user.displayName || user.username}`;
        }
        for (const g of client.guilds.cache.values()) {
          const member = g.members.cache.get(userId);
          if (member) {
            return `@${member.displayName || member.user.username}`;
          }
        }
      }
      return '@utilisateur';
    });
}

function getEmojiForTitle(title: string): string | null {
  const t = title.toLowerCase();
  if (t.includes('succès') || t.includes('réussi') || t.includes('validé') || t.includes('confirmé') || t.includes('terminé') || t.includes('success')) {
    return E.success;
  }
  if (t.includes('erreur') || t.includes('échec') || t.includes('impossible') || t.includes('annulé') || t.includes('non trouvé') || t.includes('error')) {
    return E.error;
  }
  if (t.includes('attention') || t.includes('avertissement') || t.includes('warn') || t.includes('warning') || t.includes('expire')) {
    return E.warning;
  }
  if (t.includes('statistique') || t.includes('stats') || t.includes('analytics')) {
    return E.stats;
  }
  if (t.includes('classement') || t.includes('leaderboard') || t.includes('top 10') || t.includes('trophée')) {
    return E.trophy;
  }
  if (t.includes('configuration') || t.includes('config') || t.includes('paramètre') || t.includes('setup')) {
    return E.settings;
  }
  if (t.includes('casier') || t.includes('sanction') || t.includes('infraction') || t.includes('modération') || t.includes('bannissement') || t.includes('exclusion') || t.includes('ban') || t.includes('kick') || t.includes('mute') || t.includes('timeout')) {
    return E.shield;
  }
  if (t.includes('ticket') || t.includes('support')) {
    return E.ticket;
  }
  if (t.includes('daily algo') || t.includes('daily-algo') || t.includes('algorithme') || t.includes('exercice')) {
    return E.fire;
  }
  if (t.includes('rpg') || t.includes('pièce') || t.includes('coins') || t.includes('boutique') || t.includes('shop') || t.includes('argent') || t.includes('banque')) {
    return E.coins;
  }
  if (t.includes('profil') || t.includes('profile')) {
    return E.profile;
  }
  if (t.includes('actualité') || t.includes('news') || t.includes('youtube') || t.includes('twitch') || t.includes('rss')) {
    return E.news;
  }
  if (t.includes('info') || t.includes('aide') || t.includes('help') || t.includes('information') || t.includes('système')) {
    return E.info;
  }
  return null;
}

export function embedToV2(embed: discord.EmbedBuilder | discord.APIEmbed | Record<string, unknown>, context?: any): discord.ContainerBuilder {
  const isEmbedBuilder = (val: unknown): val is { toJSON: () => discord.APIEmbed } => {
    return val !== null && typeof val === 'object' && 'toJSON' in val && typeof (val as { toJSON: unknown }).toJSON === 'function';
  };

  const data = isEmbedBuilder(embed) ? embed.toJSON() : (embed as discord.APIEmbed);

  const color = data.color ?? COLORS_RAW.primary;
  const c = new discord.ContainerBuilder().setAccentColor(color);

  // Parse title & prefix custom emoji
  let title = data.title ? String(data.title).trim() : '';
  if (title) {
    const hasEmoji = EMOJI_PREFIX_REGEX.test(title);
    if (!hasEmoji) {
      const emoji = getEmojiForTitle(title);
      if (emoji) {
        title = `${emoji} ${title}`;
      }
    }
  }

  // Construct author header
  let authorHeader = '';
  if (data.author?.name) {
    authorHeader = `**${data.author.name.trim()}**\n`;
  }

  let fullTitle = '';
  if (authorHeader || title) {
    fullTitle = `${authorHeader}### ${title || 'Info'}`;
  }
  fullTitle = stripMentions(fullTitle, context);

  // Text section + thumbnail accessory
  if (fullTitle) {
    if (data.thumbnail?.url) {
      c.addSectionComponents(
        new discord.SectionBuilder()
          .addTextDisplayComponents(new discord.TextDisplayBuilder().setContent(fullTitle))
          .setThumbnailAccessory(new discord.ThumbnailBuilder({ media: { url: data.thumbnail.url } }))
      );
    } else {
      c.addTextDisplayComponents(new discord.TextDisplayBuilder().setContent(fullTitle));
    }
  } else if (data.thumbnail?.url) {
    c.addSectionComponents(
      new discord.SectionBuilder()
        .setThumbnailAccessory(new discord.ThumbnailBuilder({ media: { url: data.thumbnail.url } }))
    );
  }

  // Description
  if (data.description) {
    c.addTextDisplayComponents(new discord.TextDisplayBuilder().setContent(stripMentions(data.description, context)));
  }

  // Fields
  if (data.fields?.length) {
    c.addSeparatorComponents(new discord.SeparatorBuilder().setDivider(true).setSpacing(discord.SeparatorSpacingSize.Small));
    for (const field of data.fields) {
      if (field.name && field.value) {
        c.addTextDisplayComponents(
          new discord.TextDisplayBuilder().setContent(stripMentions(`**${field.name}**\n${field.value}`, context))
        );
      }
    }
  }

  // Image (media gallery)
  if (data.image?.url) {
    c.addMediaGalleryComponents(
      new discord.MediaGalleryBuilder().addItems(
        new discord.MediaGalleryItemBuilder({ media: { url: data.image.url } })
      )
    );
  }

  // Footer
  if (data.footer?.text) {
    c.addSeparatorComponents(new discord.SeparatorBuilder().setDivider(false).setSpacing(discord.SeparatorSpacingSize.Small));
    c.addTextDisplayComponents(new discord.TextDisplayBuilder().setContent(stripMentions(`-# ${data.footer.text}`, context)));
  }

  return c;
}

function patchFlags(flags: unknown): unknown {
  const IsComponentsV2 = discord.MessageFlags.IsComponentsV2;
  if (!flags) {
    return [IsComponentsV2];
  }
  if (Array.isArray(flags)) {
    if (!flags.includes(IsComponentsV2)) {
      flags.push(IsComponentsV2);
    }
    return flags;
  }
  if (typeof flags === 'number') {
    return flags | IsComponentsV2;
  }
  const flagObj = flags as { has?: (f: number) => boolean; add?: (f: number) => void };
  if (typeof flagObj.has === 'function' && typeof flagObj.add === 'function') {
    flagObj.add(IsComponentsV2);
    return flagObj;
  }
  return [flags, IsComponentsV2];
}

function transformPayload(options: unknown, context?: any): unknown {
  if (!options || typeof options !== 'object') {
    return options;
  }

  const hasToJSON = 'toJSON' in options && typeof (options as { toJSON: unknown }).toJSON === 'function';
  const hasContent = 'content' in options;
  const hasEmbeds = 'embeds' in options;
  const hasComponents = 'components' in options;

  // If options is a single EmbedBuilder or custom object resembling an embed
  if (options instanceof discord.EmbedBuilder || (hasToJSON && !hasContent && !hasEmbeds && !hasComponents)) {
    return {
      components: [embedToV2(options as discord.EmbedBuilder, context)],
      flags: [discord.MessageFlags.IsComponentsV2],
    };
  }

  // If it's a payload containing embeds
  if (hasEmbeds) {
    const payload = options as { content?: string; embeds?: unknown[]; components?: unknown[]; flags?: unknown };
    if (payload.embeds && Array.isArray(payload.embeds) && payload.embeds.length > 0) {
      const containers: discord.ContainerBuilder[] = [];
      for (const embed of payload.embeds) {
        if (embed) {
          containers.push(embedToV2(embed as discord.EmbedBuilder, context));
        }
      }

      if (containers.length > 0) {
        const originalComponents = payload.components || [];
        const newComponents: unknown[] = [];

        if (payload.content) {
          newComponents.push(
            new discord.TextDisplayBuilder().setContent(stripMentions(payload.content, context))
          );
          delete payload.content;
        }

        newComponents.push(...containers);
        newComponents.push(...(originalComponents as unknown[]));

        payload.components = newComponents;
        delete payload.embeds;
        payload.flags = patchFlags(payload.flags);
      }
    }
  }

  return options;
}

interface PatchItem {
  target: { prototype: Record<string, unknown> };
  methods: string[];
}

// Apply prototype patching to concrete interaction subclasses
const patches: PatchItem[] = [
  { target: discord.CommandInteraction as unknown as { prototype: Record<string, unknown> }, methods: ['reply', 'editReply', 'followUp'] },
  { target: discord.MessageComponentInteraction as unknown as { prototype: Record<string, unknown> }, methods: ['reply', 'editReply', 'followUp', 'update'] },
  { target: discord.ModalSubmitInteraction as unknown as { prototype: Record<string, unknown> }, methods: ['reply', 'editReply', 'followUp'] },
  { target: discord.TextChannel as unknown as { prototype: Record<string, unknown> }, methods: ['send'] },
  { target: discord.DMChannel as unknown as { prototype: Record<string, unknown> }, methods: ['send'] },
  { target: discord.ThreadChannel as unknown as { prototype: Record<string, unknown> }, methods: ['send'] },
  { target: discord.NewsChannel as unknown as { prototype: Record<string, unknown> }, methods: ['send'] },
  { target: discord.User as unknown as { prototype: Record<string, unknown> }, methods: ['send'] },
  { target: discord.WebhookClient as unknown as { prototype: Record<string, unknown> }, methods: ['send'] },
  { target: discord.Message as unknown as { prototype: Record<string, unknown> }, methods: ['reply', 'edit'] },
];

for (const patch of patches) {
  const proto = patch.target?.prototype;
  if (!proto) continue;

  for (const method of patch.methods) {
    const original = proto[method];
    if (typeof original !== 'function') continue;

    proto[method] = function (this: unknown, options: unknown, ...args: unknown[]) {
      const transformed = transformPayload(options, this);
      return (original as (...args: unknown[]) => unknown).call(this, transformed, ...args);
    };
  }
}
