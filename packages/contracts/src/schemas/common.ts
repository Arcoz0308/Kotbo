import { z } from 'zod';

export const DiscordSnowflake = z.string().min(15).max(20).regex(/^\d+$/);

export const GuildIdParam = z.object({
  guildId: DiscordSnowflake,
});

export const PaginationQuery = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(24),
});

export const ErrorResponse = z.object({
  error: z.string(),
});

export const SuccessResponse = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

export type GuildIdParams = z.infer<typeof GuildIdParam>;
export type PaginationParams = z.infer<typeof PaginationQuery>;
