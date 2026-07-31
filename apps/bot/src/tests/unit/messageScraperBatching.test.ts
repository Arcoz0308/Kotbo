import { describe, expect, mock, test } from 'bun:test';
import { Collection, ChannelType } from 'discord.js';
import path from 'node:path';

type TransactionOptions = { timeout?: number };

const transactionCalls: Array<{ operationCount: number; options?: TransactionOptions }> = [];

const mockDb = {
  guild: {
    findUnique: mock(async () => ({
      activated: true,
      statsConfig: {
        historicalScrapeStatus: 'NOT_STARTED',
        historicalScrapedChannels: [],
        historicalScrapedMessages: 0,
        scrapingBoundaryDate: '2099-01-01T00:00:00.000Z',
      },
    })),
    update: mock(async () => ({})),
  },
  guildDailyStat: {
    upsert: mock(async () => ({})),
    update: mock(async () => ({})),
  },
  guildHourlyStat: {
    upsert: mock(async () => ({})),
  },
  channelDailyStat: {
    upsert: mock(async () => ({})),
  },
  memberDailyStat: {
    upsert: mock(async () => ({})),
    count: mock(async () => 250),
  },
  $transaction: mock(async (
    operations: Array<Promise<unknown>>,
    options?: TransactionOptions,
  ) => {
    transactionCalls.push({ operationCount: operations.length, options });
    return Promise.all(operations);
  }),
};

const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  success: () => {},
};

for (const suffix of ['../../utils/db.ts', '../../utils/db.js']) {
  mock.module(path.resolve(__dirname, suffix), () => ({
    default: mockDb,
    prisma: mockDb,
    prismaRead: mockDb,
  }));
}

for (const suffix of ['../../utils/logger.ts', '../../utils/logger.js']) {
  mock.module(path.resolve(__dirname, suffix), () => ({
    logger: silentLogger,
  }));
}

const { startHistoricalScraping } = await import('../../services/analytics/messageScraperService');

function messagePage(offset: number, size: number) {
  const page = new Collection<string, {
    id: string;
    author: { id: string; bot: boolean };
    createdAt: Date;
    reference: null;
  }>();

  for (let index = 0; index < size; index++) {
    const id = `message-${offset + index}`;
    page.set(id, {
      id,
      author: { id: `user-${offset + index}`, bot: false },
      createdAt: new Date('2026-01-15T12:00:00.000Z'),
      reference: null,
    });
  }

  return page;
}

describe('message scraper transaction batching', () => {
  test('flushes every Discord page with a bounded local transaction timeout', async () => {
    transactionCalls.length = 0;
    const pages = [
      messagePage(0, 100),
      messagePage(100, 100),
      messagePage(200, 50),
    ];
    let pageIndex = 0;

    const channel = {
      id: 'channel-1',
      name: 'general',
      type: ChannelType.GuildText,
      isTextBased: () => true,
      permissionsFor: () => ({ has: () => true }),
      messages: {
        fetch: mock(async () => pages[pageIndex++] ?? new Collection()),
      },
    };
    const channels = new Collection<string, typeof channel>();
    channels.set(channel.id, channel);

    const guild = {
      id: 'guild-1',
      name: 'Test Guild',
      members: { me: { id: 'bot-1' } },
      channels: { fetch: mock(async () => channels) },
    };
    const client = {
      user: { id: 'bot-1' },
      guilds: {
        cache: new Collection([[guild.id, guild]]),
        fetch: mock(async () => guild),
      },
    };

    const result = await startHistoricalScraping(client as never, guild.id);
    expect(result.status).toBe('STARTED');
    await result.completion;

    expect(transactionCalls).toHaveLength(3);
    expect(transactionCalls.map((call) => call.operationCount)).toEqual([104, 104, 54]);
    expect(transactionCalls.every((call) => call.options?.timeout === 15_000)).toBe(true);
  });
});
