import {
  SlashCommandBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { errorContainer, kotboContainer } from '../../utils/embeds.js';
import { E, rankEmoji } from '../../utils/emojis.js';
import { giveRep, getReputation, getReputationLeaderboard, REP_DAILY_VOTE_LIMIT } from '../../services/community/reputationService.js';
import { incrementQuestProgress } from '../../services/community/questService.js';
import type { SlashCommandDefinition } from '../../commands.js';
import { separator, v2Message } from '@arcscord/components'

const data = new SlashCommandBuilder()
  .setName('rep')
  .setDescription('Système de réputation communautaire')
  .addSubcommand((sub) =>
    sub.setName('give')
      .setDescription('Donner un +rep à un membre')
      .addUserOption((opt) => opt.setName('membre').setDescription('Le membre à récompenser').setRequired(true))
      .addStringOption((opt) => opt.setName('raison').setDescription('Raison du +rep')))
  .addSubcommand((sub) =>
    sub.setName('check')
      .setDescription('Voir la réputation d\'un membre')
      .addUserOption((opt) => opt.setName('membre').setDescription('Le membre à consulter')))
  .addSubcommand((sub) =>
    sub.setName('top')
      .setDescription('Classement des réputations'));

async function execute(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;

  if (subcommand === 'give') {
    const target = interaction.options.getUser('membre', true);
    const reason = interaction.options.getString('raison') ?? undefined;

    const result = await giveRep(guildId, interaction.user.id, target.id, reason);

    if (!result.success) {
      await interaction.reply({
        components: [errorContainer('Impossible', result.error)],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      return;
    }

    incrementQuestProgress(guildId, interaction.user.id, 'GIVE_REP').catch(() => { });

    await interaction.reply(v2Message(
      kotboContainer({
        color: 'success',
        title: `${E.star} +Rep !`,
        fields: [
          `<@${interaction.user.id}> a donné un **+rep** à <@${target.id}>` + (reason ? `\n${E.dot} *${reason}*` : ''),
        ],
        footerTitle: `<@${target.id}> a maintenant ${result.newTotal} rep`
      })
    ));
  }

  if (subcommand === 'check') {
    const target = interaction.options.getUser('membre') ?? interaction.user;
    const profile = await getReputation(guildId, target.id);

    await interaction.reply(v2Message(
      kotboContainer({
        color: 'primary',
        title: `${E.star} Réputation · <@${target.id}>`,
        titleThumbnail: { url: target.displayAvatarURL() },
        fields: [
          separator({ divider: true, spacing: 'small' }),
          [
            `${E.arrow} **Total** · **${profile.totalRep}** rep`,
            `${E.arrow} **Rang** · #${profile.rank}`,
            `${E.arrow} **Votes restants** · ${REP_DAILY_VOTE_LIMIT - profile.votesGivenToday}/${REP_DAILY_VOTE_LIMIT}`,
          ].join('\n'),
        ],
        footerTitle: 'Réputation'
      })
    ));
  }

  if (subcommand === 'top') {
    await interaction.deferReply();
    const lb = await getReputationLeaderboard(guildId, 10);

    if (lb.entries.length === 0) {
      await interaction.editReply(v2Message(
        kotboContainer({
          color: 'dark',
          title: `${E.trophy} Classement Réputation`,
          fields: [
            `${E.info} Aucune réputation enregistrée pour le moment.`,
          ],
          footerTitle: 'Réputation'
        })
      ));
      return;
    }

    const lines = lb.entries.map((e) => {
      const medal = rankEmoji(e.rank);
      return `${medal} <@${e.userId}> — **${e.totalRep}** rep`;
    });

    await interaction.editReply(v2Message(
      kotboContainer({
        color: 'primary',
        title: `${E.trophy} Classement Réputation`,
        fields: [
          separator({ divider: true, spacing: 'small' }),
          lines.join('\n'),
        ],
        footerTitle: `${lb.totalVoters} votants au total`
      })
    ));
  }
}

export const repCommand = { data, execute } satisfies SlashCommandDefinition;
