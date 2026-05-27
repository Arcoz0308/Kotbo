import { type Client } from 'discord.js';
import prisma from '../utils/db.js';
import { buildYouTubeEmbed } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';

/**
 * Resolves a YouTube channel ID and title from a URL, handle, ID, or search query.
 */
export async function resolveYoutubeChannel(query: string): Promise<{ channelId: string; channelName: string } | null> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;

  const cleaned = query.trim();
  
  // 1. Check if it's already a channel ID
  if (/^UC[a-zA-Z0-9_-]{22}$/.test(cleaned)) {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${cleaned}&key=${key}`);
    if (res.ok) {
      const data = await res.json() as any;
      if (data?.items?.length > 0) {
        return {
          channelId: data.items[0].id,
          channelName: data.items[0].snippet.title,
        };
      }
    }
    return null;
  }

  // 2. Check if it's a URL and extract handle or ID
  let handle: string | null = null;
  let channelId: string | null = null;

  if (cleaned.includes('youtube.com/') || cleaned.includes('youtu.be/')) {
    const matchChannel = cleaned.match(/\/channel\/(UC[a-zA-Z0-9_-]{22})/);
    if (matchChannel) {
      channelId = matchChannel[1];
    } else {
      const matchHandle = cleaned.match(/\/@([^\/\?\s#]+)/);
      if (matchHandle) {
        handle = '@' + matchHandle[1];
      }
    }
  } else if (cleaned.startsWith('@')) {
    handle = cleaned;
  }

  if (channelId) {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channelId}&key=${key}`);
    if (res.ok) {
      const data = await res.json() as any;
      if (data?.items?.length > 0) {
        return {
          channelId: data.items[0].id,
          channelName: data.items[0].snippet.title,
        };
      }
    }
  }

  if (handle) {
    const handleUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet&forHandle=${encodeURIComponent(handle)}&key=${key}`;
    const res = await fetch(handleUrl).catch(e => {
      logger.error('YouTubeService', `Error fetching handle ${handle}:`, e);
      return null;
    });
    if (res && res.ok) {
      const data = await res.json() as any;
      if (data?.items?.length > 0) {
        return {
          channelId: data.items[0].id,
          channelName: data.items[0].snippet.title,
        };
      } else {
        logger.warn('YouTubeService', `No channel found for handle "${handle}". Response: ${JSON.stringify(data)}`);
      }
    } else if (res) {
      const text = await res.text().catch(() => '');
      logger.error('YouTubeService', `Failed to fetch handle ${handle}. Status: ${res.status}. Body: ${text}`);
    }
  }

  // 3. Fallback: search term
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(cleaned)}&type=channel&maxResults=1&key=${key}`;
  const res = await fetch(searchUrl).catch(e => {
    logger.error('YouTubeService', `Error searching for "${cleaned}":`, e);
    return null;
  });
  if (res && res.ok) {
    const data = await res.json() as any;
    const items = data?.items || [];
    if (items.length > 0) {
      return {
        channelId: items[0].id.channelId,
        channelName: items[0].snippet.title,
      };
    } else {
      logger.warn('YouTubeService', `No search result for query "${cleaned}"`);
    }
  } else if (res) {
    const text = await res.text().catch(() => '');
    logger.error('YouTubeService', `Failed search for "${cleaned}". Status: ${res.status}. Body: ${text}`);
  }

  return null;
}

/**
 * Checks if a YouTube video is a Short using a redirect test.
 * Shorts return 200, while regular videos redirect (302/301) to /watch?v=...
 */
async function isYoutubeShort(videoId: string): Promise<boolean> {
  try {
    const res = await fetch(`https://www.youtube.com/shorts/${videoId}`, {
      method: 'HEAD',
      redirect: 'manual',
    });
    return res.status === 200;
  } catch (error) {
    logger.error('YouTubeService', `Error testing short redirect for ${videoId}:`, error);
    return false;
  }
}

/**
 * Scrapes the channel live page to check if it is active.
 * Uses no API quota.
 */
async function checkYoutubeLiveStatus(channelId: string): Promise<{ isLive: boolean; videoId?: string; title?: string }> {
  try {
    const res = await fetch(`https://www.youtube.com/channel/${channelId}/live`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    if (!res.ok) return { isLive: false };
    const html = await res.text();
    
    const canonicalMatch = html.match(/canonical" href="https:\/\/www.youtube.com\/watch\?v=([^"]+)"/);
    const videoId = canonicalMatch ? canonicalMatch[1] : undefined;

    if (videoId && (html.includes('isLive') || html.includes('liveStreamability') || html.includes('"style":"LIVE"') || html.includes('LIVE_STARTED'))) {
      const titleMatch = html.match(/"title":"([^"]+)"/) || html.match(/<title>([^<]+)<\/title>/);
      const title = titleMatch ? titleMatch[1].replace(' - YouTube', '') : 'En direct sur YouTube';
      return { isLive: true, videoId, title };
    }
  } catch (error) {
    logger.error('YouTubeService', `Error checking live status for channel ${channelId}:`, error);
  }
  return { isLive: false };
}

/**
 * Main function to verify all followed YouTube channels in all guilds.
 */
export async function checkYoutubeFollows(client: Client) {
  logger.debug('YouTubeService', 'Checking YouTube followed channels...');
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    logger.warn('YouTubeService', 'YOUTUBE_API_KEY is not defined in .env.');
    return;
  }

  try {
    // Get all channels followed
    const follows = await (prisma as any).youtubeChannelFollow.findMany({
      include: {
        guild: {
          include: {
            dashboardFeatureConfigs: {
              where: { featureKey: 'youtube' },
            },
          },
        },
      },
    });

    for (const follow of follows) {
      // Check if YouTube feature is enabled for the guild
      const ytFeatureConfig = follow.guild.dashboardFeatureConfigs.find((c: any) => c.featureKey === 'youtube');
      if (ytFeatureConfig && !ytFeatureConfig.enabled) {
        continue; // Module disabled for this server
      }

      const guildId = follow.guildId;
      const channelId = follow.channelId;
      const discordGuild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
      if (!discordGuild) continue;

      // 1. Check for Active Lives
      const liveStatus = await checkYoutubeLiveStatus(channelId);
      if (liveStatus.isLive && liveStatus.videoId && liveStatus.videoId !== follow.lastLiveId) {
        // Send live notification
        const targetChannelId = follow.liveChannelId || follow.videoChannelId || follow.guild.publicChannelId;
        if (targetChannelId) {
          const channel = discordGuild.channels.cache.get(targetChannelId) || await discordGuild.channels.fetch(targetChannelId).catch(() => null);
          if (channel?.isTextBased()) {
            const embed = buildYouTubeEmbed({
              title: `🔴 En Live : ${liveStatus.title}`,
              videoId: liveStatus.videoId,
              channelName: follow.channelName,
              publishedAt: new Date(),
            });
            await channel.send({
              content: `🔴 **${follow.channelName}** est en direct sur YouTube !`,
              embeds: [embed],
            }).catch(e => logger.error('YouTubeService', 'Failed to send YouTube live notification:', e));
          }
        }
        // Update database
        await (prisma as any).youtubeChannelFollow.update({
          where: { id: follow.id },
          data: { lastLiveId: liveStatus.videoId },
        });
      }

      // 2. Check for Videos and Shorts (using Uploads Playlist)
      // Uploads playlist ID starts with UU instead of UC
      const uploadsPlaylistId = 'UU' + channelId.substring(2);
      const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=5&key=${key}`;
      
      const apiRes = await fetch(url).catch(() => null);
      if (!apiRes || !apiRes.ok) {
        logger.warn('YouTubeService', `Failed to fetch uploads playlist for channel ${follow.channelName} (${channelId})`);
        continue;
      }

      const data = await apiRes.json() as any;
      const items = data.items || [];

      // Process items in reverse order (oldest first) so we notify chronologically
      for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        const videoId = item.contentDetails?.videoId;
        const title = item.snippet?.title;
        const publishedAtStr = item.snippet?.publishedAt;
        const publishedAt = publishedAtStr ? new Date(publishedAtStr) : new Date();

        if (!videoId || !title) continue;

        // Skip if we already saw this videoId as video or short
        if (videoId === follow.lastVideoId || videoId === follow.lastShortId) {
          continue;
        }

        // Test if Short or regular video
        const isShort = await isYoutubeShort(videoId);

        if (isShort) {
          // If we haven't sent this Short
          if (videoId !== follow.lastShortId) {
            const targetChannelId = follow.shortChannelId || follow.videoChannelId || follow.guild.publicChannelId;
            if (targetChannelId) {
              const channel = discordGuild.channels.cache.get(targetChannelId) || await discordGuild.channels.fetch(targetChannelId).catch(() => null);
              if (channel?.isTextBased()) {
                const embed = buildYouTubeEmbed({
                  title: `⚡ Short : ${title}`,
                  videoId,
                  channelName: follow.channelName,
                  publishedAt,
                });
                await channel.send({
                  content: `⚡ Nouveau Short de **${follow.channelName}** !`,
                  embeds: [embed],
                }).catch(e => logger.error('YouTubeService', 'Failed to send YouTube short notification:', e));
              }
            }
            // Update lastShortId
            await (prisma as any).youtubeChannelFollow.update({
              where: { id: follow.id },
              data: { lastShortId: videoId },
            });
            follow.lastShortId = videoId; // local update to prevent duplicate checking in loop
          }
        } else {
          // Regular Video
          if (videoId !== follow.lastVideoId) {
            const targetChannelId = follow.videoChannelId || follow.guild.publicChannelId;
            if (targetChannelId) {
              const channel = discordGuild.channels.cache.get(targetChannelId) || await discordGuild.channels.fetch(targetChannelId).catch(() => null);
              if (channel?.isTextBased()) {
                const embed = buildYouTubeEmbed({
                  title,
                  videoId,
                  channelName: follow.channelName,
                  publishedAt,
                });
                await channel.send({
                  content: `🎥 Nouvelle vidéo de **${follow.channelName}** !`,
                  embeds: [embed],
                }).catch(e => logger.error('YouTubeService', 'Failed to send YouTube video notification:', e));
              }
            }
            // Update lastVideoId
            await (prisma as any).youtubeChannelFollow.update({
              where: { id: follow.id },
              data: { lastVideoId: videoId },
            });
            follow.lastVideoId = videoId;
          }
        }
      }
    }
  } catch (error) {
    logger.error('YouTubeService', 'Error checking YouTube follows:', error);
  }
}
