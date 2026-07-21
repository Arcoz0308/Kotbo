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
  .setName('leveling')
  .setDescription("⚙️ Gérer l'XP et les niveaux des membres")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommandGroup(group =>
    group
      .setName('xp')
      .setDescription("Gérer l'XP d'un membre")
      .addSubcommand(sub =>
        sub
          .setName('add')
          .setDescription("Ajouter de l'XP à un membre")
          .addUserOption(option => option.setName('membre').setDescription('Le membre cible').setRequired(true))
          .addIntegerOption(option => option.setName('montant').setDescription("Montant d'XP à ajouter").setRequired(true).setMinValue(1))
      )
      .addSubcommand(sub =>
        sub
          .setName('remove')
          .setDescription("Retirer de l'XP à un membre")
          .addUserOption(option => option.setName('membre').setDescription('Le membre cible').setRequired(true))
          .addIntegerOption(option => option.setName('montant').setDescription("Montant d'XP à retirer").setRequired(true).setMinValue(1))
      )
      .addSubcommand(sub =>
        sub
          .setName('set')
          .setDescription("Fixer l'XP totale d'un membre")
          .addUserOption(option => option.setName('membre').setDescription('Le membre cible').setRequired(true))
          .addIntegerOption(option => option.setName('montant').setDescription("Nouvelle valeur d'XP totale").setRequired(true).setMinValue(0))
      )
      .addSubcommand(sub =>
        sub
          .setName('voir')
          .setDescription("Voir l'XP, le niveau et le rang d'un membre")
          .addUserOption(option => option.setName('membre').setDescription('Le membre cible').setRequired(true))
      )
      .addSubcommand(sub =>
        sub
          .setName('reset')
          .setDescription("Réinitialiser l'XP et le niveau d'un membre à zéro")
          .addUserOption(option => option.setName('membre').setDescription('Le membre cible').setRequired(true))
      )
  )
  .addSubcommandGroup(group =>
    group
      .setName('level')
      .setDescription("Gérer le niveau d'un membre")
      .addSubcommand(sub =>
        sub
          .setName('add')
          .setDescription('Ajouter des niveaux à un membre')
          .addUserOption(option => option.setName('membre').setDescription('Le membre cible').setRequired(true))
          .addIntegerOption(option => option.setName('montant').setDescription('Nombre de niveaux à ajouter').setRequired(true).setMinValue(1))
      )
      .addSubcommand(sub =>
        sub
          .setName('remove')
          .setDescription('Retirer des niveaux à un membre')
          .addUserOption(option => option.setName('membre').setDescription('Le membre cible').setRequired(true))
          .addIntegerOption(option => option.setName('montant').setDescription('Nombre de niveaux à retirer').setRequired(true).setMinValue(1))
      )
      .addSubcommand(sub =>
        sub
          .setName('set')
          .setDescription("Fixer le niveau d'un membre")
          .addUserOption(option => option.setName('membre').setDescription('Le membre cible').setRequired(true))
          .addIntegerOption(option => option.setName('niveau').setDescription('Niveau cible').setRequired(true).setMinValue(0))
      )
      .addSubcommand(sub =>
        sub
          .setName('voir')
          .setDescription("Voir l'XP, le niveau et le rang d'un membre")
          .addUserOption(option => option.setName('membre').setDescription('Le membre cible').setRequired(true))
      )
      .addSubcommand(sub =>
        sub
          .setName('reset')
          .setDescription("Réinitialiser l'XP et le niveau d'un membre à zéro")
          .addUserOption(option => option.setName('membre').setDescription('Le membre cible').setRequired(true))
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

  const group = interaction.options.getSubcommandGroup(true) as 'xp' | 'level';
  const subcommand = interaction.options.getSubcommand(true);
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
    if (subcommand === 'voir') {
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
      return;
    }

    if (subcommand === 'reset') {
      await setXp(guildId, targetUser.id, 0, interaction.client);

      await interaction.reply({
        ...v2(successContainer(
          'Progression réinitialisée',
          `L'XP et le niveau de <@${targetUser.id}> ont été réinitialisés à zéro.`
        )),
        flags: MessageFlags.IsComponentsV2,
      });
      return;
    }

    if (group === 'xp') {
      const amount = interaction.options.getInteger('montant', true);

      if (subcommand === 'add' || subcommand === 'remove') {
        const delta = subcommand === 'add' ? amount : -amount;
        await addXp(guildId, targetUser.id, delta, interaction.client);
        const updated = await prisma.memberLevel.findUnique({
          where: { guildId_userId: { guildId, userId: targetUser.id } },
          select: { xp: true, level: true },
        });

        await interaction.reply({
          ...v2(successContainer(
            subcommand === 'add' ? 'XP ajoutée' : 'XP retirée',
            `${subcommand === 'add' ? 'Ajouté' : 'Retiré'} **${amount}** ${E.xp} à <@${targetUser.id}>.\n\n` +
            `**Niveau actuel :** ${E.level} ${updated?.level ?? 0}\n` +
            `**XP totale :** ${(updated?.xp ?? 0).toLocaleString('fr-FR')}`
          )),
          flags: MessageFlags.IsComponentsV2,
        });
      } else if (subcommand === 'set') {
        const result = await setXp(guildId, targetUser.id, amount, interaction.client);

        await interaction.reply({
          ...v2(successContainer(
            'XP mise à jour',
            `L'XP totale de <@${targetUser.id}> est maintenant de **${result.xp.toLocaleString('fr-FR')}**.\n\n` +
            `**Nouveau niveau :** ${E.level} ${result.level}`
          )),
          flags: MessageFlags.IsComponentsV2,
        });
      }
    } else if (group === 'level') {
      if (subcommand === 'add' || subcommand === 'remove') {
        const amount = interaction.options.getInteger('montant', true);
        const rankData = await getMemberRankData(guildId, targetUser.id);
        const targetLevel = Math.max(0, rankData.level + (subcommand === 'add' ? amount : -amount));
        const targetXp = getXpForLevel(targetLevel - 1);
        const result = await setXp(guildId, targetUser.id, targetXp, interaction.client);

        await interaction.reply({
          ...v2(successContainer(
            subcommand === 'add' ? 'Niveaux ajoutés' : 'Niveaux retirés',
            `<@${targetUser.id}> est maintenant au niveau ${E.level} **${result.level}** (${result.xp.toLocaleString('fr-FR')} XP).`
          )),
          flags: MessageFlags.IsComponentsV2,
        });
      } else if (subcommand === 'set') {
        const level = interaction.options.getInteger('niveau', true);
        const targetXp = getXpForLevel(level - 1);
        const result = await setXp(guildId, targetUser.id, targetXp, interaction.client);

        await interaction.reply({
          ...v2(successContainer(
            'Niveau mis à jour',
            `<@${targetUser.id}> est maintenant au niveau ${E.level} **${result.level}** (${result.xp.toLocaleString('fr-FR')} XP).`
          )),
          flags: MessageFlags.IsComponentsV2,
        });
      }
    }
  } catch (err: unknown) {
    await interaction.reply({
      ...v2(errorContainer('Erreur', err instanceof Error ? err.message : "Une erreur est survenue lors de la gestion de l'XP.")),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }
}

export const levelingCommand = { data, execute } satisfies SlashCommandDefinition;
