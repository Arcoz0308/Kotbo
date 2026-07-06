import {
  SlashCommandBuilder,
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { COLORS_RAW, text, successContainer, errorContainer } from '../../utils/embeds.js';
import { E, buildProgressBar } from '../../utils/emojis.js';
import { getAvailableQuests, claimQuestReward } from '../../services/community/questService.js';
import type { SlashCommandDefinition } from '../../commands.js';

const data = new SlashCommandBuilder()
  .setName('quests')
  .setDescription('Système de quêtes')
  .addSubcommand((sub) =>
    sub.setName('list')
      .setDescription('Voir les quêtes disponibles'))
  .addSubcommand((sub) =>
    sub.setName('claim')
      .setDescription('Réclamer la récompense d\'une quête terminée')
      .addStringOption((opt) => opt.setName('quete').setDescription('ID de la quête').setRequired(true)));

async function execute(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;
  const userId = interaction.user.id;

  if (subcommand === 'list') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const quests = await getAvailableQuests(guildId, userId);

    if (quests.length === 0) {
      const container = new ContainerBuilder()
        .setAccentColor(COLORS_RAW.dark)
        .addTextDisplayComponents(text(`### ${E.fire} Quêtes`))
        .addTextDisplayComponents(text(`${E.info} Aucune quête disponible pour le moment.`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(text(`-# ${E.kotbo} Kotbo · Quêtes`));

      await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      return;
    }

    const daily = quests.filter((q: any) => q.frequency === 'DAILY');
    const weekly = quests.filter((q: any) => q.frequency === 'WEEKLY');

    const formatQuest = (q: any) => {
      const progress = q.progress;
      const pct = Math.min((progress.current / progress.target) * 100, 100);
      const bar = buildProgressBar(pct, 8);
      const statusIcon = progress.status === 'CLAIMED' ? E.success
        : progress.status === 'COMPLETED' ? E.star
        : E.dot;
      const rewards = [];
      if (q.rewardCoins > 0) rewards.push(`${q.rewardCoins} ${E.coins}`);
      if (q.rewardXp > 0) rewards.push(`${q.rewardXp} ${E.xp}`);
      return `${statusIcon} **${q.name}**\n${q.description}\n${bar} \`${progress.current}/${progress.target}\` — ${rewards.join(' + ')}`;
    };

    const container = new ContainerBuilder()
      .setAccentColor(COLORS_RAW.primary)
      .addTextDisplayComponents(text(`### ${E.fire} Quêtes`));

    if (daily.length > 0) {
      container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
      container.addTextDisplayComponents(text(`**${E.calendar} Quotidiennes**`));
      container.addTextDisplayComponents(text(daily.map(formatQuest).join('\n\n')));
    }

    if (weekly.length > 0) {
      container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
      container.addTextDisplayComponents(text(`**${E.calendar} Hebdomadaires**`));
      container.addTextDisplayComponents(text(weekly.map(formatQuest).join('\n\n')));
    }

    const claimable = quests.filter((q: any) => q.progress.status === 'COMPLETED');

    container
      .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(text(
        claimable.length > 0
          ? `-# ${E.kotbo} Kotbo · ${claimable.length} récompense(s) à réclamer — /quests claim`
          : `-# ${E.kotbo} Kotbo · Quêtes`
      ));

    await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  if (subcommand === 'claim') {
    const questId = interaction.options.getString('quete', true);
    const result = await claimQuestReward(guildId, userId, questId);

    if (!result.success) {
      await interaction.reply({
        components: [errorContainer('Réclamation impossible', result.error)],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      return;
    }

    const rewards = [];
    if (result.coins && result.coins > 0) rewards.push(`**${result.coins}** ${E.coins}`);
    if (result.xp && result.xp > 0) rewards.push(`**${result.xp}** ${E.xp}`);

    const container = new ContainerBuilder()
      .setAccentColor(COLORS_RAW.success)
      .addTextDisplayComponents(text(`### ${E.trophy} Quête terminée !`))
      .addTextDisplayComponents(text(`Vous avez reçu ${rewards.join(' et ')}.`))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(text(`-# ${E.kotbo} Kotbo · Quêtes`));

    await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }
}

export const questsCommand = { data, execute } satisfies SlashCommandDefinition;
