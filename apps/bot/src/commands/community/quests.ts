import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, type ChatInputCommandInteraction } from 'discord.js';
import { COLORS } from '../../utils/embeds.js';
import { getAvailableQuests, claimQuestReward } from '../../services/community/questService.js';
import type { SlashCommandDefinition } from '../../commands.js';

export const questsCommand = {
  data: new SlashCommandBuilder()
    .setName('quests')
    .setDescription('Système de quêtes')
    .addSubcommand((sub) =>
      sub.setName('list')
        .setDescription('Voir les quêtes disponibles'))
    .addSubcommand((sub) =>
      sub.setName('claim')
        .setDescription('Réclamer la récompense d\'une quête terminée')
        .addStringOption((opt) => opt.setName('quete').setDescription('ID de la quête').setRequired(true))),

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;
    const userId = interaction.user.id;

    if (subcommand === 'list') {
      await interaction.deferReply({ ephemeral: true });
      const quests = await getAvailableQuests(guildId, userId);

      if (quests.length === 0) {
        await interaction.editReply({
          embeds: [new EmbedBuilder().setColor(COLORS.info).setDescription('Aucune quête disponible pour le moment.')],
        });
        return;
      }

      const daily = quests.filter((q: any) => q.frequency === 'DAILY');
      const weekly = quests.filter((q: any) => q.frequency === 'WEEKLY');

      const formatQuest = (q: any) => {
        const progress = q.progress;
        const bar = buildProgressBar(progress.current, progress.target);
        const status = progress.status === 'CLAIMED' ? '✅' : progress.status === 'COMPLETED' ? '🎉' : '📋';
        const rewards = [];
        if (q.rewardCoins > 0) rewards.push(`${q.rewardCoins} coins`);
        if (q.rewardXp > 0) rewards.push(`${q.rewardXp} XP`);
        return `${status} **${q.name}**\n${q.description}\n${bar} ${progress.current}/${progress.target} — ${rewards.join(' + ')}`;
      };

      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle('📋 Quêtes')
        .setTimestamp();

      if (daily.length > 0) {
        embed.addFields({ name: '📅 Quotidiennes', value: daily.map(formatQuest).join('\n\n') });
      }
      if (weekly.length > 0) {
        embed.addFields({ name: '📆 Hebdomadaires', value: weekly.map(formatQuest).join('\n\n') });
      }

      const claimable = quests.filter((q: any) => q.progress.status === 'COMPLETED');
      if (claimable.length > 0) {
        embed.setFooter({ text: `${claimable.length} récompense(s) à réclamer ! Utilisez /quests claim` });
      }

      await interaction.editReply({ embeds: [embed] });
    }

    if (subcommand === 'claim') {
      const questId = interaction.options.getString('quete', true);
      const result = await claimQuestReward(guildId, userId, questId);

      if (!result.success) {
        await interaction.reply({
          embeds: [new EmbedBuilder().setColor(COLORS.danger).setDescription(`❌ ${result.error}`)],
          ephemeral: true,
        });
        return;
      }

      const rewards = [];
      if (result.coins && result.coins > 0) rewards.push(`**${result.coins}** coins`);
      if (result.xp && result.xp > 0) rewards.push(`**${result.xp}** XP`);

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.success)
            .setDescription(`🎉 Quête terminée ! Vous avez reçu ${rewards.join(' et ')}.`)
            .setTimestamp(),
        ],
      });
    }
  },
} satisfies SlashCommandDefinition;

function buildProgressBar(current: number, target: number): string {
  const pct = Math.min(current / target, 1);
  const filled = Math.round(pct * 10);
  const empty = 10 - filled;
  return '▓'.repeat(filled) + '░'.repeat(empty);
}
