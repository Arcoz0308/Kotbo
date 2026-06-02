import type { SlashCommandDefinition } from '../commands.js';
import { SlashCommandBuilder, AttachmentBuilder, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { getMemberRankData, generateRankCard } from '../services/levelingService.js';
import { extractTrackingInfo, resolveModuleFromCommand, wrapModuleTracking } from '../utils/moduleTracking.js';

const data = new SlashCommandBuilder()
  .setName('rank')
  .setDescription('⭐ Affiche votre carte de niveau et d\'expérience')
  .addUserOption((option) =>
    option
      .setName('membre')
      .setDescription('Membre à afficher (par défaut: vous)')
      .setRequired(false)
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const { guildId, userId } = extractTrackingInfo(interaction);
  const moduleName = resolveModuleFromCommand('rank');

  // Wrapper pour tracker les performances et l'utilisation
  await wrapModuleTracking(
    moduleName,
    executeInternal,
    [interaction],
    {
      actionType: 'command',
      actionName: 'rank',
      guildId,
      userId,
    }
  );
}

async function executeInternal(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: '❌ Cette commande doit être utilisée sur un serveur.',
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await interaction.deferReply();

  const targetUser = interaction.options.getUser('membre') || interaction.user;
  const member = await interaction.guild?.members.fetch(targetUser.id).catch(() => null);
  if (!member) {
    await interaction.editReply('❌ Impossible de trouver ce membre sur le serveur.');
    return;
  }

  try {
    const rankData = await getMemberRankData(guildId, targetUser.id);
    const imageBuffer = await generateRankCard(member, rankData.level, rankData.xp, rankData.rank);
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'rank-card.png' });

    await interaction.editReply({
      files: [attachment],
    });
  } catch (err) {
    await interaction.editReply('❌ Une erreur est survenue lors de la génération de la carte de niveau.');
  }
}

export const rankCommand = { data, execute } satisfies SlashCommandDefinition;
