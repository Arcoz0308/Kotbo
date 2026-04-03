import { type Client, ChannelType, PermissionFlagsBits, ThreadChannel } from 'discord.js';
import { logger } from '../utils/logger.js';
import prisma from '../utils/db.js';

const CODE_KEYWORDS = ['function', 'const', 'let', 'var', 'return', 'import', 'export', 'async', 'await', 'class', 'interface', 'type', 'def', 'class', 'function', 'const', 'public', 'private', 'null', 'undefined'];
const codePoliceCache = new Map<string, { enabled: boolean; expiresAt: number }>();

function hasRawCodeIndicators(content: string): boolean {
  const hasCodeKeywords = CODE_KEYWORDS.some(keyword =>
    new RegExp(`\\b${keyword}\\b`, 'i').test(content)
  );

  const hasCodeSyntax = /[{}[\]();=>]/.test(content);

  return hasCodeKeywords && hasCodeSyntax;
}

function isAlreadyFormatted(content: string): boolean {
  return /```[\s\S]*?```/.test(content) || /`[^`]*`/.test(content);
}

async function isCodePoliceEnabled(guildId: string): Promise<boolean> {
  const cached = codePoliceCache.get(guildId);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.enabled;
  }

  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    select: { codePoliceEnabled: true },
  });

  const enabled = guild?.codePoliceEnabled ?? false;
  codePoliceCache.set(guildId, { enabled, expiresAt: now + 60_000 });
  return enabled;
}

export function registerCodePoliceListener(client: Client): void {
  client.on('messageCreate', async message => {
    if (message.author.bot || message.channel.isDMBased()) return;
    if (message.channel.isThread()) return;
    if (!message.guildId) return;

    const enabled = await isCodePoliceEnabled(message.guildId);
    if (!enabled) return;

    if (!hasRawCodeIndicators(message.content) || isAlreadyFormatted(message.content)) {
      return;
    }

    try {
      if (message.guild) {
        const botMember = await message.guild.members.fetchMe();
        if (!botMember.permissions.has(PermissionFlagsBits.ManageMessages)) {
          return;
        }
      }

      const codeBlock = message.content;

      const advice = 'Sur Discord, utilise les blocs de code (```) pour une meilleure lisibilité. Tape ``` suivi du langage (ex : ```js, ```python) pour la coloration syntaxique.';
      const correctedMessage = await message.channel.send({
        content: `${message.author.toString()}, voici ton message avec la bonne mise en forme :\n\`\`\`\n${codeBlock}\n\`\`\`\n\n💡 **Conseil:** ${advice}`,
      });

      await message.delete();

      logger.debug('CodePolice', `Code reformatté pour ${message.author.username} dans ${message.guild?.name ?? 'MP'}`);
    } catch (error) {
      logger.error('CodePolice', 'Erreur lors du traitement du message de code :', error);
    }
  });

  logger.success('CodePolice', 'Écouteur Code Police enregistré');
}
