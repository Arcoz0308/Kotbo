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
} from '../../../services/eventService.js';

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
            questions: (body.questions && !isLive) ? {
              deleteMany: {},
              create: body.questions.map((q: any, i: number) => ({
                text: q.text,
                options: q.options,
                correctOptionIndex: q.correctOptionIndex,
                sortOrder: i,
                imageUrl: q.imageUrl
              }))
            } : undefined
          },
          include: { questions: true }
        });

        if (isLive && body.questions) {
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
