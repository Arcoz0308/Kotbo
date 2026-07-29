import { beforeEach, describe, expect, mock, test } from 'bun:test';
import path from 'node:path';

type MarketplaceState = {
  listingStatus: 'ACTIVE' | 'SOLD';
  buyerBalance: number;
  sellerBalance: number;
  inventoryQuantity: number;
  transactionCount: number;
};

let state: MarketplaceState;
let transactionQueue = Promise.resolve();

const listing = {
  id: 'listing-1',
  guildId: 'guild-1',
  sellerId: 'seller-1',
  itemId: 'item-1',
  quantity: 1,
  price: 100,
  type: 'FIXED_PRICE',
  expiresAt: new Date(Date.now() + 60_000),
};

const tx = {
  marketplaceListing: {
    findFirst: mock(async () => state.listingStatus === 'ACTIVE'
      ? { ...listing, status: state.listingStatus }
      : null),
    updateMany: mock(async () => {
      if (state.listingStatus !== 'ACTIVE') return { count: 0 };
      state.listingStatus = 'SOLD';
      return { count: 1 };
    }),
  },
  rpgProfile: {
    findUnique: mock(async ({ where }: any) => (
      where.guildId_userId.userId === 'buyer-1' ? { id: 'buyer-profile' } : null
    )),
    updateMany: mock(async ({ where, data }: any) => {
      if (where.id !== 'buyer-profile' || state.buyerBalance < where.balance.gte) {
        return { count: 0 };
      }
      state.buyerBalance -= data.balance.decrement;
      return { count: 1 };
    }),
    update: mock(async ({ data }: any) => {
      state.sellerBalance += data.balance.increment;
      return {};
    }),
  },
  rpgInventoryItem: {
    upsert: mock(async ({ update, create }: any) => {
      state.inventoryQuantity += state.inventoryQuantity > 0
        ? update.quantity.increment
        : create.quantity;
      return {};
    }),
  },
  marketplaceTransaction: {
    create: mock(async () => {
      if (state.transactionCount > 0) throw new Error('unique listingId');
      state.transactionCount++;
      return {};
    }),
  },
};

const mockDb = {
  ...tx,
  $transaction: mock(<T>(callback: (client: typeof tx) => Promise<T>): Promise<T> => {
    const run = transactionQueue.then(async () => {
      const snapshot = { ...state };
      try {
        return await callback(tx);
      } catch (error) {
        state = snapshot;
        throw error;
      }
    });
    transactionQueue = run.then(() => undefined, () => undefined);
    return run;
  }),
};

const dbPath = path.resolve(import.meta.dir, '../../utils/db.ts');
const dbJsPath = path.resolve(import.meta.dir, '../../utils/db.js');
mock.module(dbPath, () => ({ default: mockDb, prisma: mockDb, prismaRead: mockDb }));
mock.module(dbJsPath, () => ({ default: mockDb, prisma: mockDb, prismaRead: mockDb }));

const { buyListing } = await import('../../services/economy/marketplaceService.js');

beforeEach(() => {
  state = {
    listingStatus: 'ACTIVE',
    buyerBalance: 100,
    sellerBalance: 0,
    inventoryQuantity: 0,
    transactionCount: 0,
  };
  transactionQueue = Promise.resolve();
});

describe('atomic marketplace purchase', () => {
  test('a listing can only be purchased once concurrently', async () => {
    const results = await Promise.all([
      buyListing('guild-1', 'buyer-1', 'listing-1'),
      buyListing('guild-1', 'buyer-1', 'listing-1'),
    ]);

    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(results.filter((result) => !result.success)).toHaveLength(1);
    expect(state.listingStatus).toBe('SOLD');
    expect(state.buyerBalance).toBe(0);
    expect(state.sellerBalance).toBe(100);
    expect(state.inventoryQuantity).toBe(1);
    expect(state.transactionCount).toBe(1);
  });
});
