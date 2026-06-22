import type { SlashCommandDefinition } from '../../commands.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';

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
