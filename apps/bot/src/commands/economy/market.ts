import {
  SlashCommandBuilder,
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { COLORS_RAW, text, successContainer, errorContainer } from '../../utils/embeds.js';
import { E } from '../../utils/emojis.js';
import {
  createListing,
  buyListing,
  placeBid,
  cancelListing,
  getActiveListings,
  getMyListings,
} from '../../services/economy/marketplaceService.js';
import type { SlashCommandDefinition } from '../../commands.js';

const data = new SlashCommandBuilder()
  .setName('market')
  .setDescription('Hôtel des ventes — achetez et vendez des objets')
  .addSubcommand((sub) =>
    sub.setName('sell')
      .setDescription('Mettre un objet en vente')
      .addStringOption((opt) => opt.setName('objet').setDescription('ID de l\'objet').setRequired(true))
      .addIntegerOption((opt) => opt.setName('prix').setDescription('Prix en coins').setRequired(true).setMinValue(1))
      .addIntegerOption((opt) => opt.setName('quantité').setDescription('Quantité').setMinValue(1))
      .addStringOption((opt) => opt.setName('type').setDescription('Type de vente').addChoices(
        { name: 'Prix fixe', value: 'FIXED_PRICE' },
        { name: 'Enchère', value: 'AUCTION' },
      ))
      .addIntegerOption((opt) => opt.setName('durée').setDescription('Durée en heures').setMinValue(1).setMaxValue(168)))
  .addSubcommand((sub) =>
    sub.setName('buy')
      .setDescription('Acheter un objet au prix fixe')
      .addStringOption((opt) => opt.setName('annonce').setDescription('ID de l\'annonce').setRequired(true)))
  .addSubcommand((sub) =>
    sub.setName('bid')
      .setDescription('Enchérir sur un objet')
      .addStringOption((opt) => opt.setName('annonce').setDescription('ID de l\'annonce').setRequired(true))
      .addIntegerOption((opt) => opt.setName('montant').setDescription('Montant de l\'enchère').setRequired(true).setMinValue(1)))
  .addSubcommand((sub) =>
    sub.setName('cancel')
      .setDescription('Annuler une annonce')
      .addStringOption((opt) => opt.setName('annonce').setDescription('ID de l\'annonce').setRequired(true)))
  .addSubcommand((sub) =>
    sub.setName('list')
      .setDescription('Voir les annonces actives'))
  .addSubcommand((sub) =>
    sub.setName('my')
      .setDescription('Voir mes annonces'));

async function execute(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;
  const userId = interaction.user.id;

  if (subcommand === 'sell') {
    const itemId = interaction.options.getString('objet', true);
    const price = interaction.options.getInteger('prix', true);
    const quantity = interaction.options.getInteger('quantité') ?? 1;
    const type = (interaction.options.getString('type') ?? 'FIXED_PRICE') as 'FIXED_PRICE' | 'AUCTION';
    const duration = interaction.options.getInteger('durée') ?? 24;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await createListing(guildId, userId, { itemId, quantity, price, type, durationHours: duration });

    if (!result.success) {
      await interaction.editReply({ components: [errorContainer('Vente impossible', result.error)] });
      return;
    }

    const container = new ContainerBuilder()
      .setAccentColor(COLORS_RAW.success)
      .addTextDisplayComponents(text(`### ${E.success} Objet en vente !`))
      .addTextDisplayComponents(text(
        `Votre annonce pour **${itemId}** (x${quantity}) a été publiée.\n` +
        `${E.dot} Mode : ${type === 'FIXED_PRICE' ? 'Prix fixe' : 'Enchère'}\n` +
        `${E.dot} Prix de départ : **${price}** ${E.coins}\n` +
        `${E.dot} Durée : ${duration} heures (ID : \`${result.listing.id.slice(-6)}\`)`
      ))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(text(`-# ${E.kotbo} Kotbo · Marché`));

    await interaction.editReply({ components: [container] });
  }

  if (subcommand === 'buy') {
    const listingId = interaction.options.getString('annonce', true);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await buyListing(guildId, userId, listingId);

    if (!result.success) {
      await interaction.editReply({ components: [errorContainer('Achat impossible', result.error)] });
      return;
    }

    const container = new ContainerBuilder()
      .setAccentColor(COLORS_RAW.success)
      .addTextDisplayComponents(text(`### ${E.success} Achat réussi !`))
      .addTextDisplayComponents(text(
        `Vous avez acheté **${result.listing.itemId}** (x${result.listing.quantity}) pour **${result.listing.price}** ${E.coins} à <@${result.listing.sellerId}>.`
      ))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(text(`-# ${E.kotbo} Kotbo · Marché`));

    await interaction.editReply({ components: [container] });
  }

  if (subcommand === 'bid') {
    const listingId = interaction.options.getString('annonce', true);
    const amount = interaction.options.getInteger('montant', true);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await placeBid(guildId, userId, listingId, amount);

    if (!result.success) {
      await interaction.editReply({ components: [errorContainer('Enchère impossible', result.error)] });
      return;
    }

    const container = new ContainerBuilder()
      .setAccentColor(COLORS_RAW.success)
      .addTextDisplayComponents(text(`### ${E.success} Enchère placée !`))
      .addTextDisplayComponents(text(
        `Vous avez enchéri **${amount}** ${E.coins} sur l'annonce de **${result.listing.itemId}**.`
      ))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(text(`-# ${E.kotbo} Kotbo · Marché`));

    await interaction.editReply({ components: [container] });
  }

  if (subcommand === 'cancel') {
    const listingId = interaction.options.getString('annonce', true);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await cancelListing(guildId, userId, listingId);

    if (!result.success) {
      await interaction.editReply({ components: [errorContainer('Annulation impossible', result.error)] });
      return;
    }

    const container = new ContainerBuilder()
      .setAccentColor(COLORS_RAW.success)
      .addTextDisplayComponents(text(`### ${E.success} Annonce annulée`))
      .addTextDisplayComponents(text(
        `L'annonce pour **${result.listing.itemId}** a bien été annulée et l'objet a été retourné dans votre inventaire.`
      ))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(text(`-# ${E.kotbo} Kotbo · Marché`));

    await interaction.editReply({ components: [container] });
  }

  if (subcommand === 'list') {
    await interaction.deferReply();
    const listings = await getActiveListings(guildId);

    if (listings.length === 0) {
      const container = new ContainerBuilder()
        .setAccentColor(COLORS_RAW.dark)
        .addTextDisplayComponents(text(`### ${E.trophy} Hôtel des ventes`))
        .addTextDisplayComponents(text(`${E.info} Aucune annonce active pour le moment.`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(text(`-# ${E.kotbo} Kotbo · Marché`));

      await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      return;
    }

    const lines = listings.map((l: any) => {
      const typeLabel = l.type === 'AUCTION' ? '🔨 [Enchère]' : '💰';
      const endsAt = new Date(l.endsAt).toLocaleDateString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      return `${typeLabel} \`${l.id.slice(-6)}\` **${l.itemId}** x${l.quantity} — Vendeur: <@${l.sellerId}> — **${l.price}** ${E.coins} (fin le ${endsAt})`;
    });

    const container = new ContainerBuilder()
      .setAccentColor(COLORS_RAW.primary)
      .addTextDisplayComponents(text(`### ${E.trophy} Hôtel des ventes`))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(text(lines.join('\n')))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(text(`-# ${E.kotbo} Kotbo · Marché`));

    await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  if (subcommand === 'my') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const listings = await getMyListings(guildId, userId);

    if (listings.length === 0) {
      const container = new ContainerBuilder()
        .setAccentColor(COLORS_RAW.dark)
        .addTextDisplayComponents(text(`### ${E.profile} Mes annonces`))
        .addTextDisplayComponents(text(`${E.info} Vous n'avez aucune annonce en cours.`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(text(`-# ${E.kotbo} Kotbo · Marché`));

      await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      return;
    }

    const statusIcons: Record<string, string> = {
      ACTIVE: E.online,
      SOLD: E.success,
      CANCELLED: E.error,
      EXPIRED: E.clock,
    };

    const lines = listings.map((l: any) => {
      const icon = statusIcons[l.status] ?? E.dot;
      return `${icon} \`${l.id.slice(-6)}\` **${l.itemId}** x${l.quantity} — ${l.price} ${E.coins}`;
    });

    const container = new ContainerBuilder()
      .setAccentColor(COLORS_RAW.primary)
      .addTextDisplayComponents(text(`### ${E.profile} Mes annonces`))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(text(lines.join('\n')))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(text(`-# ${E.kotbo} Kotbo · Marché`));

    await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }
}

export const marketCommand = { data, execute } satisfies SlashCommandDefinition;
