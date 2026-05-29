import { Collection, Guild, GuildMember } from 'discord.js';
import { logger } from './logger.js';

/**
 * Reliable helper to fetch all guild members, paging through Discord's REST API
 * if the gateway chunking fails, is disabled, or gets truncated.
 */
export async function fetchAllMembers(guild: Guild): Promise<Collection<string, GuildMember>> {
  try {
    // Try to fetch via gateway chunking first
    const members = await guild.members.fetch();
    if (members && members.size > 0 && members.size >= (guild.memberCount ?? 0)) {
      return members;
    }
    logger.warn('DiscordUtils', `Gateway member fetch returned ${members?.size} out of ${guild.memberCount} members for guild ${guild.id}. Falling back to paginated fetch.`);
  } catch (err) {
    logger.warn('DiscordUtils', `Gateway member fetch failed or timed out for guild ${guild.id}: ${String(err)}. Falling back to paginated fetch.`);
  }

  // Fallback: paginated REST fetch
  const allMembers = new Collection<string, GuildMember>();
  let lastId: string | undefined = undefined;

  while (true) {
    try {
      const options: any = { limit: 1000 };
      if (lastId) {
        options.after = lastId;
      }
      
      const chunk = await guild.members.fetch(options);
      if (!chunk || chunk.size === 0) {
        break;
      }

      for (const [id, member] of chunk.entries()) {
        allMembers.set(id, member);
      }

      // Collect the keys to find the last ID in lexicographical (snowflake) order
      const sortedKeys = Array.from(chunk.keys()).sort();
      lastId = sortedKeys[sortedKeys.length - 1];

      if (chunk.size < 1000) {
        break;
      }
    } catch (restErr) {
      logger.error('DiscordUtils', `Error in paginated REST member fetch: ${String(restErr)}`);
      break;
    }
  }

  if (allMembers.size > 0) {
    return allMembers;
  }
  
  return guild.members.cache;
}
