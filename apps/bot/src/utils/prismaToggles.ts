import prisma from './db.js';

export async function toggleGuildBoolean(
  guildId: string,
  field: 'youtubeEnabled' | 'digestEnabled' | 'translationEnabled' | 'codePoliceEnabled' | 'dailyAlgoEnabled' | 'githubReleasesEnabled',
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

export async function toggleFeedBoolean(
  feedId: string,
  field: 'enabled' | 'autoPublish',
): Promise<boolean | null> {
  const feed = await prisma.feed.findUnique({ where: { id: feedId } });
  if (!feed) return null;

  const next = !feed[field];
  await prisma.feed.update({
    where: { id: feedId },
    data: { [field]: next },
  });

  return next;
}
