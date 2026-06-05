import { type Client, PermissionFlagsBits } from 'discord.js';
import { analyzeCodeContent, buildCorrectedMessage, buildSafetyWarning, hasRawCodeIndicators, isAlreadyFormatted, loadCodePoliceRules } from '../services/moderation/codePoliceService.js';
import { logger } from '../utils/logger.js';
import { getCachedGuild, cache } from '../utils/cache.js';

export function invalidateCodePoliceEnabledCache(guildId?: string): void {
  if (guildId) {
    void cache.delete(`guild:${guildId}:config`);
    return;
  }
}

async function isCodePoliceEnabled(guildId: string): Promise<boolean> {
  const guild = await getCachedGuild(guildId);
  return guild?.codePoliceEnabled ?? false;
}

export { analyzeCodeContent } from '../services/moderation/codePoliceService.js';

export function registerCodePoliceListener(client: Client): void {
  client.on('messageCreate', async message => {
    if (message.author.bot || message.channel.isDMBased()) return;
    if (message.channel.isThread()) return;
    if (!message.guildId) return;

    const enabled = await isCodePoliceEnabled(message.guildId);
    if (!enabled) return;

    const rules = await loadCodePoliceRules(message.guildId);
    const hasCodeIndicators = hasRawCodeIndicators(message.content, rules);

    if (!hasCodeIndicators || isAlreadyFormatted(message.content)) {
      return;
    }

    try {
      if (message.guild) {
        const botMember = await message.guild.members.fetchMe();
        if (!botMember.permissions.has(PermissionFlagsBits.ManageMessages)) {
          return;
        }
      }

      const analysis = analyzeCodeContent(message.content, rules);

      if (analysis.shouldBlock) {
        await message.channel.send({
          content: buildSafetyWarning(message.author.toString(), analysis, rules),
        });
        await message.delete();

        logger.warn('CodePolice', `Contenu potentiellement dangereux détecté pour ${message.author.username} dans ${message.guild?.name ?? 'MP'}`);
        return;
      }

      const correctedContent = buildCorrectedMessage(message.author.toString(), message.content.trim(), analysis, rules);
      await message.channel.send({
        content: correctedContent,
      });

      await message.delete();

      logger.debug('CodePolice', `Message de code reformatté pour ${message.author.username} dans ${message.guild?.name ?? 'MP'}`);
    } catch (error) {
      logger.error('CodePolice', 'Erreur lors du traitement du message de code :', error);
    }
  });

  logger.success('CodePolice', 'Écouteur Code Police enregistré');
}
