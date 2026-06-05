import {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type UserContextMenuCommandInteraction,
  type Client,
  type User
} from 'discord.js';
import type { SlashCommandDefinition, ContextCommandDefinition } from '../commands.js';
import { errorEmbed, successEmbed, COLORS } from '../utils/embeds.js';

const data = new SlashCommandBuilder()
  .setName('signal')
  .setDescription('🚨 Signale un utilisateur Discord à l\'administrateur du bot')
  .addUserOption((option) =>
    option
      .setName('membre')
      .setDescription('L\'utilisateur à signaler')
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName('raison')
      .setDescription('Raison/motif du signalement')
      .setRequired(true)
      .setMaxLength(1000),
  );

const contextData = new ContextMenuCommandBuilder()
  .setName('Signaler cet utilisateur')
  .setType(ApplicationCommandType.User);

export async function sendReportToAdmin(params: {
  client: Client;
  reporter: User;
  target: User;
  reason: string;
  guildName: string;
  guildId: string;
}): Promise<boolean> {
  const ownerId = process.env.DISCORD_CLIENT_OWNER_ID;
  if (!ownerId) {
    console.error('DISCORD_CLIENT_OWNER_ID non configuré.');
    return false;
  }

  try {
    const owner = await params.client.users.fetch(ownerId);
    if (!owner) return false;

    const embed = new EmbedBuilder()
      .setColor(COLORS.warning)
      .setTitle('🚨 Nouveau signalement d\'utilisateur')
      .setDescription(`Un utilisateur a été signalé via le bot.`)
      .addFields(
        { name: 'Cible (Utilisateur signalé)', value: `${params.target} (\`${params.target.id}\` - @${params.target.username})`, inline: false },
        { name: 'Auteur du signalement', value: `${params.reporter} (\`${params.reporter.id}\` - @${params.reporter.username})`, inline: false },
        { name: 'Serveur (Guild)', value: `${params.guildName} (\`${params.guildId}\`)`, inline: false },
        { name: 'Raison', value: params.reason, inline: false }
      )
      .setTimestamp();

    await owner.send({ embeds: [embed] });
    return true;
  } catch (error) {
    console.error('Erreur lors de l\'envoi du signalement à l\'admin:', error);
    return false;
  }
}

async function executeSlash(interaction: ChatInputCommandInteraction): Promise<void> {
  const targetUser = interaction.options.getUser('membre', true);
  const reason = interaction.options.getString('raison', true);

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const guild = interaction.guild;
  const success = await sendReportToAdmin({
    client: interaction.client,
    reporter: interaction.user,
    target: targetUser,
    reason,
    guildName: guild?.name ?? 'Message Privé',
    guildId: guild?.id ?? 'N/A',
  });

  if (success) {
    await interaction.editReply({
      embeds: [successEmbed('Signalement envoyé', `L'utilisateur ${targetUser} a été signalé avec succès à l'administrateur du bot.`)],
    });
  } else {
    await interaction.editReply({
      embeds: [errorEmbed('Échec de l\'envoi', 'Impossible de transmettre le signalement à l\'administrateur du bot.')],
    });
  }
}

async function executeContext(interaction: UserContextMenuCommandInteraction): Promise<void> {
  const targetUser = interaction.targetUser;

  const modal = new ModalBuilder()
    .setCustomId(`modal:signal:${targetUser.id}`)
    .setTitle(`Signaler : ${targetUser.username.slice(0, 20)}`);

  const reasonInput = new TextInputBuilder()
    .setCustomId('raison')
    .setLabel('Raison du signalement')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Expliquez pourquoi vous signalez cet utilisateur...')
    .setRequired(true)
    .setMaxLength(1000);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput));

  await interaction.showModal(modal);
}

export const signalCommand = { data, execute: executeSlash } satisfies SlashCommandDefinition;
export const signalContextCommand = { data: contextData, execute: executeContext } satisfies ContextCommandDefinition;
