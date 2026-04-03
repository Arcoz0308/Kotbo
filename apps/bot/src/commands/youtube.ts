import { SlashCommandBuilder, type ChatInputCommandInteraction, PermissionFlagsBits, type GuildMember, MessageFlags } from 'discord.js';
import prisma from '../utils/db.js';
import { successEmbed, errorEmbed, infoEmbed } from '../utils/embeds.js';

function extractChannelId(input: string): string | null {
  try {
    const url = new URL(input);
    if (url.searchParams.has('channel_id')) return url.searchParams.get('channel_id');
    const parts = url.pathname.split('/').filter(Boolean);
    const idx = parts.indexOf('channel');
    if (idx >= 0 && parts.length > idx + 1) return parts[idx + 1];
    return parts.pop() ?? null;
  } catch {
    return input;
  }
}

export const data = new SlashCommandBuilder()
  .setName('youtube')
  .setDescription('Gérer les chaînes YouTube suivies')
  .addSubcommand((sub) => sub
    .setName('subscribe')
    .setDescription('Suivre une chaîne YouTube')
    .addStringOption((o) => o.setName('channel').setDescription('ID ou URL de la chaîne (ex: UC...)').setRequired(true)))
  .addSubcommand((sub) => sub
    .setName('unsubscribe')
    .setDescription('Arrêter de suivre une chaîne')
    .addStringOption((o) => o.setName('channel').setDescription('ID ou URL de la chaîne').setRequired(true)))
  .addSubcommand((sub) => sub
    .setName('list')
    .setDescription('Lister les chaînes suivies par ce serveur'));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const member = interaction.member as GuildMember | null;
  if (!interaction.guildId || !member) {
    await interaction.editReply({ embeds: [errorEmbed('Commande invalide', 'Cette commande doit être utilisée dans un serveur.')] });
    return;
  }

  const guild = await prisma.guild.findUnique({ where: { id: interaction.guildId } });
  const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
  const isMod = !!(guild?.moderatorRoleId && (member.roles as any).cache.has(guild.moderatorRoleId));
  if (!isAdmin && !isMod) {
    await interaction.editReply({ embeds: [errorEmbed('Permissions', 'Vous devez être administrateur ou modérateur pour utiliser cette commande.')] });
    return;
  }

  const sub = interaction.options.getSubcommand();
  if (sub === 'subscribe') {
    const raw = interaction.options.getString('channel', true);
    const channelId = extractChannelId(raw);
    if (!channelId) {
      await interaction.editReply({ embeds: [errorEmbed('ID invalide', 'Impossible d\'extraire un ID de chaîne valide.')] });
      return;
    }
    try {
      await (prisma as any).youTubeSubscription.create({
        data: { guildId: interaction.guildId, channelId },
      });
      await interaction.editReply({ embeds: [successEmbed('Abonnement ajouté', `La chaîne \`${channelId}\` est désormais suivie.`)] });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        await interaction.editReply({ embeds: [infoEmbed('Déjà abonné', `La chaîne \`${channelId}\` est déjà suivie pour ce serveur.`)] });
      } else {
        await interaction.editReply({ embeds: [errorEmbed('Erreur', 'Impossible d\'ajouter l\'abonnement.')] });
      }
    }
    return;
  }

  if (sub === 'unsubscribe') {
    const raw = interaction.options.getString('channel', true);
    const channelId = extractChannelId(raw);
    if (!channelId) {
      await interaction.editReply({ embeds: [errorEmbed('ID invalide', 'Impossible d\'extraire un ID de chaîne valide.')] });
      return;
    }
    try {
      const existing = await (prisma as any).youTubeSubscription.findFirst({ where: { guildId: interaction.guildId, channelId } });
      if (!existing) {
        await interaction.editReply({ embeds: [infoEmbed('Non trouvé', `La chaîne \`${channelId}\` n'est pas suivie.`)] });
        return;
      }
      await (prisma as any).youTubeSubscription.delete({ where: { id: existing.id } });
      await interaction.editReply({ embeds: [successEmbed('Abonnement supprimé', `La chaîne \`${channelId}\` n'est plus suivie.`)] });
    } catch (e) {
      await interaction.editReply({ embeds: [errorEmbed('Erreur', 'Impossible de supprimer l\'abonnement.')] });
    }
    return;
  }

  if (sub === 'list') {
    const subs = await (prisma as any).youTubeSubscription.findMany({ where: { guildId: interaction.guildId } });
    if (!subs.length) {
      await interaction.editReply({ embeds: [infoEmbed('Aucune chaîne', 'Aucune chaîne suivie pour ce serveur.')] });
      return;
    }
    const lines = subs.map((s: any) => `• \`${s.channelId}\``).join('\n');
    await interaction.editReply({ embeds: [infoEmbed('Chaînes suivies', lines)] });
    return;
  }
}
