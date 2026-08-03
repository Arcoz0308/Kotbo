/**
 * Mise en place guidee du serveur : pose d'un coup l'arborescence complete -
 * categories, salons, role staff - et branche chaque element sur le module
 * Kotbo correspondant.
 *
 * Le plan est declare une seule fois ici. Le dashboard le lit pour composer sa
 * previsualisation et l'application le parcourt pour creer : ce que l'admin
 * voit avant de cliquer ne peut pas differer de ce qui sera cree.
 *
 * Comme les mises en route par module, la reprise se fait par identifiant :
 * un element deja enregistre - dans son champ de configuration ou dans la
 * trace `serverTemplateRefs` - est repris, jamais recree.
 */
import {
  PermissionFlagsBits,
  type Guild,
  type OverwriteResolvable,
} from 'discord.js';
import { Prisma } from '@prisma/client';
import prisma from '../../utils/db.js';
import { cache } from '../../utils/cache.js';
import { logger } from '../../utils/logger.js';
import { errorMessage } from '../../utils/errors.js';
import type { BotLocale } from '../../utils/i18n.js';
import * as m from '../../lib/paraglide/messages.js';
import {
  type ProvisionedEntry,
  acquireProvisionLock,
  ensureCategory,
  ensureRole,
  ensureTextChannel,
  ensureVoiceChannel,
  missingProvisionPermissions,
  releaseProvisionLock,
} from './channelProvisioningService.js';
import { defaultLevelUpMessage, getOrCreateLevelConfig, invalidateLevelConfigCache } from '../progression/levelingService.js';
import type { TicketProvisionOutcome } from '../features/ticketProvisioning.js';

export const SERVER_TEMPLATE_SECTIONS = ['staff', 'tickets', 'text', 'bots', 'voice'] as const;
export type ServerTemplateSection = (typeof SERVER_TEMPLATE_SECTIONS)[number];

type ItemKind = 'role' | 'category' | 'text' | 'voice';

/**
 * Ce qu'un element branche cote Kotbo. Le dashboard traduit ce code en une
 * phrase : le service ne connait pas la langue de l'admin, seulement celle du
 * serveur, qui sert a nommer les salons.
 */
type ItemWiring = 'staff' | 'logs' | 'tickets' | 'leveling' | 'rpg' | 'tempvoice' | null;

type TemplateItem = {
  key: string;
  section: ServerTemplateSection;
  kind: ItemKind;
  /** Categorie parente, pour les salons. */
  parent: string | null;
  /** Nom pose sur Discord, dans la langue du serveur. */
  name: (locale: BotLocale) => string;
  wiring: ItemWiring;
  /** Salon ferme a @everyone : la previsualisation le signale. */
  restricted: boolean;
  /**
   * Ne peut pas etre decoche tant que sa section est retenue : le module ne
   * fonctionnerait pas sans lui.
   */
  required: boolean;
};

const item = (
  key: string,
  section: ServerTemplateSection,
  kind: ItemKind,
  name: (locale: BotLocale) => string,
  options: { parent?: string; wiring?: ItemWiring; restricted?: boolean; required?: boolean } = {},
): TemplateItem => ({
  key,
  section,
  kind,
  parent: options.parent ?? null,
  name,
  wiring: options.wiring ?? null,
  restricted: options.restricted ?? false,
  required: options.required ?? false,
});

/** Ordre de la liste = ordre d'affichage dans la previsualisation et ordre de creation. */
export const SERVER_TEMPLATE_PLAN: TemplateItem[] = [
  // Indispensable a sa section : les salons staff sont fermes a @everyone, et
  // sans role a qui les rouvrir ils ne seraient visibles que du bot.
  item('role.staff', 'staff', 'role', (l) => m.setup_template_role_staff({}, { locale: l }), { wiring: 'staff', required: true }),
  item('staff.category', 'staff', 'category', (l) => m.setup_template_category_staff({}, { locale: l }), { restricted: true }),
  item('staff.general', 'staff', 'text', (l) => m.setup_template_channel_staff_general({}, { locale: l }), { parent: 'staff.category', wiring: 'staff', restricted: true }),
  item('staff.log', 'staff', 'text', (l) => m.setup_template_channel_staff_logs({}, { locale: l }), { parent: 'staff.category', wiring: 'logs', restricted: true }),

  item('tickets.category', 'tickets', 'category', (l) => m.setup_channel_tickets_category({}, { locale: l }), { wiring: 'tickets', restricted: true, required: true }),
  item('tickets.panel', 'tickets', 'text', (l) => m.setup_channel_tickets_panel({}, { locale: l }), { parent: 'tickets.category', wiring: 'tickets', required: true }),
  item('tickets.logs', 'tickets', 'text', (l) => m.setup_channel_tickets_logs({}, { locale: l }), { parent: 'tickets.category', wiring: 'tickets', restricted: true, required: true }),

  item('text.category', 'text', 'category', (l) => m.setup_template_category_text({}, { locale: l })),
  item('text.general', 'text', 'text', (l) => m.setup_template_channel_general({}, { locale: l }), { parent: 'text.category' }),
  item('text.media', 'text', 'text', (l) => m.setup_template_channel_media({}, { locale: l }), { parent: 'text.category' }),
  item('text.random', 'text', 'text', (l) => m.setup_template_channel_random({}, { locale: l }), { parent: 'text.category' }),

  item('bots.category', 'bots', 'category', (l) => m.setup_template_category_bots({}, { locale: l })),
  item('bots.rpg', 'bots', 'text', (l) => m.setup_template_channel_rpg({}, { locale: l }), { parent: 'bots.category', wiring: 'rpg' }),
  item('bots.level', 'bots', 'text', (l) => m.setup_channel_leveling({}, { locale: l }), { parent: 'bots.category', wiring: 'leveling' }),

  item('voice.category', 'voice', 'category', (l) => m.setup_template_category_voice({}, { locale: l })),
  item('voice.general', 'voice', 'voice', (l) => m.setup_template_voice_general({}, { locale: l }), { parent: 'voice.category' }),
  item('voice.generator', 'voice', 'voice', (l) => m.setup_template_voice_generator({}, { locale: l }), { parent: 'voice.category', wiring: 'tempvoice' }),
];

const ITEMS_BY_KEY = new Map(SERVER_TEMPLATE_PLAN.map((entry) => [entry.key, entry]));

/** Toutes les cles cochees par defaut : la maquette complete. */
export const DEFAULT_SELECTION = SERVER_TEMPLATE_PLAN.map((entry) => entry.key);

export type ServerTemplatePlanItem = {
  key: string;
  section: ServerTemplateSection;
  kind: ItemKind;
  parent: string | null;
  name: string;
  wiring: ItemWiring;
  restricted: boolean;
  required: boolean;
};

/** Le plan resolu dans la langue du serveur, tel qu'il sera pose sur Discord. */
export function buildServerTemplatePlan(locale: BotLocale): ServerTemplatePlanItem[] {
  return SERVER_TEMPLATE_PLAN.map((entry) => ({
    key: entry.key,
    section: entry.section,
    kind: entry.kind,
    parent: entry.parent,
    name: entry.name(locale),
    wiring: entry.wiring,
    restricted: entry.restricted,
    required: entry.required,
  }));
}

/**
 * Remet une selection venue du dashboard en etat coherent : cles inconnues
 * ecartees, categorie ajoutee des qu'un de ses salons est retenu, elements
 * indispensables a une section retenue rajoutes, et section videe de sa seule
 * categorie ecartee a son tour.
 *
 * Faite cote serveur et non seulement dans la page : la route ne peut pas
 * supposer que le corps de requete vient de notre interface.
 */
export function normalizeSelection(selection: readonly string[]): string[] {
  const kept = new Set(selection.filter((key) => ITEMS_BY_KEY.has(key)));

  for (const key of [...kept]) {
    const entry = ITEMS_BY_KEY.get(key);
    if (entry?.parent) kept.add(entry.parent);
  }

  const activeSections = new Set(
    SERVER_TEMPLATE_PLAN.filter((entry) => kept.has(entry.key)).map((entry) => entry.section),
  );
  for (const entry of SERVER_TEMPLATE_PLAN) {
    if (entry.required && activeSections.has(entry.section)) kept.add(entry.key);
  }

  // Une categorie seule ne vaut pas d'etre creee : elle n'apparaitrait meme pas
  // dans la liste des salons du serveur.
  for (const entry of SERVER_TEMPLATE_PLAN) {
    if (entry.kind !== 'category') continue;
    const hasChild = SERVER_TEMPLATE_PLAN.some((child) => child.parent === entry.key && kept.has(child.key));
    if (!hasChild) kept.delete(entry.key);
  }

  return SERVER_TEMPLATE_PLAN.filter((entry) => kept.has(entry.key)).map((entry) => entry.key);
}

/**
 * Permissions exigees du bot pour la selection donnee.
 *
 * Seule la creation d'un role reclame « Gerer les roles ». Les surcharges
 * posees sur les salons fermes n'en demandent pas de plus que « Gerer les
 * salons » - c'est deja ce dont vit la mise en route des tickets, qui pose la
 * meme categorie fermee. L'exiger ici bloquerait des serveurs qui fonctionnent.
 */
export function requiredPermissionsFor(selection: readonly string[]): bigint[] {
  const required: bigint[] = [PermissionFlagsBits.ManageChannels];
  const createsRole = selection.some((key) => ITEMS_BY_KEY.get(key)?.kind === 'role');
  if (createsRole) required.push(PermissionFlagsBits.ManageRoles);
  return required;
}

type StoredRefs = Record<string, string>;

function readRefs(value: Prisma.JsonValue | null | undefined): StoredRefs {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const refs: StoredRefs = {};
  for (const [key, id] of Object.entries(value as Record<string, unknown>)) {
    if (typeof id === 'string') refs[key] = id;
  }
  return refs;
}

/**
 * Le bot peut etre exclu du serveur ou perdre ses permissions pendant que la
 * mise en place se deroule. Chaque section reverifie donc avant de creer, au
 * lieu de se fier au controle d'entree.
 */
async function assertStillAllowed(guild: Guild, required: bigint[]): Promise<string> {
  const me = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
  if (!me) {
    throw new Error("Kotbo n'est plus membre de ce serveur.");
  }
  const missing = await missingProvisionPermissions(guild, required);
  if (missing.length > 0) {
    throw new Error(`Kotbo n'a plus les permissions nécessaires : ${missing.join(', ')}.`);
  }
  return me.id;
}

export type ServerTemplateResult = {
  items: ProvisionedEntry[];
  panelSent: boolean;
  interrupted: string | null;
};

export async function applyServerTemplate(input: {
  guild: Guild;
  locale: BotLocale;
  selection: readonly string[];
  auditUser: string;
}): Promise<ServerTemplateResult> {
  const { guild, locale, auditUser } = input;
  const guildId = guild.id;
  const selection = new Set(normalizeSelection(input.selection));
  const required = requiredPermissionsFor([...selection]);
  const reason = m.setup_reason_template({ user: auditUser }, { locale });

  const items: ProvisionedEntry[] = [];
  const data: Prisma.GuildUpdateInput = {};
  const refs: StoredRefs = {};
  let panelSent = false;

  const config = await prisma.guild.findUnique({
    where: { id: guildId },
    select: {
      staffAnnouncementChannelId: true,
      logChannelId: true,
      economyChannelId: true,
      ticketStaffRoleId: true,
      baseStaffRoleId: true,
      moderatorRoleId: true,
      tempVoiceChannelId: true,
      tempVoiceCategoryId: true,
      serverTemplateRefs: true,
    },
  });
  const knownRefs = readRefs(config?.serverTemplateRefs);

  // Ecrit au fil de l'eau : une interruption en cours de route doit laisser
  // derriere elle de quoi reprendre sans rien creer deux fois.
  const persist = async () => {
    const payload: Prisma.GuildUpdateInput = { ...data };
    if (Object.keys(refs).length > 0) {
      payload.serverTemplateRefs = { ...knownRefs, ...refs };
    }
    if (Object.keys(payload).length > 0) {
      await prisma.guild.update({ where: { id: guildId }, data: payload });
    }
  };

  const record = (entry: ProvisionedEntry) => {
    items.push(entry);
    refs[entry.key] = entry.id;
    return entry;
  };

  const everyoneId = guild.roles.everyone.id;

  const nameOf = (key: string) => {
    const entry = ITEMS_BY_KEY.get(key);
    if (!entry) throw new Error(`Élément de plan inconnu : ${key}`);
    return entry.name(locale);
  };

  try {
    // Lit aussi le membre du bot hors du cache : sans lui, aucune surcharge ne
    // serait posee a son nom et il ne verrait pas les salons fermes qu'il vient
    // de creer.
    const botId = await assertStillAllowed(guild, required);

    // Le refus pose sur @everyone vaut aussi pour le bot, des lors qu'il n'est
    // pas administrateur du serveur.
    const botOverwrite: OverwriteResolvable[] = [{
      id: botId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
      ]
    }];

    // Le role d'abord : les salons fermes s'appuient dessus, et un role cree
    // apres coup laisserait le staff dehors.
    const configuredRoleId = config?.ticketStaffRoleId ?? config?.baseStaffRoleId ?? config?.moderatorRoleId ?? null;
    let staffRoleId: string | null = null;
    if (selection.has('role.staff')) {
      const staff = await ensureRole(guild, {
        key: 'role.staff',
        existingId: configuredRoleId ?? knownRefs['role.staff'],
        name: nameOf('role.staff'),
        hoist: true,
        reason,
      });
      record(staff.entry);
      staffRoleId = staff.role.id;
      // Sans condition sur la creation : une reprise apres echec retrouve le
      // role par sa trace, mais le branchement n'aurait jamais ete enregistre.
      // Un role deja choisi par l'admin n'est pas ecrase pour autant.
      if (!config?.ticketStaffRoleId) data.ticketStaffRoleId = staff.role.id;
      if (!config?.baseStaffRoleId) data.baseStaffRoleId = staff.role.id;
      await persist();
    } else if (configuredRoleId) {
      // Le role enregistre peut avoir ete supprime depuis : sans ce controle,
      // Discord refuserait la surcharge et la creation de la categorie avec.
      const existing = guild.roles.cache.get(configuredRoleId)
        ?? await guild.roles.fetch(configuredRoleId).catch(() => null);
      staffRoleId = existing?.id ?? null;
    }

    const staffOverwrite: OverwriteResolvable[] = staffRoleId
      ? [{
          id: staffRoleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ]
        }]
      : [];
    const restrictedOverwrites: OverwriteResolvable[] = [
      { id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] },
      ...botOverwrite,
      ...staffOverwrite,
    ];

    const ensurePlannedCategory = async (key: string, existingId: string | null | undefined, restricted: boolean) => {
      const created = await ensureCategory(guild, {
        key,
        existingId: existingId ?? knownRefs[key],
        name: nameOf(key),
        permissionOverwrites: restricted ? restrictedOverwrites : undefined,
        reason,
      });
      record(created.entry);
      return created.channel.id;
    };

    if (selection.has('staff.category')) {
      await assertStillAllowed(guild, required);
      const parentId = await ensurePlannedCategory('staff.category', null, true);

      if (selection.has('staff.general')) {
        const channel = await ensureTextChannel(guild, {
          key: 'staff.general',
          existingId: config?.staffAnnouncementChannelId ?? knownRefs['staff.general'],
          name: nameOf('staff.general'),
          parentId,
          reason,
        });
        record(channel.entry);
        if (config?.staffAnnouncementChannelId !== channel.channel.id) {
          data.staffAnnouncementChannelId = channel.channel.id;
        }
      }

      if (selection.has('staff.log')) {
        const channel = await ensureTextChannel(guild, {
          key: 'staff.log',
          existingId: config?.logChannelId ?? knownRefs['staff.log'],
          name: nameOf('staff.log'),
          parentId,
          reason,
        });
        record(channel.entry);
        if (config?.logChannelId !== channel.channel.id) {
          data.logChannelId = channel.channel.id;
        }
      }

      await persist();
    }

    if (selection.has('tickets.category')) {
      await assertStillAllowed(guild, required);
      // Le module tickets pose lui-meme sa categorie et ses salons : la mise en
      // place ne les recree pas de son cote, sinon les deux entrees pourraient
      // diverger.
      //
      // Sous le verrou du module, et non seulement celui de la mise en place :
      // les deux entrees font le meme travail, et une mise en route lancee
      // depuis la page Tickets au meme instant creerait un second jeu de salons.
      const ticketLock = `tickets:${guildId}`;
      if (!acquireProvisionLock(ticketLock)) {
        throw new Error('Une mise en route du module tickets est déjà en cours sur ce serveur.');
      }

      // Le module nomme ses elements pour lui ; le plan les nomme autrement.
      // Sans cette table, les identifiants seraient ranges sous des cles que la
      // previsualisation ne connait pas.
      const ticketKeys: Record<string, string> = {
        category: 'tickets.category',
        panelChannel: 'tickets.panel',
        logChannel: 'tickets.logs',
      };

      const { provisionTicketChannels } = await import('../features/ticketProvisioning.js');
      const ticketItems: ProvisionedEntry[] = [];
      // Le role staff est deja enregistre en base a ce stade : le module y lit
      // lui-meme qui ajouter aux tickets ouverts.
      let outcome: TicketProvisionOutcome | null = null;
      try {
        outcome = await provisionTicketChannels(guild, {
          locale,
          reason,
          items: ticketItems,
          data,
          persist,
        });
      } finally {
        releaseProvisionLock(ticketLock);
        // Repris meme sur un echec : les salons deja crees doivent figurer au
        // compte rendu, et leurs identifiants dans la trace de reprise.
        for (const entry of ticketItems) {
          record({ ...entry, key: ticketKeys[entry.key] ?? `tickets.${entry.key}` });
        }
      }

      if (outcome?.panelCreated) {
        const { sendTicketSetupEmbed } = await import('../features/ticketService.js');
        await sendTicketSetupEmbed(guild.client, guildId);
        panelSent = true;
      }
    }

    if (selection.has('text.category')) {
      await assertStillAllowed(guild, required);
      const parentId = await ensurePlannedCategory('text.category', null, false);

      for (const key of ['text.general', 'text.media', 'text.random']) {
        if (!selection.has(key)) continue;
        const channel = await ensureTextChannel(guild, {
          key,
          existingId: knownRefs[key],
          name: nameOf(key),
          parentId,
          reason,
        });
        record(channel.entry);
      }

      await persist();
    }

    if (selection.has('bots.category')) {
      await assertStillAllowed(guild, required);
      const parentId = await ensurePlannedCategory('bots.category', null, false);

      if (selection.has('bots.rpg')) {
        const channel = await ensureTextChannel(guild, {
          key: 'bots.rpg',
          existingId: config?.economyChannelId ?? knownRefs['bots.rpg'],
          name: nameOf('bots.rpg'),
          parentId,
          reason,
        });
        record(channel.entry);
        if (config?.economyChannelId !== channel.channel.id) {
          data.economyChannelId = channel.channel.id;
        }
      }

      if (selection.has('bots.level')) {
        // `levelUpChannelId` porte aussi des valeurs qui ne sont pas des salons
        // (vide pour le salon d'origine, `DM` pour le message prive) : seul un
        // identifiant de salon est repris, le reste part sur une creation.
        const levelConfig = await getOrCreateLevelConfig(guildId);
        const existingId = levelConfig.levelUpChannelId && levelConfig.levelUpChannelId !== 'DM'
          ? levelConfig.levelUpChannelId
          : knownRefs['bots.level'];

        // Le refus d'ecriture vaut aussi pour le bot : sans surcharge a son nom,
        // il ne pourrait pas annoncer les niveaux dans le salon qu'il vient de
        // creer, sauf a etre administrateur du serveur.
        const channel = await ensureTextChannel(guild, {
          key: 'bots.level',
          existingId,
          name: nameOf('bots.level'),
          parentId,
          permissionOverwrites: [
            {
              id: everyoneId,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
              deny: [PermissionFlagsBits.SendMessages],
            },
            {
              id: botId,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.EmbedLinks,
              ]
            },
          ],
          reason,
        });
        record(channel.entry);

        // Ecrit des que la configuration ne pointe pas deja sur ce salon : une
        // reprise apres echec retrouve le salon par sa trace, mais le
        // branchement, lui, n'aurait jamais ete enregistre.
        if (levelConfig.levelUpChannelId !== channel.channel.id) {
          // Le message par defaut est depose en meme temps quand l'admin n'en a
          // pas ecrit : la mise en route doit laisser un texte visible et
          // modifiable, pas un champ vide dont on ne devine pas le rendu.
          await prisma.levelConfig.update({
            where: { guildId },
            data: {
              levelUpChannelId: channel.channel.id,
              levelUpMessage: levelConfig.levelUpMessage?.trim() || defaultLevelUpMessage(locale),
            },
          });
          await invalidateLevelConfigCache(guildId);
        }
      }

      await persist();
    }

    if (selection.has('voice.category')) {
      await assertStillAllowed(guild, required);
      // La categorie deja retenue par les vocaux temporaires sert de repli :
      // le generateur doit vivre dedans, pas a cote.
      const parentId = await ensurePlannedCategory('voice.category', knownRefs['voice.category'] ?? config?.tempVoiceCategoryId, false);

      if (selection.has('voice.general')) {
        const channel = await ensureVoiceChannel(guild, {
          key: 'voice.general',
          existingId: knownRefs['voice.general'],
          name: nameOf('voice.general'),
          parentId,
          reason,
        });
        record(channel.entry);
      }

      if (selection.has('voice.generator')) {
        const channel = await ensureVoiceChannel(guild, {
          key: 'voice.generator',
          existingId: config?.tempVoiceChannelId ?? knownRefs['voice.generator'],
          name: nameOf('voice.generator'),
          parentId,
          reason,
        });
        record(channel.entry);
        // Ecrit meme sur un salon repris : cocher le generateur veut dire
        // « je veux des vocaux temporaires », et un salon deja en place mais
        // laisse desactive ne les produirait pas. Le modele de nom, lui, ne
        // remplace pas celui que l'admin aurait choisi.
        data.tempVoiceEnabled = true;
        data.tempVoiceChannelId = channel.channel.id;
        data.tempVoiceCategoryId = parentId;
        if (channel.entry.created) {
          data.tempVoiceNameTemplate = m.setup_template_voice_name({ user: '{user}' }, { locale });
        }
      }

      await persist();
    }

    await persist();
    await cache.invalidateGuild(guildId);
    return { items, panelSent, interrupted: null };
  } catch (err) {
    // Ce qui a ete cree est enregistre malgre l'echec : sans cela, une reprise
    // reposerait les memes salons a cote des precedents.
    await persist().catch(() => null);
    await cache.invalidateGuild(guildId).catch(() => null);
    logger.error('ServerTemplate', `Mise en place interrompue sur ${guildId}: ${errorMessage(err)}`);
    return { items, panelSent, interrupted: errorMessage(err) };
  }
}
