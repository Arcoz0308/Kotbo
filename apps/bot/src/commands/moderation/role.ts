import type { SlashCommandDefinition } from '../../commands.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { roleGrantsAdministrator } from '../../services/moderation/adminLockService.js';

const MAX_MENTIONS = 20;

const data = new SlashCommandBuilder()
  .setName('role')
  .setDescription('🎭 Gère les rôles des membres en masse')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('Ajoute un rôle à plusieurs membres')
      .addRoleOption((option) =>
        option.setName('role').setDescription('Le rôle à ajouter').setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName('membres')
          .setDescription('Mentionnez les membres (ex: @user1 @user2 @user3)')
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('Retire un rôle à plusieurs membres')
      .addRoleOption((option) =>
        option.setName('role').setDescription('Le rôle à retirer').setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName('membres')
          .setDescription('Mentionnez les membres (ex: @user1 @user2 @user3)')
          .setRequired(true),
      ),
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand() as 'add' | 'remove';
  const role = interaction.options.getRole('role', true);
  const membresRaw = interaction.options.getString('membres', true);
  const guild = interaction.guild;

  if (!guild) {
    await interaction.reply({
      embeds: [errorEmbed('Action impossible', 'Cette commande ne peut être utilisée que dans un serveur.')],
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const userIds = [...new Set(membresRaw.match(/<@!?(\d+)>/g)?.map((m) => m.replace(/<@!?/, '').replace(/>/, '')) ?? [])];

  if (userIds.length === 0) {
    await interaction.reply({
      embeds: [errorEmbed('Aucun membre', 'Vous devez mentionner au moins un membre.')],
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  if (userIds.length > MAX_MENTIONS) {
    await interaction.reply({
      embeds: [errorEmbed('Trop de membres', `Vous ne pouvez pas cibler plus de ${MAX_MENTIONS} membres à la fois.`)],
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const botMember = guild.members.me;
  if (!botMember) {
    await interaction.reply({
      embeds: [errorEmbed('Erreur', 'Impossible de récupérer les informations du bot.')],
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const guildRole = guild.roles.cache.get(role.id);
  if (!guildRole || guildRole.managed) {
    await interaction.reply({
      embeds: [errorEmbed('Rôle invalide', 'Ce rôle ne peut pas être géré (rôle intégré ou géré par une intégration).')],
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  if (guildRole.position >= botMember.roles.highest.position) {
    await interaction.reply({
      embeds: [errorEmbed('Permission insuffisante', 'Ce rôle est supérieur ou égal au rôle le plus élevé du bot.')],
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  // Admin Permission Lock — un octroi de rôle donnant ADMINISTRATOR peut être
  // bloqué et transformé en demande d'approbation (owner / rôles sécurité).
  if (subcommand === 'add' && roleGrantsAdministrator(guildRole.permissions.bitfield)) {
    const { guardAdminGrant } = await import('../../services/moderation/adminLockService.js');

    const pendingUserIds: string[] = [];
    const nonBlockedUserIds: string[] = [];
    for (const userId of userIds) {
      const result = await guardAdminGrant({
        client: interaction.client,
        guild,
        actorId: interaction.user.id,
        requestedByTag: interaction.user.tag,
        requestedVia: 'SLASH_COMMAND',
        type: 'MEMBER_ROLE_GRANT',
        permissionBits: guildRole.permissions.bitfield,
        targetRoleId: guildRole.id,
        targetRoleName: guildRole.name,
        targetMemberId: userId,
      });
      if (result.blocked) pendingUserIds.push(userId);
      else nonBlockedUserIds.push(userId);
    }

    if (pendingUserIds.length > 0) {
      const lines = ['🔒 Ce rôle donne la permission **ADMINISTRATOR**.'];
      lines.push(
        `**${pendingUserIds.length}** demande(s) d'approbation envoyée(s) au propriétaire du serveur / rôles sécurité pour : ${pendingUserIds.map((id) => `<@${id}>`).join(', ')}.`,
      );
      if (nonBlockedUserIds.length > 0) {
        for (const userId of nonBlockedUserIds) {
          await guild.members.fetch(userId).then((m) => m.roles.add(guildRole)).catch(() => null);
        }
        lines.push(
          `**${nonBlockedUserIds.length}** attribution(s) appliquée(s) directement (vous êtes propriétaire du serveur ou rôle sécurité) : ${nonBlockedUserIds.map((id) => `<@${id}>`).join(', ')}.`,
        );
      }
      await interaction.editReply({ embeds: [successEmbed("Demande(s) envoyée(s)", lines.join('\n\n'))] });
      return;
    }
    // Personne bloqué (acteur owner/bypass, ou fonctionnalité désactivée) → flux normal ci-dessous.
  }

  const succeeded: string[] = [];
  const failed: string[] = [];

  for (const userId of userIds) {
    try {
      const member = await guild.members.fetch(userId);
      if (subcommand === 'add') {
        await member.roles.add(guildRole);
      } else {
        await member.roles.remove(guildRole);
      }
      succeeded.push(`<@${userId}>`);
    } catch {
      failed.push(`<@${userId}>`);
    }
  }

  const action = subcommand === 'add' ? 'ajouté à' : 'retiré de';
  const lines: string[] = [];

  if (succeeded.length > 0) {
    lines.push(`Rôle ${guildRole} ${action} **${succeeded.length}** membre(s) : ${succeeded.join(', ')}`);
  }
  if (failed.length > 0) {
    lines.push(`Échec pour **${failed.length}** membre(s) : ${failed.join(', ')}`);
  }

  const embed = failed.length === 0
    ? successEmbed('Rôles mis à jour', lines.join('\n\n'))
    : errorEmbed('Rôles partiellement mis à jour', lines.join('\n\n'));

  await interaction.editReply({ embeds: [embed] });
}

export const roleCommand = { data, execute } satisfies SlashCommandDefinition;
