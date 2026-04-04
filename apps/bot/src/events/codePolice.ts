import { type Client, PermissionFlagsBits } from 'discord.js';
import { logger } from '../utils/logger.js';
import prisma from '../utils/db.js';

const CODE_KEYWORDS = [
  'function',
  'const',
  'let',
  'var',
  'return',
  'import',
  'export',
  'async',
  'await',
  'class',
  'interface',
  'type',
  'enum',
  'def',
  'public',
  'private',
  'protected',
  'null',
  'undefined',
  'console.log',
  'print',
  'println',
];
const codePoliceCache = new Map<string, { enabled: boolean; expiresAt: number }>();

function getLongestFence(content: string): number {
  const matches = content.match(/`+/g) ?? [];
  return matches.reduce((max, sequence) => Math.max(max, sequence.length), 0);
}

function wrapInCodeFence(content: string): string {
  const fenceLength = Math.max(3, getLongestFence(content) + 1);
  const fence = '`'.repeat(fenceLength);
  return `${fence}\n${content}\n${fence}`;
}

function buildCorrectedMessage(authorTag: string, content: string): string {
  const advice = 'Sur Discord, utilise les blocs de code (\\`\\`\\`) pour une meilleure lisibilité. Ajoute aussi le langage si possible, par exemple \\`\\`\\`js ou \\`\\`\\`python.';
  const header = `${authorTag}, voici ton message avec une meilleure mise en forme :`;
  const maxContentLength = 1500;
  const shortenedContent = content.length > maxContentLength
    ? `${content.slice(0, maxContentLength)}\n…(message tronqué pour rester lisible)`
    : content;

  return `${header}\n${wrapInCodeFence(shortenedContent)}\n\n💡 **Conseil :** ${advice}`;
}

function hasRawCodeIndicators(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.length < 8) return false;

  const indicators = [
    CODE_KEYWORDS.some(keyword => new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(trimmed)),
    /[{}[\]();=>]/.test(trimmed),
    /(?:^|\n)\s*(?:if|for|while|switch|try|catch|else)\s*\(/i.test(trimmed),
    /(?:^|\n)\s*(?:def|class|function|const|let|var|import|export)\b/i.test(trimmed),
    /(?:^|\n)\s{2,}\S/.test(trimmed),
  ];

  return indicators.filter(Boolean).length >= 2;
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

      const correctedContent = buildCorrectedMessage(message.author.toString(), message.content.trim());
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
