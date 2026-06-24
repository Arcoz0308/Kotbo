import { z } from 'zod';

export const MemberSearchQuery = z.object({
  q: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(24),
  page: z.coerce.number().min(1).default(1),
  sortBy: z.enum(['lastSeenAt', 'messageCount', 'guildJoinedAt']).default('lastSeenAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  serverStatus: z.enum(['on_server', 'left', 'all']).default('on_server'),
  botFilter: z.enum(['human', 'bot', 'all']).default('human'),
});

export const MemberSearchItem = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  isBot: z.boolean(),
  lastSeenAt: z.string().nullable(),
  messageCount: z.number(),
  guildJoinedAt: z.string().nullable(),
  guildLeftAt: z.string().nullable(),
  isOnServer: z.boolean(),
});

export const MemberSearchResponse = z.object({
  members: z.array(MemberSearchItem),
  totalFound: z.number(),
  totalPages: z.number(),
  onServerCount: z.number(),
  leftCount: z.number(),
  botCount: z.number(),
});

export type MemberSearchQueryInput = z.infer<typeof MemberSearchQuery>;
export type MemberSearchItemData = z.infer<typeof MemberSearchItem>;
export type MemberSearchResponseData = z.infer<typeof MemberSearchResponse>;
