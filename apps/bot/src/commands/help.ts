import { SlashCommandBuilder, type ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from 'discord.js';
import { COLORS } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('❓ Affiche l’aide des commandes disponibles');

export async function execute(interaction: ChatInputCommandInteraction) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle('❓ Aide des commandes')
    .setDescription('Voici les principales commandes disponibles sur Kotbo.')
    .addFields(
      {
        name: '🧭 Démarrage et configuration',
        value: [
          '`/setup` - Assistant de configuration pas à pas',
          '`/config` - Ouvre le panneau de configuration complet',
        ].join('\n'),
      },
      {
        name: '📰 Actualités et sources',
        value: [
          '`/feed` - Gérer les flux RSS (ajout, suppression, statut...)',
          '`/news` - Soumettre manuellement une news',
          '`/youtube` - Gérer les chaînes YouTube suivies',
        ].join('\n'),
      },
      {
        name: '🛠️ Outils utiles',
        value: [
          '`/ping` - Mesurer la latence du bot',
          '`/info` - Voir les infos système et de configuration',
          '`/status` - Vérifier le statut HTTP d’une URL',
          '`/epoch` - Convertir un timestamp/date',
          '`/excuse` - Générer une excuse développeur aléatoire',
        ].join('\n'),
      },
      {
        name: '🔒 Administration / dev',
        value: [
          '`/admin` - Commandes administrateur du serveur',
          '`/devutils` - Utilitaires développeur (encodage, hash, JWT...)',
        ].join('\n'),
      },
    )
    .setFooter({ text: 'Kotbo · Astuce : tapez / puis le nom pour voir les options détaillées' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
}