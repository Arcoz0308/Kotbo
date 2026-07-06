import { IncomingMessage, ServerResponse } from 'node:http';
import { Client } from 'discord.js';
import { logger } from '../../utils/logger.js';
import {
  json,
  verifyAuth,
  readJsonBody,
  getClientIp,
  checkRateLimit,
  partnershipRateLimiter,
} from '../shared.js';
import {
  submitPartnershipApplication,
  type PartnershipApplicationInput,
} from '../../services/features/partnershipService.js';

function cleanField(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

export async function handlePartnershipRoute(
  req: IncomingMessage,
  res: ServerResponse,
  parts: string[],
  url: URL,
  client: Client
): Promise<boolean> {
  if (parts[0] !== 'api' || parts[1] !== 'partnership-application') {
    return false;
  }

  // POST /api/partnership-application
  if (req.method === 'POST') {
    const ip = getClientIp(req);
    if (!checkRateLimit(partnershipRateLimiter, ip, 3, 60 * 60 * 1000)) {
      json(res, 429, { error: 'Trop de candidatures envoyées. Veuillez réessayer plus tard.' });
      return true;
    }

    try {
      const user = await verifyAuth(req);
      if (!user) {
        json(res, 401, { error: 'Non authentifié' });
        return true;
      }

      const payload = await readJsonBody<Record<string, unknown>>(req);
      if (!payload || (payload.category !== 'partenariat' && payload.category !== 'beta')) {
        json(res, 400, { error: 'Payload invalide' });
        return true;
      }

      const projectName = cleanField(payload.projectName, 200);
      const description = cleanField(payload.description, 2000);
      const motivation = cleanField(payload.motivation, 2000);
      if (!projectName || !description || !motivation) {
        json(res, 400, { error: 'Les champs projet, description et motivation sont obligatoires.' });
        return true;
      }

      const input: PartnershipApplicationInput = {
        category: payload.category,
        projectName,
        description,
        motivation,
        projectUrl: cleanField(payload.projectUrl, 500),
        memberCount: cleanField(payload.memberCount, 100),
        experience: cleanField(payload.experience, 2000),
        availability: cleanField(payload.availability, 1000),
        contact: cleanField(payload.contact, 500),
      };

      const result = await submitPartnershipApplication(
        client,
        { id: user.userId, username: user.username },
        input
      );

      if (!result.ok) {
        json(res, 409, { error: result.error });
        return true;
      }

      json(res, 200, {
        success: true,
        alreadyMember: result.alreadyMember,
        dmDelivered: result.dmDelivered,
        inviteUrl: result.inviteUrl,
      });
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : String(err);
      logger.error('Partnership', `Erreur lors de la soumission de la candidature: ${errMessage}`);
      json(res, 500, { error: 'Erreur lors de la transmission de la candidature' });
    }
    return true;
  }

  return false;
}
