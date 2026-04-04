import { type Client, PermissionFlagsBits } from 'discord.js';
import { analyzeCodeContent, buildCorrectedMessage, buildSafetyWarning, hasRawCodeIndicators, isAlreadyFormatted, loadCodePoliceRules } from '../services/codePoliceService.js';
import { logger } from '../utils/logger.js';

const codePoliceEnabledCache = new Map<string, { enabled: boolean; expiresAt: number }>();

export function invalidateCodePoliceEnabledCache(guildId?: string): void {
  if (guildId) {
    codePoliceEnabledCache.delete(guildId);
    return;
  }

  codePoliceEnabledCache.clear();
}

async function isCodePoliceEnabled(guildId: string): Promise<boolean> {
  const cached = codePoliceEnabledCache.get(guildId);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.enabled;
  }

  const { default: prisma } = await import('../utils/db.js');
  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    select: { codePoliceEnabled: true },
  });

  const enabled = guild?.codePoliceEnabled ?? false;
  codePoliceEnabledCache.set(guildId, { enabled, expiresAt: now + 60_000 });
  return enabled;
}

export { analyzeCodeContent } from '../services/codePoliceService.js';

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
