import { z } from 'zod';

// ---------------------------------------------------------------------------
// Discord IDs
// ---------------------------------------------------------------------------

/** Snowflake Discord : 17–19 chiffres */
export const DiscordId = z.string().regex(/^\d{17,19}$/, 'ID Discord invalide (doit être un snowflake de 17-19 chiffres)');

export const GuildId = DiscordId.describe('ID du serveur Discord');
export const UserId  = DiscordId.describe('ID de l\'utilisateur Discord');

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export const PaginationQuery = z.object({
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ---------------------------------------------------------------------------
// Réponses d'erreur standardisées
// ---------------------------------------------------------------------------

export const ErrorResponse = z.object({
  error:   z.string(),
  details: z.unknown().optional(),
});

export const OkResponse = z.object({
  ok: z.boolean(),
});

// ---------------------------------------------------------------------------
// Helpers de type
// ---------------------------------------------------------------------------

export type DiscordIdType = z.infer<typeof DiscordId>;
export type PaginationQueryType = z.infer<typeof PaginationQuery>;
