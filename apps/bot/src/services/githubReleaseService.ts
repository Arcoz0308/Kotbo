import { logger } from '../utils/logger.js';

interface GitHubRelease {
  id: number;
  tag_name: string;
  name: string;
  body: string | null;
  published_at: string;
  html_url: string;
}

interface StoredRelease {
  guildId: string;
  repo: string;
  latestReleaseId: number;
  latestReleaseTag: string;
  timestamp: number;
}

const releaseStore: Map<string, StoredRelease> = new Map();

export async function checkRepositoryReleases(guildId: string, owner: string, repo: string): Promise<GitHubRelease | null> {
  const key = `${owner}/${repo}`;
  const storeKey = `${guildId}:${key}`;
  const stored = releaseStore.get(storeKey);

  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (response.status === 404) {
      logger.debug('GitHubAggregator', `No releases found for ${key}`);
      return null;
    }

    if (!response.ok) {
      logger.error('GitHubAggregator', `GitHub API error for ${key}:`, response.statusText);
      return null;
    }

    const release: GitHubRelease = await response.json() as GitHubRelease;

    if (!stored || stored.latestReleaseId !== release.id) {
      releaseStore.set(storeKey, {
        guildId,
        repo: key,
        latestReleaseId: release.id,
        latestReleaseTag: release.tag_name,
        timestamp: Date.now(),
      });

      return release;
    }

    return null;
  } catch (error) {
    logger.error('GitHubAggregator', `Error checking ${key}:`, error);
    return null;
  }
}

export function formatReleaseMessage(release: GitHubRelease, repo: string): string {
  const body = release.body ?? '';
  const truncated = body.length > 200 
    ? body.substring(0, 200) + '...' 
    : body;

  return `**${repo}** • Nouvelle Release\n\n📦 **${release.name || release.tag_name}**\n\n${truncated || 'Pas de description'}\n\n🔗 [Voir la release](${release.html_url})`;
}

export function initializeReleaseStore(): void {
  logger.success('GitHubAggregator', 'Release tracking initialized');
}
