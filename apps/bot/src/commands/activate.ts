import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';
import prisma from '../utils/db.js';
import { successEmbed, errorEmbed } from '../utils/embeds.js';
import { isGuildActivated, activateGuild } from '../utils/activation.js';

export const data = new SlashCommandBuilder()
  .setName('activate')
  .setDescription('🔑 Activer le bot sur ce serveur à l\'aide d\'un code d\'activation')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((option) =>
    option
      .setName('code')
      .setDescription('Le code d\'activation fourni par l\'administrateur global')
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) {
    return interaction.reply({
      content: '❌ Cette commande ne peut être exécutée que sur un serveur.',
      flags: [MessageFlags.Ephemeral],
    });
  }

  // Check if already activated
  if (isGuildActivated(guildId)) {
    return interaction.reply({
      embeds: [
        errorEmbed('Déjà activé', 'Ce serveur est déjà activé et pleinement opérationnel !'),
      ],
      flags: [MessageFlags.Ephemeral],
    });
  }

  const codeStr = interaction.options.getString('code', true).trim().toUpperCase();

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  try {
    // Look up code in DB
    const activationCode = await prisma.activationCode.findFirst({
      where: {
        code: codeStr,
        isActive: true,
        usedByGuildId: null,
      },
    });

    if (!activationCode) {
      return interaction.editReply({
        embeds: [
          errorEmbed(
            'Code Invalide',
            'Le code d\'activation fourni est invalide, expiré ou déjà utilisé.'
          ),
        ],
      });
    }

    // Activate
    await activateGuild(guildId, codeStr);

    await interaction.editReply({
      embeds: [
        successEmbed(
          '🎉 Serveur Activé !',
          `Kotbo a été activé avec succès sur votre serveur !\n\nToutes les fonctionnalités (modération, police du code, logs avancés, dashboard) sont désormais déverrouillées et opérationnelles.`
        ),
      ],
    });
  } catch (error) {
    console.error('Command activate error:', error);
    await interaction.editReply({
      embeds: [
        errorEmbed(
          'Erreur Système',
          'Une erreur est survenue lors de l\'activation de votre serveur. Veuillez contacter un administrateur.'
        ),
      ],
    });
  }
}
