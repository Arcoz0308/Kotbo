import { SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { COLORS } from '../../utils/embeds.js';
import { giveRep, getReputation, getReputationLeaderboard } from '../../services/community/reputationService.js';
import { incrementQuestProgress } from '../../services/community/questService.js';
import type { SlashCommandDefinition } from '../../commands.js';

export const repCommand = {
  data: new SlashCommandBuilder()
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
        .setDescription('Classement des réputations')),

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;

    if (subcommand === 'give') {
      const target = interaction.options.getUser('membre', true);
      const reason = interaction.options.getString('raison') ?? undefined;

      const result = await giveRep(guildId, interaction.user.id, target.id, reason);

      if (!result.success) {
        await interaction.reply({
          embeds: [new EmbedBuilder().setColor(COLORS.danger).setDescription(`❌ ${result.error}`)],
          ephemeral: true,
        });
        return;
      }

      incrementQuestProgress(guildId, interaction.user.id, 'GIVE_REP').catch(() => {});

      const embed = new EmbedBuilder()
        .setColor(COLORS.success)
        .setDescription(`✨ ${interaction.user} a donné un **+rep** à ${target}${reason ? ` — *${reason}*` : ''}`)
        .setFooter({ text: `${target.username} a maintenant ${result.newTotal} rep` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }

    if (subcommand === 'check') {
      const target = interaction.options.getUser('membre') ?? interaction.user;
      const profile = await getReputation(guildId, target.id);

      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(`Réputation de ${target.username}`)
        .addFields(
          { name: 'Total', value: `**${profile.totalRep}** rep`, inline: true },
          { name: 'Rang', value: `#${profile.rank}`, inline: true },
          { name: 'Votes restants', value: `${3 - profile.votesGivenToday}/3`, inline: true },
        )
        .setThumbnail(target.displayAvatarURL())
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }

    if (subcommand === 'top') {
      await interaction.deferReply();
      const lb = await getReputationLeaderboard(guildId, 10);

      if (lb.entries.length === 0) {
        await interaction.editReply({
          embeds: [new EmbedBuilder().setColor(COLORS.info).setDescription('Aucune réputation enregistrée pour le moment.')],
        });
        return;
      }

      const lines = lb.entries.map((e) => {
        const medal = e.rank <= 3 ? ['🥇', '🥈', '🥉'][e.rank - 1] : `**#${e.rank}**`;
        return `${medal} <@${e.userId}> — **${e.totalRep}** rep`;
      });

      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle('🏆 Classement Réputation')
        .setDescription(lines.join('\n'))
        .setFooter({ text: `${lb.totalVoters} votants au total` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }
  },
} satisfies SlashCommandDefinition;
