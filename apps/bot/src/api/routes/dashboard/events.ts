import { IncomingMessage, ServerResponse } from 'node:http';
import { Client } from 'discord.js';
import prisma from '../../../utils/db.js';
import { logger } from '../../../utils/logger.js';
import {
  json,
  readJsonBody,
  type AuthClaims,
  type DashboardAccess,
} from '../../shared.js';
import {
  getEvents,
  getEvent,
  createEvent,
  publishEvent,
  nextQuestion,
  getEventStats,
  prevQuestion,
  finishEvent,
  deleteEvent,
} from '../../../services/features/eventService.js';

export async function handleEventsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  parts: string[],
  url: URL,
  client: Client,
  user: AuthClaims,
  guildId: string,
  access: DashboardAccess
): Promise<boolean> {
  const method = req.method;

  if (parts[4] !== 'events') {
    return false;
  }

  // GET /api/dashboard/guilds/:guildId/events
  if (method === 'GET' && !parts[5]) {
    try {
      const events = await getEvents(guildId);
      json(res, 200, { events });
    } catch (err) {
      logger.error('EventsAPI', err);
      json(res, 500, { error: 'Erreur récupération événements' });
    }
    return true;
  }

  // POST /api/dashboard/guilds/:guildId/events
  if (method === 'POST' && !parts[5]) {
    try {
      const body = await readJsonBody<any>(req);
      const event = await createEvent(guildId, body);
      json(res, 201, { event });
    } catch (err) {
      logger.error('EventsAPI', err);
      json(res, 500, { error: 'Erreur création événement' });
    }
    return true;
  }

  // Routes avec :eventId
  if (parts[5]) {
    const eventId = parts[5];

    // GET /api/dashboard/guilds/:guildId/events/:eventId
    if (method === 'GET' && !parts[6]) {
      try {
        const event = await getEvent(eventId);
        json(res, 200, { event });
      } catch (err) {
        logger.error('EventsAPI', err);
        json(res, 500, { error: 'Erreur récupération événement' });
      }
      return true;
    }

    // DELETE /api/dashboard/guilds/:guildId/events/:eventId
    if (method === 'DELETE' && !parts[6]) {
      try {
        await deleteEvent(client, eventId);
        json(res, 200, { success: true });
      } catch (err) {
        logger.error('EventsAPI', err);
        json(res, 500, { error: 'Erreur suppression événement' });
      }
      return true;
    }

    // POST /api/dashboard/guilds/:guildId/events/:eventId/publish
    if (method === 'POST' && parts[6] === 'publish') {
      try {
        const event = await publishEvent(client, eventId);
        json(res, 200, { event });
      } catch (err) {
        logger.error('EventsAPI', err);
        json(res, 500, { error: (err as Error).message });
      }
      return true;
    }

    // POST /api/dashboard/guilds/:guildId/events/:eventId/next
    if (method === 'POST' && parts[6] === 'next') {
      try {
        const result = await nextQuestion(client, eventId);
        json(res, 200, result);
      } catch (err) {
        logger.error('EventsAPI', err);
        json(res, 500, { error: (err as Error).message });
      }
      return true;
    }

    // POST /api/dashboard/guilds/:guildId/events/:eventId/prev
    if (method === 'POST' && parts[6] === 'prev') {
      try {
        const result = await prevQuestion(client, eventId);
        json(res, 200, result);
      } catch (err) {
        logger.error('EventsAPI', err);
        json(res, 500, { error: (err as Error).message });
      }
      return true;
    }

    // POST /api/dashboard/guilds/:guildId/events/:eventId/finish
    if (method === 'POST' && parts[6] === 'finish') {
      try {
        const result = await finishEvent(client, eventId);
        json(res, 200, result);
      } catch (err) {
        logger.error('EventsAPI', err);
        json(res, 500, { error: (err as Error).message });
      }
      return true;
    }

    // PATCH /api/dashboard/guilds/:guildId/events/:eventId
    if (method === 'PATCH' && !parts[6]) {
      try {
        const body = await readJsonBody<any>(req);
        const currentEvent = await prisma.event.findUnique({ where: { id: eventId } });
        const isLive = currentEvent?.status === 'ONGOING';

        const event = await prisma.event.update({
          where: { id: eventId },
          data: {
            title: body.title,
            description: body.description,
            channelId: body.channelId,
            triggerType: body.triggerType,
            triggerValue: body.triggerValue,
            triggerStatus: (body.triggerType !== (currentEvent as any)?.triggerType || body.triggerValue !== (currentEvent as any)?.triggerValue) ? 'PENDING' : undefined,
            questions: (body.questions && !isLive && (currentEvent as any)?.type === 'QUIZ') ? {
              deleteMany: {},
              create: body.questions.map((q: any, i: number) => ({
                text: q.text,
                options: q.options,
                correctOptionIndex: q.correctOptionIndex,
                sortOrder: i,
                imageUrl: q.imageUrl
              }))
            } : undefined,
            ctfChallenges: (body.ctfChallenges && !isLive && (currentEvent as any)?.type === 'CTF') ? {
              deleteMany: {},
              create: body.ctfChallenges.map((c: any, i: number) => ({
                title: c.title,
                description: c.description || '',
                flag: c.flag,
                points: Number(c.points) || 100,
                roleIdReward: c.roleIdReward || null,
                xpReward: Number(c.xpReward) || 0,
                imageUrl: c.imageUrl || null,
                sortOrder: i
              }))
            } : undefined
          } as any,
          include: { questions: true, ctfChallenges: true } as any
        });

        if (isLive && body.questions && (currentEvent as any)?.type === 'QUIZ') {
          const existingQuestions = await prisma.eventQuizQuestion.findMany({
            where: { eventId },
            orderBy: { sortOrder: 'asc' }
          });

          for (let i = 0; i < Math.min(existingQuestions.length, body.questions.length); i++) {
            const q = body.questions[i];
            if (i < existingQuestions.length) {
              await prisma.eventQuizQuestion.update({
                where: { id: existingQuestions[i].id },
                data: {
                  text: q.text,
                  options: q.options,
                  correctOptionIndex: q.correctOptionIndex,
                  imageUrl: q.imageUrl
                }
              });
            }
          }
        }

        if (isLive && body.ctfChallenges && (currentEvent as any)?.type === 'CTF') {
          const existingChallenges = await (prisma as any).eventCtfChallenge.findMany({
            where: { eventId },
            orderBy: { sortOrder: 'asc' }
          });

          for (let i = 0; i < Math.min(existingChallenges.length, body.ctfChallenges.length); i++) {
            const c = body.ctfChallenges[i];
            await (prisma as any).eventCtfChallenge.update({
              where: { id: existingChallenges[i].id },
              data: {
                title: c.title,
                description: c.description || '',
                flag: c.flag,
                points: Number(c.points) || 100,
                roleIdReward: c.roleIdReward || null,
                xpReward: Number(c.xpReward) || 0,
                imageUrl: c.imageUrl || null
              }
            });
          }
        }

        json(res, 200, { event });
      } catch (err) {
        logger.error('EventsAPI', err);
        json(res, 500, { error: (err as Error).message });
      }
      return true;
    }

    // GET /api/dashboard/guilds/:guildId/events/:eventId/stats
    if (method === 'GET' && parts[6] === 'stats') {
      try {
        const stats = await getEventStats(eventId);
        json(res, 200, { stats });
      } catch (err) {
        logger.error('EventsAPI', err);
        json(res, 500, { error: 'Erreur récupération stats' });
      }
      return true;
    }
  }

  return false;
}
