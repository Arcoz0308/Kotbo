import { describe, expect, mock, test } from 'bun:test';
import path from 'node:path';

const mockDb = {
  guild: {
    findUnique: mock(async () => ({
      activated: true,
      statsConfig: {
        historicalScrapeStatus: 'COMPLETED',
        historicalScrapedChannels: ['channel-1'],
        historicalScrapedMessages: 42,
      },
    })),
    update: mock(async () => ({})),
  },
};

for (const suffix of ['../../utils/db.ts', '../../utils/db.js']) {
  mock.module(path.resolve(__dirname, suffix), () => ({
    default: mockDb,
    prisma: mockDb,
    prismaRead: mockDb,
  }));
}

const { startHistoricalScraping } = await import('../../services/analytics/messageScraperService');

describe('message scraper safety', () => {
  test('never replays a completed incremental history, even with force=true', async () => {
    const result = await startHistoricalScraping({} as never, 'guild-history', true);

    expect(result.status).toBe('ALREADY_COMPLETED');
    expect(mockDb.guild.update).not.toHaveBeenCalled();
  });
});
