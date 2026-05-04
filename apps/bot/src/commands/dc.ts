import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import * as altAccountService from '../services/altAccountService.js';
import prisma from '../utils/db.js';
import { COLORS, successEmbed, errorEmbed, infoEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('dc')
  .setDescription('Gestion des doubles comptes et liaisons.')
  .addSubcommand((sub) =>
    sub
      .setName('link')
      .setDescription('Lier manuellement deux comptes (Modérateur uniquement).')
      .addUserOption((opt) => opt.setName('compte1').setDescription('Premier compte').setRequired(true))
      .addUserOption((opt) => opt.setName('compte2').setDescription('Deuxième compte').setRequired(true))
  )
  .addSubcommand((sub) =>
    sub
      .setName('list')
      .setDescription('Lister les comptes liés à un utilisateur.')
      .addUserOption((opt) => opt.setName('cible').setDescription('Utilisateur à vérifier').setRequired(true))
  )
  .addSubcommand((sub) =>
    sub
      .setName('report')
      .setDescription('Déclarer que vous avez un autre compte (bonne foi).')
      .addUserOption((opt) => opt.setName('principal').setDescription('Votre compte principal').setRequired(true))
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'link') {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply({ content: '❌ Tu n’as pas la permission de modération requise.', flags: [MessageFlags.Ephemeral] });
    }

    const u1 = interaction.options.getUser('compte1', true);
    const u2 = interaction.options.getUser('compte2', true);

    if (u1.id === u2.id) {
      return interaction.reply({ content: '❌ Impossible de lier un compte à lui-même.', flags: [MessageFlags.Ephemeral] });
    }

    await altAccountService.linkAccounts({
      guildId: interaction.guildId!,
      user1Id: u1.id,
      user2Id: u2.id,
      type: 'MANUAL',
      status: 'VALIDATED',
      metadata: { linkedBy: interaction.user.id, at: new Date().toISOString() }
    });

    return interaction.reply({
      embeds: [successEmbed('Comptes liés', `Les comptes <@${u1.id}> et <@${u2.id}> sont désormais liés et synchronisés.`) ]
    });
  }

  if (subcommand === 'list') {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply({ content: '❌ Tu n’as pas la permission de modération requise.', flags: [MessageFlags.Ephemeral] });
    }

    const target = interaction.options.getUser('cible', true);
    const linkedIds = await altAccountService.getAllLinkedUserIds(interaction.guildId!, target.id);

    if (linkedIds.length <= 1) {
      return interaction.reply({ content: `ℹ️ Aucun compte lié trouvé pour <@${target.id}>.`, flags: [MessageFlags.Ephemeral] });
    }

    const others = linkedIds.filter(id => id !== target.id);
    const embed = infoEmbed('Comptes liés', `Liste des comptes associés à <@${target.id}> :`)
      .addFields({ name: 'Comptes associés', value: others.map(id => `<@${id}> (${id})`).join('\n') });

    return interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
  }

  if (subcommand === 'report') {
    const mainAccount = interaction.options.getUser('principal', true);

    if (mainAccount.id === interaction.user.id) {
      return interaction.reply({ content: '❌ Tu ne peux pas te signaler toi-même comme ton propre compte principal.', flags: [MessageFlags.Ephemeral] });
    }

    // Send to staff for validation
    const guild = interaction.guild;
    if (!guild) return;

    const dbGuild = await prisma.guild.findUnique({ where: { id: guild.id } });
    const logChannelId = dbGuild?.logChannelId;

    if (!logChannelId) {
      return interaction.reply({ content: '❌ Le système de logs n’est pas configuré. Contacte un administrateur.', flags: [MessageFlags.Ephemeral] });
    }

    const logChannel = await guild.channels.fetch(logChannelId).catch(() => null);
    if (!logChannel || !logChannel.isTextBased()) {
      return interaction.reply({ content: '❌ Salon de logs introuvable.', flags: [MessageFlags.Ephemeral] });
    }

    const embed = new EmbedBuilder()
      .setColor(COLORS.info)
      .setTitle('🛡️ Déclaration de compte secondaire (Bonne foi)')
      .setDescription(`<@${interaction.user.id}> déclare que son compte principal est <@${mainAccount.id}>.`)
      .addFields(
        { name: 'Compte secondaire', value: `<@${interaction.user.id}> (${interaction.user.id})`, inline: true },
        { name: 'Compte principal', value: `<@${mainAccount.id}> (${mainAccount.id})`, inline: true }
      )
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`dc_validate_link:${interaction.user.id}:${mainAccount.id}`)
        .setLabel('Valider la liaison')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`dc_reject_link:${interaction.user.id}:${mainAccount.id}`)
        .setLabel('Rejeter')
        .setStyle(ButtonStyle.Danger)
    );

    await logChannel.send({ embeds: [embed], components: [row] });

    return interaction.reply({
      content: '✅ Ta déclaration a été envoyée aux modérateurs pour validation. Merci de ta bonne foi !',
      flags: [MessageFlags.Ephemeral]
    });
  }
}
