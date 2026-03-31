import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { infoEmbed, errorEmbed } from '../utils/embeds.js';
import prisma from '../utils/db.js';
import fs from 'fs/promises';

const packagePath = new URL('../../package.json', import.meta.url);

async function getVersion() {
  try {
    const raw = await fs.readFile(packagePath, 'utf8');
    const pkg = JSON.parse(raw);
    return pkg.version ?? 'inconnue';
  } catch {
    return 'inconnue';
  }
}

export const data = new SlashCommandBuilder()
  .setName('info')
  .setDescription('ℹ️ Info sur le bot (version, état, configuration)');

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ embeds: [errorEmbed('Impossible', 'Cette commande doit être utilisée dans un serveur.')], ephemeral: true });
    return;
  }

  const guild = await prisma.guild.findUnique({ where: { id: guildId } });

  const version = await getVersion();
  const uptime = process.uptime();
  const guildCount = interaction.client.guilds.cache.size;
  const userCount = interaction.client.users.cache.size;

  const fields = [
    { name: 'Bot', value: `${interaction.client.user?.tag ?? '?' } (${interaction.client.user?.id ?? '?'})`, inline: false },
    { name: 'Version', value: version, inline: true },
    { name: 'Uptime', value: `${Math.floor(uptime / 60)} min`, inline: true },
    { name: 'Guilds', value: `${guildCount}`, inline: true },
    { name: 'Utilisateurs en cache', value: `${userCount}`, inline: true },
  ];

  if (guild) {
    const postsFeedCount = await prisma.feed.count({ where: { guildId } });
    fields.push({ name: 'Serveur', value: `${interaction.guild?.name ?? 'Inconnu'} (${guild.id})`, inline: false });
    fields.push({ name: 'Flux RSS (total)', value: `${postsFeedCount}`, inline: true });
    fields.push({ name: 'YouTube activé', value: `${guild.youtubeEnabled ? 'Oui' : 'Non'}`, inline: true });
    fields.push({ name: 'Channel config', value: `${guild.configChannelId ?? 'Non défini'}`, inline: false });
    fields.push({ name: 'Channel public', value: `${guild.publicChannelId ?? 'Non défini'}`, inline: false });
    fields.push({ name: 'Channel digest', value: `${guild.digestChannelId ?? 'Non défini'}`, inline: false });
  }

  await interaction.reply({ embeds: [infoEmbed('Informations Kotbo', undefined, fields)], ephemeral: true });
}
