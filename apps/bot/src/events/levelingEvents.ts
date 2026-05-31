import { Client, Events, Message } from 'discord.js';
import { handleTextXp, addXp, getOrCreateLevelConfig } from '../services/levelingService.js';
import { logger } from '../utils/logger.js';
import prisma from '../utils/db.js';

let voiceXpInterval: Timer | null = null;

export function registerLevelingListener(client: Client) {
  // 1. Text XP Listener
  client.on(Events.MessageCreate, async (message: Message) => {
    if (!message.guild || message.author.bot || message.content.startsWith('/')) return;
    
    await handleTextXp(message.guild.id, message.author.id, client, message.channel.id);
  });

  // 2. Vocal XP Loop (every 60 seconds)
  if (voiceXpInterval) clearInterval(voiceXpInterval);
  
  voiceXpInterval = setInterval(async () => {
    try {
      for (const [guildId, guild] of client.guilds.cache) {
        const config = await getOrCreateLevelConfig(guildId).catch(() => null);
        if (!config || !config.enabled || config.vocalXpPerMin <= 0) continue;

        // Parcourir tous les salons vocaux de la guilde
        for (const [channelId, channel] of guild.channels.cache) {
          if (!channel.isVoiceBased()) continue;

          // Vérifier si le salon vocal est exclu
          if (config.ignoredChannels && config.ignoredChannels.includes(channel.id)) continue;

          // Parcourir tous les membres connectés
          for (const [memberId, member] of channel.members) {
            if (member.user.bot) continue;

            // Ne pas donner d'XP s'il est muet ou sourd (auto-muet, sourd d'oreille, etc.)
            const isMuted = member.voice.selfMute || member.voice.serverMute;
            const isDeafened = member.voice.selfDeaf || member.voice.serverDeaf;
            if (isMuted || isDeafened) continue;

            // Vérifier si le membre possède un rôle exclu
            if (config.ignoredRoles && config.ignoredRoles.some(roleId => member.roles.cache.has(roleId))) continue;

            // Calculer le multiplicateur d'XP par rôle
            let multiplier = 1.0;
            if (config.xpMultipliers && typeof config.xpMultipliers === 'object') {
              const multipliers = config.xpMultipliers as Record<string, number>;
              for (const [roleId, multValue] of Object.entries(multipliers)) {
                if (member.roles.cache.has(roleId)) {
                  if (multValue > multiplier) {
                    multiplier = multValue;
                  }
                }
              }
            }

            const voiceXp = Math.floor(config.vocalXpPerMin * multiplier);
            if (voiceXp <= 0) continue;

            // Ajouter l'XP vocale
            await addXp(guildId, member.id, voiceXp, client).catch(err => 
              logger.error('LevelingService', `Erreur lors de l'attribution XP vocal à ${member.id}:`, err)
            );
          }
        }
      }
    } catch (err) {
      logger.error('LevelingEvents', 'Erreur lors de la boucle d\'XP vocale :', err);
    }
  }, 60000) as any;

  logger.info('System', 'Écouteurs de Leveling & XP enregistrés.');
}
