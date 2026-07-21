import {
  SlashCommandBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { errorContainer, kotboContainer } from '../../utils/embeds.js';
import { E, buildProgressBar } from '../../utils/emojis.js';
import { getAvailableQuests, claimQuestReward } from '../../services/community/questService.js';
import type { SlashCommandDefinition } from '../../commands.js';
import { ContainerChild, separator, v2Message } from '@arcscord/components';
import { ExtractArrayValue } from '../../utils/types.js';

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

      await interaction.editReply(v2Message(
        kotboContainer({
          color: 'dark',
          title: `${E.fire} Quêtes`,
          fields: [
            `${E.info} Aucune quête disponible pour le moment.`,
          ],
          footerTitle: 'Quêtes'
        })
      ));
      return;
    }

    type Quest = ExtractArrayValue<
      Awaited<
        ReturnType<
          typeof getAvailableQuests
        >
      >
    >;

    const daily = quests.filter((q) => q.frequency === 'DAILY');
    const weekly = quests.filter((q) => q.frequency === 'WEEKLY');

    const formatQuest = (q: Quest) => {
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

    const claimable = quests.filter((q) => q.progress.status === 'COMPLETED');

    const fields: ContainerChild[] = [];

    if (daily.length > 0) {
      fields.push(
        separator({ divider: true, spacing: 'small' }),
        `**${E.calendar} Quotidiennes**`,
        daily.map(formatQuest).join('\n\n')
      )
    }

    if (weekly.length > 0) {
      fields.push(
        separator({ divider: true, spacing: 'small' }),
        `**${E.calendar} Hebdomadaires**`,
        weekly.map(formatQuest).join('\n\n')
      )
    }


    await interaction.editReply(v2Message(
      kotboContainer({
        color: 'primary',
        title: `${E.fire} Quêtes`,
        fields,
        footerTitle: claimable.length > 0 ? `${claimable.length} récompense(s) à réclamer — /quests claim` : 'Quêtes'
      })
    ));
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

    await interaction.reply(v2Message(
      kotboContainer({
        color: 'success',
        title: `${E.trophy} Quête terminée !`,
        fields: [
          `Vous avez reçu ${rewards.join(' et ')}.`
        ],
        footerTitle: 'Quêtes'
      })
    ));
  }
}

export const questsCommand = { data, execute } satisfies SlashCommandDefinition;
