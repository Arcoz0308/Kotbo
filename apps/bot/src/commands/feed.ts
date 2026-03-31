import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
} from 'discord.js';
import prisma from '../utils/db.js';
import { successEmbed, errorEmbed, infoEmbed, feedStatusEmoji, categoryEmoji, truncate } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('feed')
  .setDescription('📡 Gestion des flux RSS')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sc) =>
    sc
      .setName('add')
      .setDescription('Ajouter un flux RSS')
      .addStringOption((o) => o.setName('nom').setDescription('Nom du flux').setRequired(true))
      .addStringOption((o) => o.setName('url').setDescription("URL du flux RSS").setRequired(true))
      .addStringOption((o) =>
        o
          .setName('categorie')
          .setDescription('Catégorie')
          .addChoices(
            { name: '🇫🇷 Tech FR', value: 'Tech FR' },
            { name: '🌍 Tech EN', value: 'Tech EN' },
            { name: '🛡️ Cybersécurité', value: 'Cybersécurité' },
            { name: '🤖 IA & Dev', value: 'IA & Dev' },
            { name: '💻 Hardware & Gaming', value: 'Hardware & Gaming' },
            { name: '📰 Général', value: 'Général' },
          ),
      )
      .addBooleanOption((o) => o.setName('auto_publier').setDescription('Publier sans validation ? (défaut: non)'))
      .addStringOption((o) => o.setName('langue').setDescription('Langue source du flux (ex: fr, en)'))
      .addStringOption((o) => o.setName('traduire_en').setDescription('Traduire automatiquement vers (ex: FR, EN)')),
  )
  .addSubcommand((sc) =>
    sc
      .setName('remove')
      .setDescription('Supprimer un flux RSS')
      .addStringOption((o) => o.setName('nom').setDescription('Nom du flux à supprimer').setRequired(true).setAutocomplete(true)),
  )
  .addSubcommand((sc) =>
    sc
      .setName('toggle')
      .setDescription('Activer/désactiver un flux RSS')
      .addStringOption((o) => o.setName('nom').setDescription('Nom du flux').setRequired(true).setAutocomplete(true)),
  )
  .addSubcommand((sc) =>
    sc
      .setName('autopub')
      .setDescription('Activer/désactiver l\'auto-pub d\'un flux RSS')
      .addStringOption((o) => o.setName('nom').setDescription('Nom du flux').setRequired(true).setAutocomplete(true))
      .addBooleanOption((o) => o.setName('auto_publier').setDescription('Activer ou désactiver l\'auto-pub').setRequired(true)),
  )
  .addSubcommand((sc) =>
    sc.setName('list').setDescription('Lister tous les flux RSS')
  )
  .addSubcommand((sc) =>
    sc.setName('status').setDescription('Vérifier l\'état technique des flux RSS')
  )
  .addSubcommand((sc) =>
    sc
      .setName('keywords')
      .setDescription('Définir des mots-clés filtre pour un flux')
      .addStringOption((o) => o.setName('nom').setDescription('Nom du flux').setRequired(true).setAutocomplete(true))
      .addStringOption((o) => o.setName('inclure').setDescription('Mots-clés requis, séparés par des virgules'))
      .addStringOption((o) => o.setName('exclure').setDescription('Mots-clés interdits, séparés par des virgules')),
  )
  .addSubcommand((sc) =>
    sc
      .setName('role')
      .setDescription('Configurer le rôle abonnés pour un flux')
      .addStringOption((o) => o.setName('nom').setDescription('Nom du flux').setRequired(true).setAutocomplete(true))
      .addRoleOption((o) => o.setName('role').setDescription('Rôle Discord (laisser vide pour auto-créer)'))
      .addBooleanOption((o) => o.setName('auto_creer').setDescription('Créer automatiquement le rôle ?')),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  const guildId = interaction.guildId!;
  const sub = interaction.options.getSubcommand();

  const guild = await prisma.guild.findUnique({ where: { id: guildId } });
  if (!guild) {
    await interaction.editReply({ embeds: [errorEmbed('Non configuré', 'Utilisez `/setup` d\'abord.')] });
    return;
  }

  if (sub === 'add') {
    const name = interaction.options.getString('nom', true);
    const url = interaction.options.getString('url', true);
    const category = interaction.options.getString('categorie') ?? 'Général';
    const autoPublish = interaction.options.getBoolean('auto_publier') ?? false;
    const language = interaction.options.getString('langue') ?? null;
    const translateTo = interaction.options.getString('traduire_en') ?? null;

    try {
      new URL(url); // validate URL
    } catch {
      await interaction.editReply({ embeds: [errorEmbed('URL invalide', 'Veuillez entrer une URL valide.')] });
      return;
    }

    const existing = await prisma.feed.findFirst({ where: { guildId, url } });
    if (existing) {
      await interaction.editReply({ embeds: [errorEmbed('Flux existant', `Ce flux existe déjà : **${existing.name}**`)] });
      return;
    }

    await prisma.feed.create({
      data: { guildId, name, url, category, autoPublish, language, translateTo },
    });

    await interaction.editReply({
      embeds: [successEmbed('Flux ajouté !', `**${name}** (${categoryEmoji(category)} ${category})\n\`${url}\`\nAuto-publier : ${autoPublish ? 'Oui' : 'Non'}`)],
    });
  }

  else if (sub === 'remove') {
    const name = interaction.options.getString('nom', true);
    const feed = await prisma.feed.findFirst({ where: { guildId, name } });
    if (!feed) {
      await interaction.editReply({ embeds: [errorEmbed('Flux introuvable', `Aucun flux nommé **${name}**`)] });
      return;
    }
    await prisma.feed.delete({ where: { id: feed.id } });
    await interaction.editReply({ embeds: [successEmbed('Flux supprimé', `**${feed.name}** a été supprimé.`)] });
  }

  else if (sub === 'toggle') {
    const name = interaction.options.getString('nom', true);
    const feed = await prisma.feed.findFirst({ where: { guildId, name } });
    if (!feed) {
      await interaction.editReply({ embeds: [errorEmbed('Flux introuvable')] });
      return;
    }
    const updated = await prisma.feed.update({ where: { id: feed.id }, data: { enabled: !feed.enabled } });
    await interaction.editReply({
      embeds: [successEmbed('Flux mis à jour', `**${feed.name}** : ${feedStatusEmoji(updated.enabled)} ${updated.enabled ? 'Activé' : 'Désactivé'}`)],
    });
  }

  else if (sub === 'autopub') {
    const name = interaction.options.getString('nom', true);
    const autoPublish = interaction.options.getBoolean('auto_publier', true);
    const feed = await prisma.feed.findFirst({ where: { guildId, name } });
    if (!feed) {
      await interaction.editReply({ embeds: [errorEmbed('Flux introuvable', `Aucun flux nommé **${name}**`)] });
      return;
    }

    const updated = await prisma.feed.update({ where: { id: feed.id }, data: { autoPublish } });
    await interaction.editReply({
      embeds: [successEmbed('Auto-pub mis à jour', `**${updated.name}** : Auto-pub ${updated.autoPublish ? 'activée ✅' : 'désactivée ❌'}`)],
    });
  }

  else if (sub === 'list') {
    const feeds = await prisma.feed.findMany({ where: { guildId }, orderBy: { category: 'asc' } });
    if (feeds.length === 0) {
      await interaction.editReply({ embeds: [infoEmbed('Aucun flux', 'Ajoutez un flux avec `/feed add`.')] });
      return;
    }
    const lines = feeds.map((f) => `${feedStatusEmoji(f.enabled)} **${f.name}** — ${categoryEmoji(f.category)} ${f.category} — Auto-pub : ${f.autoPublish ? 'Oui' : 'Non'}`);
    await interaction.editReply({
      embeds: [infoEmbed(`Flux RSS (${feeds.length})`, lines.join('\n'))],
    });
  }

  else if (sub === 'status') {
    const feeds = await prisma.feed.findMany({ where: { guildId }, orderBy: { name: 'asc' } });
    if (feeds.length === 0) {
      await interaction.editReply({ embeds: [infoEmbed('Aucun flux', 'Ajoutez un flux avec `/feed add`.')] });
      return;
    }

    const lines = feeds.map((f) => {
      if (!f.enabled) return `⚪ **${f.name}** (Désactivé)`;

      let statusIcon = '⏳';
      if (f.lastPollStatus === 'SUCCESS') statusIcon = '✅';
      else if (f.lastPollStatus === 'ERROR') statusIcon = '❌';

      const lastPoll = f.lastPolledAt ? `<t:${Math.floor(f.lastPolledAt.getTime() / 1000)}:R>` : 'Jamais';
      const errorText = f.lastPollError ? `\n   └ ⚠️ *${truncate(f.lastPollError, 100)}*` : '';
      
      return `${statusIcon} **${f.name}**\n   └ Dernier poll : ${lastPoll}${errorText}`;
    });

    await interaction.editReply({
      embeds: [infoEmbed(`État des flux RSS`, lines.join('\n'))],
    });
  }

  else if (sub === 'keywords') {
    const name = interaction.options.getString('nom', true);
    const feed = await prisma.feed.findFirst({ where: { guildId, name } });
    if (!feed) { await interaction.editReply({ embeds: [errorEmbed('Flux introuvable')] }); return; }

    const include = interaction.options.getString('inclure')?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
    const exclude = interaction.options.getString('exclure')?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];

    await prisma.feed.update({ where: { id: feed.id }, data: { includeKeywords: include, excludeKeywords: exclude } });
    await interaction.editReply({
      embeds: [successEmbed('Mots-clés mis à jour', `**${feed.name}**\n✅ Inclure : ${include.length ? include.join(', ') : 'aucun'}\n❌ Exclure : ${exclude.length ? exclude.join(', ') : 'aucun'}`)],
    });
  }

  else if (sub === 'role') {
    const name = interaction.options.getString('nom', true);
    const feed = await prisma.feed.findFirst({ where: { guildId, name } });
    if (!feed) { await interaction.editReply({ embeds: [errorEmbed('Flux introuvable')] }); return; }

    const role = interaction.options.getRole('role');
    const autoCreate = interaction.options.getBoolean('auto_creer') ?? false;

    if (!role && !autoCreate) {
      await interaction.editReply({ embeds: [errorEmbed('Erreur', 'Spécifiez un rôle ou activez `auto_creer`.')] });
      return;
    }

    let roleId = role?.id ?? null;
    if (!role && autoCreate && interaction.guild) {
      const newRole = await interaction.guild.roles.create({
        name: `📡 ${feed.name}`,
        color: 0x5865f2,
        reason: `Kotbo - Abonnés flux ${feed.name}`,
      });
      roleId = newRole.id;
    }

    await prisma.feed.update({ where: { id: feed.id }, data: { roleId, autoRole: autoCreate } });
    await interaction.editReply({
      embeds: [successEmbed('Rôle configuré', `Flux **${feed.name}** → <@&${roleId}>`)],
    });
  }
}

// Autocomplete for feed names
export async function autocomplete(interaction: import('discord.js').AutocompleteInteraction) {
  const guildId = interaction.guildId!;
  const focused = interaction.options.getFocused();
  const feeds = await prisma.feed.findMany({
    where: { guildId, name: { contains: focused, mode: 'insensitive' } },
    take: 25,
  });
  await interaction.respond(feeds.map((f) => ({ name: f.name, value: f.name })));
}
