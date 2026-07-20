import {
  SlashCommandBuilder,
  ContainerBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { COLORS_RAW, text, errorContainer } from '../../utils/embeds.js';
import { E, rankEmoji } from '../../utils/emojis.js';
import { giveRep, getReputation, getReputationLeaderboard, REP_DAILY_VOTE_LIMIT } from '../../services/community/reputationService.js';
import { incrementQuestProgress } from '../../services/community/questService.js';
import type { SlashCommandDefinition } from '../../commands.js';

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

    incrementQuestProgress(guildId, interaction.user.id, 'GIVE_REP').catch(() => {});

    const container = new ContainerBuilder()
      .setAccentColor(COLORS_RAW.success)
      .addTextDisplayComponents(text(`### ${E.star} +Rep !`))
      .addTextDisplayComponents(text(
        `<@${interaction.user.id}> a donné un **+rep** à <@${target.id}>` +
        (reason ? `\n${E.dot} *${reason}*` : '')
      ))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(text(`-# ${E.kotbo} Kotbo · <@${target.id}> a maintenant ${result.newTotal} rep`));

    await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  if (subcommand === 'check') {
    const target = interaction.options.getUser('membre') ?? interaction.user;
    const profile = await getReputation(guildId, target.id);

    const container = new ContainerBuilder()
      .setAccentColor(COLORS_RAW.primary)
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(text(`### ${E.star} Réputation · <@${target.id}>`))
          .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: target.displayAvatarURL() } }))
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(text([
        `${E.arrow} **Total** · **${profile.totalRep}** rep`,
        `${E.arrow} **Rang** · #${profile.rank}`,
        `${E.arrow} **Votes restants** · ${REP_DAILY_VOTE_LIMIT - profile.votesGivenToday}/${REP_DAILY_VOTE_LIMIT}`,
      ].join('\n')))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(text(`-# ${E.kotbo} Kotbo · Réputation`));

    await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  if (subcommand === 'top') {
    await interaction.deferReply();
    const lb = await getReputationLeaderboard(guildId, 10);

    if (lb.entries.length === 0) {
      const container = new ContainerBuilder()
        .setAccentColor(COLORS_RAW.dark)
        .addTextDisplayComponents(text(`### ${E.trophy} Classement Réputation`))
        .addTextDisplayComponents(text(`${E.info} Aucune réputation enregistrée pour le moment.`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(text(`-# ${E.kotbo} Kotbo · Réputation`));

      await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      return;
    }

    const lines = lb.entries.map((e) => {
      const medal = rankEmoji(e.rank);
      return `${medal} <@${e.userId}> — **${e.totalRep}** rep`;
    });

    const container = new ContainerBuilder()
      .setAccentColor(COLORS_RAW.primary)
      .addTextDisplayComponents(text(`### ${E.trophy} Classement Réputation`))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(text(lines.join('\n')))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(text(`-# ${E.kotbo} Kotbo · ${lb.totalVoters} votants au total`));

    await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }
}

export const repCommand = { data, execute } satisfies SlashCommandDefinition;
