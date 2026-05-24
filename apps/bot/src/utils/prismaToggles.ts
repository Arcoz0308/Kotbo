import prisma from './db.js';

export async function toggleGuildBoolean(
  guildId: string,
  field: 'translationEnabled' | 'codePoliceEnabled' | 'dailyAlgoEnabled' | 'githubReleasesEnabled' | 'sanctionSyncEnabled' | 'autoNicknameModerationEnabled',
): Promise<boolean | null> {
  const guild = await prisma.guild.findUnique({ where: { id: guildId } });
  if (!guild) return null;

  const next = !guild[field];
  await prisma.guild.update({
    where: { id: guildId },
    data: { [field]: next },
  });

  return next;
}
