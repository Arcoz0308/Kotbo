import { Guild, type Client } from 'discord.js';
import prisma from '../utils/db.js';
import { logger } from '../utils/logger.js';
import { publishEvent } from './eventService.js';

export async function checkMemberCountTriggers(guild: Guild, client: Client) {
  try {
    const memberCount = guild.memberCount;
    const pendingEvents = await prisma.event.findMany({
      where: {
        guildId: guild.id,
        triggerType: 'MEMBER_COUNT',
        triggerStatus: 'PENDING',
      },
    });

    for (const event of pendingEvents) {
      if (!event.triggerValue) continue;
      const targetCount = parseInt(event.triggerValue, 10);
      if (!isNaN(targetCount) && memberCount >= targetCount) {
        logger.info('ctfTriggerService', `Triggering event ${event.id} as guild ${guild.id} reached ${memberCount} members (target: ${targetCount})`);
        
        await prisma.event.update({
          where: { id: event.id },
          data: { triggerStatus: 'TRIGGERED' },
        });

        await publishEvent(client, event.id).catch(err => {
          logger.error('ctfTriggerService', `Failed to publish event ${event.id} on member count trigger:`, err);
        });
      }
    }
  } catch (err) {
    logger.error('ctfTriggerService', 'Error in checkMemberCountTriggers:', err);
  }
}
