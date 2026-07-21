import type { SlashCommandDefinition } from '../../commands.js';
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
  MessageFlags,
  ContainerBuilder,
} from 'discord.js';
import prisma from '../../utils/db.js';
import { text, successContainer, errorContainer, v2, COLORS_RAW } from '../../utils/embeds.js';
import { E } from '../../utils/emojis.js';
import {
  addXp,
  setXp,
  getMemberRankData,
  getXpForLevel,
} from '../../services/progression/levelingService.js';

const data = new SlashCommandBuilder()
  .setName('xp')
  .setDescription('⚙️ Gérer l\'XP et les niveaux des membres')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sub =>
    sub
      .setName('give')
      .setDescription("Donner de l'XP à un membre")
      .addUserOption(option =>
        option.setName('membre').setDescription('Le membre cible').setRequired(true)
      )
      .addIntegerOption(option =>
        option.setName('montant').setDescription("Montant d'XP à ajouter").setRequired(true).setMinValue(1)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('remove')
      .setDescription("Retirer de l'XP à un membre")
      .addUserOption(option =>
        option.setName('membre').setDescription('Le membre cible').setRequired(true)
      )
      .addIntegerOption(option =>
        option.setName('montant').setDescription("Montant d'XP à retirer").setRequired(true).setMinValue(1)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('set')
      .setDescription("Fixer l'XP totale d'un membre à une valeur précise")
      .addUserOption(option =>
        option.setName('membre').setDescription('Le membre cible').setRequired(true)
      )
      .addIntegerOption(option =>
        option.setName('montant').setDescription("Nouvelle valeur d'XP totale").setRequired(true).setMinValue(0)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('set-level')
      .setDescription("Fixer directement le niveau d'un membre")
      .addUserOption(option =>
        option.setName('membre').setDescription('Le membre cible').setRequired(true)
      )
      .addIntegerOption(option =>
        option.setName('niveau').setDescription('Niveau cible').setRequired(true).setMinValue(0)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('reset')
      .setDescription("Réinitialiser l'XP et le niveau d'un membre à zéro")
      .addUserOption(option =>
        option.setName('membre').setDescription('Le membre cible').setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('voir')
      .setDescription("Voir l'XP, le niveau et le rang d'un membre")
      .addUserOption(option =>
        option.setName('membre').setDescription('Le membre cible').setRequired(true)
      )
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      ...v2(errorContainer('Erreur', 'Cette commande doit être utilisée dans un serveur.')),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  const targetUser = interaction.options.getUser('membre', true);

  if (targetUser.bot) {
    await interaction.reply({
      ...v2(errorContainer('Erreur', "Impossible de gérer l'XP d'un bot.")),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    return;
  }

  await prisma.guild.upsert({ where: { id: guildId }, update: {}, create: { id: guildId } });

  try {
    if (subcommand === 'give' || subcommand === 'remove') {
      const rawAmount = interaction.options.getInteger('montant', true);
      const delta = subcommand === 'give' ? rawAmount : -rawAmount;

      await addXp(guildId, targetUser.id, delta, interaction.client);
      const updated = await prisma.memberLevel.findUnique({
        where: { guildId_userId: { guildId, userId: targetUser.id } },
        select: { xp: true, level: true },
      });

      await interaction.reply({
        ...v2(successContainer(
          subcommand === 'give' ? 'XP ajoutée' : 'XP retirée',
          `${subcommand === 'give' ? 'Ajouté' : 'Retiré'} **${rawAmount}** ${E.xp} à <@${targetUser.id}>.\n\n` +
          `**Niveau actuel :** ${E.level} ${updated?.level ?? 0}\n` +
          `**XP totale :** ${(updated?.xp ?? 0).toLocaleString('fr-FR')}`
        )),
        flags: MessageFlags.IsComponentsV2,
      });
    } else if (subcommand === 'set') {
      const amount = interaction.options.getInteger('montant', true);
      const result = await setXp(guildId, targetUser.id, amount, interaction.client);

      await interaction.reply({
        ...v2(successContainer(
          'XP mise à jour',
          `L'XP totale de <@${targetUser.id}> est maintenant de **${result.xp.toLocaleString('fr-FR')}**.\n\n` +
          `**Nouveau niveau :** ${E.level} ${result.level}`
        )),
        flags: MessageFlags.IsComponentsV2,
      });
    } else if (subcommand === 'set-level') {
      const level = interaction.options.getInteger('niveau', true);
      const targetXp = getXpForLevel(level);
      const result = await setXp(guildId, targetUser.id, targetXp, interaction.client);

      await interaction.reply({
        ...v2(successContainer(
          'Niveau mis à jour',
          `<@${targetUser.id}> est maintenant au niveau ${E.level} **${result.level}** (${result.xp.toLocaleString('fr-FR')} XP).`
        )),
        flags: MessageFlags.IsComponentsV2,
      });
    } else if (subcommand === 'reset') {
      await setXp(guildId, targetUser.id, 0, interaction.client);

      await interaction.reply({
        ...v2(successContainer(
          'Progression réinitialisée',
          `L'XP et le niveau de <@${targetUser.id}> ont été réinitialisés à zéro.`
        )),
        flags: MessageFlags.IsComponentsV2,
      });
    } else if (subcommand === 'voir') {
      const rankData = await getMemberRankData(guildId, targetUser.id);

      const container = new ContainerBuilder()
        .setAccentColor(COLORS_RAW.info)
        .addTextDisplayComponents(text(`### ${E.level} Progression de <@${targetUser.id}>`))
        .addTextDisplayComponents(text(
          `**Niveau :** ${rankData.level}\n` +
          `**Rang :** #${rankData.rank}\n` +
          `**XP totale :** ${rankData.totalXp.toLocaleString('fr-FR')}\n` +
          `**XP dans le niveau actuel :** ${rankData.xpInCurrentLevel.toLocaleString('fr-FR')} / ${rankData.xpRequiredForNextLevel.toLocaleString('fr-FR')}`
        ));

      await interaction.reply({
        ...v2(container),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }
  } catch (err: unknown) {
    await interaction.reply({
      ...v2(errorContainer('Erreur', err instanceof Error ? err.message : "Une erreur est survenue lors de la gestion de l'XP.")),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }
}

export const xpCommand = { data, execute } satisfies SlashCommandDefinition;
