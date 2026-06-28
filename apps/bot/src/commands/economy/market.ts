import { SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { COLORS } from '../../utils/embeds.js';
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
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.danger).setDescription(`❌ ${result.error}`)], ephemeral: true });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle('📦 Annonce créée')
        .setDescription(`**${itemId}** x${quantity} mis en vente pour **${price}** coins`)
        .addFields(
          { name: 'Type', value: type === 'AUCTION' ? 'Enchère' : 'Prix fixe', inline: true },
          { name: 'Expire dans', value: `${durationHours}h`, inline: true },
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }

    if (subcommand === 'buy') {
      const listingId = interaction.options.getString('annonce', true);
      await interaction.deferReply();

      const result = await buyListing(guildId, userId, listingId);
      if (!result.success) {
        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.danger).setDescription(`❌ ${result.error}`)] });
        return;
      }

      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.success).setDescription('✅ Achat effectué avec succès !')] });
    }

    if (subcommand === 'bid') {
      const listingId = interaction.options.getString('annonce', true);
      const amount = interaction.options.getInteger('montant', true);

      const result = await placeBid(guildId, userId, listingId, amount);
      if (!result.success) {
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.danger).setDescription(`❌ ${result.error}`)], ephemeral: true });
        return;
      }

      await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.success).setDescription(`✅ Enchère de **${amount}** coins placée !`)] });
    }

    if (subcommand === 'cancel') {
      const listingId = interaction.options.getString('annonce', true);
      const result = await cancelListing(guildId, userId, listingId);

      if (!result.success) {
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.danger).setDescription(`❌ ${result.error}`)], ephemeral: true });
        return;
      }

      await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.success).setDescription('✅ Annonce annulée. L\'objet a été retourné à votre inventaire.')] });
    }

    if (subcommand === 'list') {
      await interaction.deferReply();
      const data = await getActiveListings(guildId);

      if (data.listings.length === 0) {
        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.info).setDescription('Aucune annonce active pour le moment.')] });
        return;
      }

      const lines = data.listings.slice(0, 10).map((l: any) => {
        const typeLabel = l.type === 'AUCTION' ? `Enchère (${l.currentBid ?? l.price} coins)` : `${l.price} coins`;
        return `\`${l.id.slice(-6)}\` **${l.itemId}** x${l.quantity} — ${typeLabel}`;
      });

      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle('🏪 Marché — Annonces actives')
        .setDescription(lines.join('\n'))
        .setFooter({ text: `${data.total} annonces au total` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }

    if (subcommand === 'my') {
      await interaction.deferReply({ ephemeral: true });
      const listings = await getMyListings(guildId, userId);

      if (listings.length === 0) {
        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.info).setDescription('Vous n\'avez aucune annonce.')] });
        return;
      }

      const lines = listings.map((l: any) => {
        const status = { ACTIVE: '🟢', SOLD: '✅', CANCELLED: '❌', EXPIRED: '⏰' }[l.status] ?? '❓';
        return `${status} \`${l.id.slice(-6)}\` **${l.itemId}** x${l.quantity} — ${l.price} coins`;
      });

      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle('📦 Mes annonces')
        .setDescription(lines.join('\n'))
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }
  },
} satisfies SlashCommandDefinition;
