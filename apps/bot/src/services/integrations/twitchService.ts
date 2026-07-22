import { type Client } from 'discord.js';
import prisma from '../../utils/db.js';
import { buildTwitchEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

let twitchAccessToken: string | null = null;
let twitchTokenExpiresAt = 0;

const TWITCH_REQUEST_TIMEOUT_MS = 10_000;

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TWITCH_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Retrieves a Twitch app access token using Client Credentials Flow.
 * Caches the token in memory.
 */
async function getTwitchToken(): Promise<string | null> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    logger.warn('TwitchService', 'TWITCH_CLIENT_ID or TWITCH_CLIENT_SECRET is missing in .env.');
    return null;
  }

  const now = Date.now();
  if (twitchAccessToken && now < twitchTokenExpiresAt) {
    return twitchAccessToken;
  }

  try {
    const res = await fetchWithTimeout('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
      }),
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch token: ${res.statusText}`);
    }

    const data = await res.json() as { access_token: string; expires_in: number };
    twitchAccessToken = data.access_token;
    // Buffer of 60 seconds
    twitchTokenExpiresAt = now + (data.expires_in - 60) * 1000;
    return twitchAccessToken;
  } catch (error) {
    logger.error('TwitchService', 'Error getting Twitch OAuth token:', error);
    return null;
  }
}

/**
 * Helper to fetch user ID for a Twitch username.
 */
export async function getTwitchUserId(username: string): Promise<string | null> {
  const token = await getTwitchToken();
  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!token || !clientId) return null;

  let cleanName = username.trim().toLowerCase();
  if (cleanName.includes('twitch.tv/')) {
    const match = cleanName.match(/twitch\.tv\/([a-zA-Z0-9_]{4,25})/);
    if (match) {
      cleanName = match[1];
    }
  }

  try {
    const res = await fetchWithTimeout(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(cleanName)}`, {
      headers: {
        'Client-ID': clientId,
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!res.ok) return null;
    const data = await res.json() as unknown;
    const users = data.data || [];
    if (users.length > 0) {
      return users[0].id;
    }
  } catch (error) {
    logger.error('TwitchService', `Error fetching Twitch user ID for ${username}:`, error);
  }
  return null;
}

/**
 * Main checking job for followed Twitch streams.
 */
export async function checkTwitchFollows(client: Client) {
  logger.debug('TwitchService', 'Checking Twitch followed streams...');
  const token = await getTwitchToken();
  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!token || !clientId) {
    return;
  }

  try {
    const follows = await prisma.twitchChannelFollow.findMany({
      include: {
        guild: {
          include: {
            dashboardFeatureConfigs: {
              where: { featureKey: 'twitch' },
            },
          },
        },
      },
    });

    if (follows.length === 0) return;

    // Check features configuration
    const activeFollows = follows.filter((follow) => {
      const config = follow.guild.dashboardFeatureConfigs.find((c: Record<string, unknown>) => c.featureKey === 'twitch');
      return !config || config.enabled; // skip if explicitly disabled
    });

    if (activeFollows.length === 0) return;

    const usernames = activeFollows.map((f: Record<string, unknown>) => f.streamerName);
    const uniqueUsernames = Array.from(new Set(usernames));

    // Twitch Helix accepts max 100 user_login per request — batch if needed
    const TWITCH_BATCH_SIZE = 100;
    const liveMap = new Map<string, unknown>();

    for (let i = 0; i < uniqueUsernames.length; i += TWITCH_BATCH_SIZE) {
      const batch = uniqueUsernames.slice(i, i + TWITCH_BATCH_SIZE);
      const queryParams = batch.map(name => `user_login=${encodeURIComponent(String(name))}`).join('&');
      const url = `https://api.twitch.tv/helix/streams?${queryParams}`;

      const res = await fetchWithTimeout(url, {
        headers: {
          'Client-ID': clientId,
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        logger.warn('TwitchService', `Failed to fetch Twitch stream statuses (batch ${i / TWITCH_BATCH_SIZE}): ${res.statusText}`);
        continue;
      }

      const resData = await res.json() as unknown;
      const liveStreams = resData.data || [];
      for (const s of liveStreams) {
        liveMap.set(s.user_login.toLowerCase(), s);
      }
    }

    for (const follow of activeFollows) {
      const name = follow.streamerName.toLowerCase();
      const liveInfo = liveMap.get(name);
      const guildId = follow.guildId;
      
      const discordGuild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
      if (!discordGuild) continue;

      if (liveInfo) {
        // Streamer is currently live
        const streamId = liveInfo.id;
        const isNewLive = !follow.isLive || follow.lastStreamId !== streamId;

        if (isNewLive) {
          const targetChannelId = follow.liveChannelId || follow.guild.publicChannelId;
          if (targetChannelId) {
            const channel = discordGuild.channels.cache.get(targetChannelId) || await discordGuild.channels.fetch(targetChannelId).catch(() => null);
            if (channel?.isTextBased()) {
              const embed = buildTwitchEmbed({
                title: liveInfo.title,
                streamerName: liveInfo.user_name,
                gameName: liveInfo.game_name,
                viewerCount: liveInfo.viewer_count,
                thumbnailUrl: liveInfo.thumbnail_url,
              });

              await channel.send({
                content: `🎥 **${liveInfo.user_name}** est en live sur Twitch !`,
                embeds: [embed],
              }).catch(e => logger.error('TwitchService', 'Failed to send Twitch live alert:', e));
            }
          }

          // Update DB follow state
          await prisma.twitchChannelFollow.update({
            where: { id: follow.id },
            data: {
              isLive: true,
              lastStreamId: streamId,
              streamerId: liveInfo.user_id, // ensure ID is saved
            },
          });
        }
      } else {
        // Streamer is offline
        if (follow.isLive) {
          // Send offline alert if secondary channel is configured
          if (follow.otherChannelId) {
            const channel = discordGuild.channels.cache.get(follow.otherChannelId) || await discordGuild.channels.fetch(follow.otherChannelId).catch(() => null);
            if (channel?.isTextBased()) {
              const embed = buildTwitchEmbed({
                title: 'Stream terminé',
                streamerName: follow.streamerName,
                isOffline: true,
              });
              await channel.send({
                content: `❌ **${follow.streamerName}** a éteint son live.`,
                embeds: [embed],
              }).catch(e => logger.error('TwitchService', 'Failed to send Twitch offline alert:', e));
            }
          }

          // Update DB state
          await prisma.twitchChannelFollow.update({
            where: { id: follow.id },
            data: { isLive: false },
          });
        }
      }
    }
  } catch (error) {
    logger.error('TwitchService', 'Error checking Twitch follows:', error);
  }
}
