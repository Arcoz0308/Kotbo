import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { SlashCommandDefinition } from '../../commands.js';
import { COLORS_RAW } from '../../utils/embeds.js';
import { runSecurityAudit, type AuditFinding } from '../../services/moderation/securityAuditService.js';

const data = new SlashCommandBuilder()
  .setName('audit')
  .setDescription('🔍 Analyse la sécurité du serveur et suggère des améliorations')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

const SEVERITY_ICONS: Record<string, string> = {
  CRITICAL: '🔴',
  WARNING: '🟠',
  INFO: '🔵',
  OK: '🟢',
};

function scoreColor(score: number): number {
  if (score >= 80) return COLORS_RAW.success;
  if (score >= 50) return COLORS_RAW.warning;
  return COLORS_RAW.danger;
}

function scoreLabel(score: number): string {
  if (score >= 90) return 'Excellente';
  if (score >= 80) return 'Bonne';
  if (score >= 60) return 'Moyenne';
  if (score >= 40) return 'Faible';
  return 'Critique';
}

function formatFinding(finding: AuditFinding): string {
  const icon = SEVERITY_ICONS[finding.severity] ?? '•';
  let line = `${icon} **${finding.title}**\n${finding.detail}`;
  if (finding.recommendation) line += `\n> 💡 ${finding.recommendation}`;
  return line;
}

async function execute(interaction: ChatInputCommandInteraction) {
  const guild = interaction.guild;
  if (!guild) return;

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const { score, findings } = await runSecurityAudit(guild);

  const problems = findings.filter((f) => f.severity !== 'OK');
  const oks = findings.filter((f) => f.severity === 'OK');

  const embed = new EmbedBuilder()
    .setColor(scoreColor(score))
    .setTitle('🔍 Audit de sécurité')
    .setDescription(`## Score : ${score}/100 — ${scoreLabel(score)}\n${score >= 80 ? 'Ton serveur est bien protégé. 👏' : 'Des améliorations sont recommandées ci-dessous.'}`)
    .setTimestamp();

  if (problems.length > 0) {
    // Discord limite un field à 1024 caractères : on regroupe par blocs
    let block = '';
    let blockIndex = 0;
    for (const finding of problems) {
      const entry = formatFinding(finding);
      if (block.length + entry.length + 2 > 1024) {
        embed.addFields({ name: blockIndex === 0 ? '⚠️ Points à corriger' : '​', value: block });
        block = '';
        blockIndex++;
      }
      block += (block ? '\n\n' : '') + entry;
    }
    if (block) embed.addFields({ name: blockIndex === 0 ? '⚠️ Points à corriger' : '​', value: block });
  }

  if (oks.length > 0) {
    embed.addFields({
      name: '✅ Points conformes',
      value: oks.map((f) => `🟢 ${f.title}`).join(' · ').slice(0, 1024),
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

export const auditCommand: SlashCommandDefinition = { data, execute };
