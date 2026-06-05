import type { SlashCommandDefinition } from '../../commands.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';

const data = new SlashCommandBuilder()
  .setName('channel')
  .setDescription('📁 Gère les salons du serveur')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addSubcommand((sub) =>
    sub
      .setName('clear')
      .setDescription('Supprimer et re-créer un salon pour vider ses messages'),
  )
  .addSubcommand((sub) =>
    sub
      .setName('duplicate')
      .setDescription('Dupliquer un salon')
      .addChannelOption((option) =>
        option
          .setName('salon')
          .setDescription('Le salon à dupliquer (par défaut : le salon actuel)')
          .setRequired(false),
      )
      .addStringOption((option) =>
        option
          .setName('nom')
          .setDescription('Le nouveau nom du salon dupliqué')
          .setRequired(false),
      ),
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  const channel = interaction.channel;
  const guild = interaction.guild;

  if (!guild || !channel) {
    await interaction.reply({
      embeds: [errorEmbed('Action impossible', 'Cette commande doit être exécutée dans un serveur.')],
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  if (subcommand === 'clear') {
    const currentGuildChannel = guild.channels.cache.get(channel.id);
    if (!currentGuildChannel || !('clone' in currentGuildChannel) || !currentGuildChannel.deletable) {
      await interaction.reply({
        embeds: [errorEmbed('Action impossible', 'Ce type de salon ne peut pas être nettoyé/recréé.')],
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    try {
      // 1. Envoyer une réponse d'attente éphémère
      await interaction.reply({
        content: '⚙️ Nettoyage du salon en cours...',
        flags: [MessageFlags.Ephemeral],
      }).catch(() => null);

      // 2. Cloner le salon avec la même position et configurations
      const position = currentGuildChannel.position;
      const cloned = await (currentGuildChannel as any).clone({
        position,
        reason: `Salon nettoyé par ${interaction.user.tag} (commande /channel clear)`,
      });

      // 3. Supprimer l'ancien salon
      await currentGuildChannel.delete(`Salon nettoyé par ${interaction.user.tag} (commande /channel clear)`);

      // 4. Envoyer un message dans le nouveau salon pour informer
      await cloned.send({
        embeds: [
          successEmbed(
            'Salon nettoyé',
            `Ce salon a été nettoyé avec succès. (Toutes les configurations d'origine ont été conservées)`
          ).setFooter({ text: `Nettoyé par ${interaction.user.tag}` }),
        ],
      });
    } catch (error) {
      await interaction.reply({
        embeds: [
          errorEmbed(
            'Erreur',
            `Une erreur est survenue lors du nettoyage du salon : ${error instanceof Error ? error.message : String(error)}`
          ),
        ],
        flags: [MessageFlags.Ephemeral],
      }).catch(() => null);
    }
    return;
  }

  if (subcommand === 'duplicate') {
    const targetChannelOption = interaction.options.getChannel('salon');
    const targetGuildChannel = targetChannelOption
      ? (guild.channels.cache.get(targetChannelOption.id) || await guild.channels.fetch(targetChannelOption.id).catch(() => null))
      : guild.channels.cache.get(channel.id);

    const newName = interaction.options.getString('nom');

    if (!targetGuildChannel || !('clone' in targetGuildChannel)) {
      await interaction.reply({
        embeds: [errorEmbed('Action impossible', 'Le salon ciblé ne peut pas être dupliqué.')],
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    try {
      const finalName = newName || `${(targetGuildChannel as any).name}-copy`;
      const cloned = await (targetGuildChannel as any).clone({
        name: finalName,
        reason: `Salon dupliqué par ${interaction.user.tag} (commande /channel duplicate)`,
      });

      await interaction.editReply({
        embeds: [
          successEmbed(
            'Salon dupliqué',
            `Le salon ${targetGuildChannel} a été dupliqué avec succès en ${cloned}.`
          ),
        ],
      });
    } catch (error) {
      await interaction.editReply({
        embeds: [
          errorEmbed(
            'Erreur',
            `Une erreur est survenue lors de la duplication : ${error instanceof Error ? error.message : String(error)}`
          ),
        ],
      });
    }
  }
}

export const channelCommand = { data, execute } satisfies SlashCommandDefinition;
