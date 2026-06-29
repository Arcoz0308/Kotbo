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

export const marketCommand = {
  data: new SlashCommandBuilder()
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
        .setDescription('Voir mes annonces')),

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;
    const userId = interaction.user.id;

    if (subcommand === 'sell') {
      const itemId = interaction.options.getString('objet', true);
      const price = interaction.options.getInteger('prix', true);
      const quantity = interaction.options.getInteger('quantité') ?? 1;
      const type = (interaction.options.getString('type') ?? 'FIXED_PRICE') as 'FIXED_PRICE' | 'AUCTION';
      const durationHours = interaction.options.getInteger('durée') ?? 24;

      const result = await createListing(guildId, userId, { itemId, quantity, price, type, durationHours });

      if (!result.success) {
        await interaction.reply({
          components: [errorContainer('Échec', result.error)],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
        return;
      }

      const typeLabel = type === 'AUCTION' ? 'Enchère' : 'Prix fixe';
      const container = new ContainerBuilder()
        .setAccentColor(COLORS_RAW.success)
        .addTextDisplayComponents(text(`### ${E.success} Annonce créée`))
        .addTextDisplayComponents(text(`**${itemId}** x${quantity} mis en vente pour **${price}** ${E.coins}`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(text([
          `${E.arrow} **Type** · ${typeLabel}`,
          `${E.arrow} **Expire dans** · ${durationHours}h`,
        ].join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(text(`-# ${E.kotbo} Kotbo · Marché`));

      await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (subcommand === 'buy') {
      const listingId = interaction.options.getString('annonce', true);
      await interaction.deferReply();

      const result = await buyListing(guildId, userId, listingId);
      if (!result.success) {
        await interaction.editReply({
          components: [errorContainer('Achat échoué', result.error)],
          flags: MessageFlags.IsComponentsV2,
        });
        return;
      }

      await interaction.editReply({
        components: [successContainer('Achat effectué', 'L\'objet a été ajouté à votre inventaire.')],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    if (subcommand === 'bid') {
      const listingId = interaction.options.getString('annonce', true);
      const amount = interaction.options.getInteger('montant', true);

      const result = await placeBid(guildId, userId, listingId, amount);
      if (!result.success) {
        await interaction.reply({
          components: [errorContainer('Enchère refusée', result.error)],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.reply({
        components: [successContainer('Enchère placée', `Votre enchère de **${amount}** ${E.coins} a été enregistrée.`)],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    if (subcommand === 'cancel') {
      const listingId = interaction.options.getString('annonce', true);
      const result = await cancelListing(guildId, userId, listingId);

      if (!result.success) {
        await interaction.reply({
          components: [errorContainer('Annulation impossible', result.error)],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.reply({
        components: [successContainer('Annonce annulée', 'L\'objet a été retourné à votre inventaire.')],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    if (subcommand === 'list') {
      await interaction.deferReply();
      const data = await getActiveListings(guildId);

      if (data.listings.length === 0) {
        const container = new ContainerBuilder()
          .setAccentColor(COLORS_RAW.dark)
          .addTextDisplayComponents(text(`### ${E.coins} Marché`))
          .addTextDisplayComponents(text(`${E.info} Aucune annonce active pour le moment.`))
          .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
          .addTextDisplayComponents(text(`-# ${E.kotbo} Kotbo · Marché`));

        await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        return;
      }

      const lines = data.listings.slice(0, 10).map((l: any) => {
        const typeLabel = l.type === 'AUCTION'
          ? `${E.fire} Enchère (${l.currentBid ?? l.price} ${E.coins})`
          : `${l.price} ${E.coins}`;
        return `${E.dot} \`${l.id.slice(-6)}\` **${l.itemId}** x${l.quantity} — ${typeLabel}`;
      });

      const container = new ContainerBuilder()
        .setAccentColor(COLORS_RAW.primary)
        .addTextDisplayComponents(text(`### ${E.coins} Marché — Annonces actives`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(text(lines.join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(text(`-# ${E.kotbo} Kotbo · ${data.total} annonces au total`));

      await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (subcommand === 'my') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const listings = await getMyListings(guildId, userId);

      if (listings.length === 0) {
        const container = new ContainerBuilder()
          .setAccentColor(COLORS_RAW.dark)
          .addTextDisplayComponents(text(`### ${E.profile} Mes annonces`))
          .addTextDisplayComponents(text(`${E.info} Vous n'avez aucune annonce.`))
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
  },
} satisfies SlashCommandDefinition;
