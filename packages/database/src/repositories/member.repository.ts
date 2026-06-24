import type { Prisma, PrismaClient } from '@prisma/client';

type DbClient = PrismaClient | Prisma.TransactionClient;

export interface MemberSearchParams {
  guildId: string;
  query?: string;
  page: number;
  limit: number;
  sortBy: 'lastSeenAt' | 'messageCount' | 'guildJoinedAt';
  sortOrder: 'asc' | 'desc';
  serverStatus?: 'on_server' | 'left';
  botFilter?: 'include' | 'exclude' | 'only';
}

const MEMBER_SEARCH_SELECT = {
  userId: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  isBot: true,
  lastSeenAt: true,
  messageCount: true,
  guildJoinedAt: true,
  guildLeftAt: true,
} as const satisfies Prisma.MemberProfileSelect;

export type MemberSearchResult = Prisma.MemberProfileGetPayload<{
  select: typeof MEMBER_SEARCH_SELECT;
}>;

export class MemberRepository {
  constructor(private readonly db: DbClient) {}

  async search(params: MemberSearchParams) {
    const where: Prisma.MemberProfileWhereInput = {
      guildId: params.guildId,
    };

    if (params.query) {
      where.OR = [
        { username: { contains: params.query, mode: 'insensitive' } },
        { displayName: { contains: params.query, mode: 'insensitive' } },
        { userId: { startsWith: params.query } },
      ];
    }

    if (params.serverStatus === 'on_server') {
      where.guildLeftAt = null;
    } else if (params.serverStatus === 'left') {
      where.guildLeftAt = { not: null };
    }

    if (params.botFilter === 'exclude') {
      where.isBot = false;
    } else if (params.botFilter === 'only') {
      where.isBot = true;
    }

    const [members, total] = await Promise.all([
      this.db.memberProfile.findMany({
        where,
        orderBy: { [params.sortBy]: params.sortOrder },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        select: MEMBER_SEARCH_SELECT,
      }),
      this.db.memberProfile.count({ where }),
    ]);

    return {
      members,
      totalFound: total,
      totalPages: Math.ceil(total / params.limit),
      page: params.page,
    };
  }
}
