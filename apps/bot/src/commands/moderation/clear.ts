import type { SlashCommandDefinition } from '../../commands.js';
import { Collection, SlashCommandBuilder, PermissionFlagsBits, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';

const data = new SlashCommandBuilder()
  .setName('clear')
  .setDescription('🧹 Supprime un nombre défini de messages dans le salon')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addIntegerOption((option) =>
    option
      .setName('nombre')
      .setDescription('Nombre de messages à supprimer (1 à 100)')
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(100),
  )
  .addUserOption((option) =>
    option
      .setName('membre')
      .setDescription('Filtrer et supprimer uniquement les messages de ce membre')
      .setRequired(false),
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const amount = interaction.options.getInteger('nombre', true);
  const targetUser = interaction.options.getUser('membre');
  const channel = interaction.channel;

  if (!channel || channel.isDMBased() || !('messages' in channel)) {
    await interaction.reply({
      embeds: [errorEmbed('Action impossible', 'Cette commande ne peut être exécutée que dans un salon textuel de serveur.')],
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  try {
    // Récupérer les messages (on en prend un peu plus si on filtre par utilisateur pour essayer de remplir le quota)
    const limit = targetUser ? Math.min(100, amount * 2) : amount;
    const fetchedMessages = await channel.messages.fetch({ limit });

    let messagesToDelete = fetchedMessages;

    // Filtrer par membre si spécifié
    if (targetUser) {
      // `.first(amount)` renvoie un tableau ; on reconstruit une Collection pour
      // conserver `.size` et bulkDelete plus bas.
      const filtered = fetchedMessages.filter((m) => m.author.id === targetUser.id);
      messagesToDelete = new Collection(filtered.first(amount).map((m) => [m.id, m] as const));
    }

    // Filtrer les messages de moins de 14 jours (limite de l'API de bulkDelete de Discord)
    const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const deletableMessages = messagesToDelete.filter((m) => m.createdTimestamp > fourteenDaysAgo);

    if (deletableMessages.size === 0) {
      await interaction.editReply({
        embeds: [
          errorEmbed(
            'Aucun message supprimable',
            'Aucun message ne correspond aux critères de suppression ou ils sont tous datés de plus de 14 jours.',
          ),
        ],
      });
      return;
    }

    const deleted = await channel.bulkDelete(deletableMessages, true);

    await interaction.editReply({
      embeds: [
        successEmbed(
          'Nettoyage effectué',
          `Suppression de **${deleted.size}** message(s)${targetUser ? ` de ${targetUser}` : ''} effectuée avec succès.`,
        ),
      ],
    });
  } catch (error) {
    await interaction.editReply({
      embeds: [
        errorEmbed(
          'Erreur',
          `Impossible de supprimer les messages : ${error instanceof Error ? error.message : String(error)}`,
        ),
      ],
    });
  }
}

export const clearCommand = { data, execute } satisfies SlashCommandDefinition;
