import type { SlashCommandDefinition } from '../../commands.js';
import { SlashCommandBuilder, type ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from 'discord.js';
import {
  getRichestPlayers,
  getTopByLevel,
  getTopByMonstersKilled,
  getTopByFishCaught,
  getTopByItems,
  getOrCreateEconomyConfig,
} from '../../services/features/economyService.js';
import { errorEmbed, COLORS } from '../../utils/embeds.js';

const data = new SlashCommandBuilder()
  .setName('top')
  .setDescription('🏆 Classements RPG & Économie')
  .addStringOption(option =>
    option
      .setName('type')
      .setDescription('Type de classement')
      .setRequired(true)
      .addChoices(
        { name: '💰 Argent (les plus riches)', value: 'argent' },
        { name: '⭐ RPG (niveau & XP)', value: 'rpg' },
        { name: '🎒 Items (nombre d\'objets)', value: 'items' },
        { name: '⚔️ Monstres (tués)', value: 'monstres' },
        { name: '🎣 Pêche (poissons pêchés)', value: 'peche' },
      ),
  );

function medal(index: number): string {
  if (index === 0) return '🥇';
  if (index === 1) return '🥈';
  if (index === 2) return '🥉';
  return `\`#${index + 1}\``;
}

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: 'Cette commande doit être utilisée dans un serveur.', flags: [MessageFlags.Ephemeral] });
    return;
  }

  await interaction.deferReply();

  const type = interaction.options.getString('type', true);
  const config = await getOrCreateEconomyConfig(guildId);

  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTimestamp()
    .setFooter({ text: `${interaction.guild?.name ?? 'Serveur'}` });

  try {
    if (type === 'argent') {
      const players = await getRichestPlayers(guildId, 10);
      if (players.length === 0) {
        await interaction.editReply({ embeds: [errorEmbed('Classement vide', 'Personne n\'a encore de pièces.')] });
        return;
      }
      embed.setTitle(`💰 Top Argent — ${interaction.guild?.name ?? ''}`);
      embed.setDescription(
        players.map((p, i) =>
          `${medal(i)} <@${p.userId}> — **${p.balance.toLocaleString('fr-FR')}** ${config.currencyEmoji} (Niv. ${p.level})`
        ).join('\n')
      );

    } else if (type === 'rpg') {
      const players = await getTopByLevel(guildId, 10);
      if (players.length === 0) {
        await interaction.editReply({ embeds: [errorEmbed('Classement vide', 'Personne n\'a encore de profil RPG.')] });
        return;
      }
      embed.setTitle(`⭐ Top RPG — ${interaction.guild?.name ?? ''}`);
      embed.setDescription(
        players.map((p, i) => {
          const xpNeeded = p.level * 100;
          return `${medal(i)} <@${p.userId}> — **Niveau ${p.level}** (${p.xp}/${xpNeeded} XP) | ⚔️ ${p.attack} 🛡️ ${p.defense}`;
        }).join('\n')
      );

    } else if (type === 'items') {
      const players = await getTopByItems(guildId, 10);
      if (players.length === 0) {
        await interaction.editReply({ embeds: [errorEmbed('Classement vide', 'Personne n\'a encore d\'objets.')] });
        return;
      }
      embed.setTitle(`🎒 Top Items — ${interaction.guild?.name ?? ''}`);
      embed.setDescription(
        players.map((p, i) =>
          `${medal(i)} <@${p.userId}> — **${p.totalItems}** objets (Niv. ${p.level})`
        ).join('\n')
      );

    } else if (type === 'monstres') {
      const players = await getTopByMonstersKilled(guildId, 10);
      if (players.length === 0) {
        await interaction.editReply({ embeds: [errorEmbed('Classement vide', 'Personne n\'a encore tué de monstre.')] });
        return;
      }
      embed.setTitle(`⚔️ Top Monstres — ${interaction.guild?.name ?? ''}`);
      embed.setDescription(
        players.map((p, i) =>
          `${medal(i)} <@${p.userId}> — **${p.totalMonstersKilled}** monstres tués | 👑 ${p.totalBossesKilled} boss (Niv. ${p.level})`
        ).join('\n')
      );

    } else if (type === 'peche') {
      const players = await getTopByFishCaught(guildId, 10);
      if (players.length === 0) {
        await interaction.editReply({ embeds: [errorEmbed('Classement vide', 'Personne n\'a encore pêché.')] });
        return;
      }
      embed.setTitle(`🎣 Top Pêche — ${interaction.guild?.name ?? ''}`);
      embed.setDescription(
        players.map((p, i) =>
          `${medal(i)} <@${p.userId}> — **${p.totalFishCaught}** poissons pêchés (Niv. ${p.level})`
        ).join('\n')
      );
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Impossible de charger le classement.';
    await interaction.editReply({ embeds: [errorEmbed('Erreur', errMsg)] });
  }
}

export const topCommand = { data, execute } satisfies SlashCommandDefinition;
