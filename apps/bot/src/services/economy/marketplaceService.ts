import prisma, { prismaRead } from '../../utils/db.js';
import { logger } from '../../utils/logger.js';

export async function createListing(guildId: string, sellerId: string, data: {
  itemId: string;
  quantity: number;
  price: number;
  type: 'FIXED_PRICE' | 'AUCTION';
  durationHours?: number;
}): Promise<{ success: boolean; error?: string; listing?: any }> {
  const profile = await prismaRead.rpgProfile.findUnique({
    where: { guildId_userId: { guildId, userId: sellerId } },
  });
  if (!profile) return { success: false, error: 'Profil RPG introuvable.' };

  const inventoryItem = await prismaRead.rpgInventoryItem.findFirst({
    where: { rpgProfileId: profile.id, itemId: data.itemId, quantity: { gte: data.quantity } },
  });
  if (!inventoryItem) return { success: false, error: 'Vous n\'avez pas assez de cet objet.' };

  if (data.price <= 0) return { success: false, error: 'Le prix doit être positif.' };

  const durationMs = (data.durationHours ?? 24) * 3600000;
  const expiresAt = new Date(Date.now() + durationMs);

  await prisma.rpgInventoryItem.update({
    where: { id: inventoryItem.id },
    data: { quantity: { decrement: data.quantity } },
  });

  const listing = await prisma.marketplaceListing.create({
    data: {
      guildId,
      sellerId,
      itemId: data.itemId,
      quantity: data.quantity,
      price: data.price,
      type: data.type,
      expiresAt,
    },
  });

  return { success: true, listing };
}

export async function buyListing(
  guildId: string,
  buyerId: string,
  listingId: string,
): Promise<{
  success: boolean;
  error?: string;
  /** Details de l'annonce achetee, utilises pour le message de confirmation. */
  listing?: { itemId: string; quantity: number; price: number; sellerId: string };
}> {
  const listing = await prismaRead.marketplaceListing.findFirst({
    where: { id: listingId, guildId, status: 'ACTIVE', type: 'FIXED_PRICE' },
  });

  if (!listing) return { success: false, error: 'Annonce introuvable ou déjà vendue.' };
  if (listing.sellerId === buyerId) return { success: false, error: 'Vous ne pouvez pas acheter votre propre annonce.' };
  if (listing.expiresAt < new Date()) return { success: false, error: 'Cette annonce a expiré.' };

  const buyerProfile = await prismaRead.rpgProfile.findUnique({
    where: { guildId_userId: { guildId, userId: buyerId } },
  });
  if (!buyerProfile || buyerProfile.balance < listing.price) {
    return { success: false, error: 'Fonds insuffisants.' };
  }

  await prisma.$transaction([
    prisma.rpgProfile.update({
      where: { guildId_userId: { guildId, userId: buyerId } },
      data: { balance: { decrement: listing.price } },
    }),
    prisma.rpgProfile.update({
      where: { guildId_userId: { guildId, userId: listing.sellerId } },
      data: { balance: { increment: listing.price } },
    }),
    prisma.rpgInventoryItem.upsert({
      where: { rpgProfileId_itemId: { rpgProfileId: buyerProfile.id, itemId: listing.itemId } },
      create: { rpgProfileId: buyerProfile.id, itemId: listing.itemId, quantity: listing.quantity },
      update: { quantity: { increment: listing.quantity } },
    }),
    prisma.marketplaceListing.update({
      where: { id: listingId },
      data: { status: 'SOLD' },
    }),
    prisma.marketplaceTransaction.create({
      data: {
        guildId,
        listingId,
        sellerId: listing.sellerId,
        buyerId,
        itemId: listing.itemId,
        quantity: listing.quantity,
        price: listing.price,
      },
    }),
  ]);

  return {
    success: true,
    listing: {
      itemId: listing.itemId,
      quantity: listing.quantity,
      price: listing.price,
      sellerId: listing.sellerId,
    },
  };
}

export async function placeBid(
  guildId: string,
  bidderId: string,
  listingId: string,
  amount: number,
): Promise<{ success: boolean; error?: string; listing?: { itemId: string } }> {
  const listing = await prismaRead.marketplaceListing.findFirst({
    where: { id: listingId, guildId, status: 'ACTIVE', type: 'AUCTION' },
  });

  if (!listing) return { success: false, error: 'Enchère introuvable.' };
  if (listing.sellerId === bidderId) return { success: false, error: 'Vous ne pouvez pas enchérir sur votre propre annonce.' };
  if (listing.expiresAt < new Date()) return { success: false, error: 'Cette enchère a expiré.' };

  const minBid = (listing.currentBid ?? listing.price) + 1;
  if (amount < minBid) return { success: false, error: `L'enchère minimum est de ${minBid} coins.` };

  const bidderProfile = await prismaRead.rpgProfile.findUnique({
    where: { guildId_userId: { guildId, userId: bidderId } },
  });
  if (!bidderProfile || bidderProfile.balance < amount) {
    return { success: false, error: 'Fonds insuffisants.' };
  }

  if (listing.bidderId) {
    await prisma.rpgProfile.update({
      where: { guildId_userId: { guildId, userId: listing.bidderId } },
      data: { balance: { increment: listing.currentBid! } },
    });
  }

  await prisma.$transaction([
    prisma.rpgProfile.update({
      where: { guildId_userId: { guildId, userId: bidderId } },
      data: { balance: { decrement: amount } },
    }),
    prisma.marketplaceListing.update({
      where: { id: listingId },
      data: { currentBid: amount, bidderId },
    }),
  ]);

  return { success: true, listing: { itemId: listing.itemId } };
}

export async function cancelListing(
  guildId: string,
  userId: string,
  listingId: string,
): Promise<{ success: boolean; error?: string; listing?: { itemId: string } }> {
  const listing = await prismaRead.marketplaceListing.findFirst({
    where: { id: listingId, guildId, sellerId: userId, status: 'ACTIVE' },
  });
  if (!listing) return { success: false, error: 'Annonce introuvable.' };

  if (listing.bidderId && listing.currentBid) {
    await prisma.rpgProfile.update({
      where: { guildId_userId: { guildId, userId: listing.bidderId } },
      data: { balance: { increment: listing.currentBid } },
    });
  }

  const sellerProfile = await prismaRead.rpgProfile.findUnique({
    where: { guildId_userId: { guildId, userId } },
  });

  if (sellerProfile) {
    await prisma.rpgInventoryItem.upsert({
      where: { rpgProfileId_itemId: { rpgProfileId: sellerProfile.id, itemId: listing.itemId } },
      create: { rpgProfileId: sellerProfile.id, itemId: listing.itemId, quantity: listing.quantity },
      update: { quantity: { increment: listing.quantity } },
    });
  }

  await prisma.marketplaceListing.update({
    where: { id: listingId },
    data: { status: 'CANCELLED' },
  });

  return { success: true, listing: { itemId: listing.itemId } };
}

export async function processExpiredListings(guildId?: string): Promise<void> {
  const where: any = { status: 'ACTIVE', expiresAt: { lt: new Date() } };
  if (guildId) where.guildId = guildId;

  const expired = await prismaRead.marketplaceListing.findMany({ where });

  for (const listing of expired) {
    try {
      if (listing.type === 'AUCTION' && listing.bidderId && listing.currentBid) {
        const sellerProfile = await prismaRead.rpgProfile.findUnique({
          where: { guildId_userId: { guildId: listing.guildId, userId: listing.sellerId } },
        });

        await prisma.$transaction([
          prisma.rpgProfile.update({
            where: { guildId_userId: { guildId: listing.guildId, userId: listing.sellerId } },
            data: { balance: { increment: listing.currentBid } },
          }),
          ...(sellerProfile ? [] : []),
          prisma.marketplaceListing.update({
            where: { id: listing.id },
            data: { status: 'SOLD' },
          }),
          prisma.marketplaceTransaction.create({
            data: {
              guildId: listing.guildId,
              listingId: listing.id,
              sellerId: listing.sellerId,
              buyerId: listing.bidderId,
              itemId: listing.itemId,
              quantity: listing.quantity,
              price: listing.currentBid,
            },
          }),
        ]);

        const buyerProfile = await prismaRead.rpgProfile.findUnique({
          where: { guildId_userId: { guildId: listing.guildId, userId: listing.bidderId } },
        });
        if (buyerProfile) {
          await prisma.rpgInventoryItem.upsert({
            where: { rpgProfileId_itemId: { rpgProfileId: buyerProfile.id, itemId: listing.itemId } },
            create: { rpgProfileId: buyerProfile.id, itemId: listing.itemId, quantity: listing.quantity },
            update: { quantity: { increment: listing.quantity } },
          });
        }
      } else {
        const sellerProfile = await prismaRead.rpgProfile.findUnique({
          where: { guildId_userId: { guildId: listing.guildId, userId: listing.sellerId } },
        });

        if (sellerProfile) {
          await prisma.rpgInventoryItem.upsert({
            where: { rpgProfileId_itemId: { rpgProfileId: sellerProfile.id, itemId: listing.itemId } },
            create: { rpgProfileId: sellerProfile.id, itemId: listing.itemId, quantity: listing.quantity },
            update: { quantity: { increment: listing.quantity } },
          });
        }

        await prisma.marketplaceListing.update({
          where: { id: listing.id },
          data: { status: 'EXPIRED' },
        });
      }
    } catch (error) {
      logger.error('Marketplace', `Erreur traitement expiration listing ${listing.id}:`, error);
    }
  }
}

export async function getActiveListings(guildId: string, page = 0, limit = 20) {
  const [listings, total] = await Promise.all([
    prismaRead.marketplaceListing.findMany({
      where: { guildId, status: 'ACTIVE', expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      skip: page * limit,
      take: limit,
    }),
    prismaRead.marketplaceListing.count({
      where: { guildId, status: 'ACTIVE', expiresAt: { gt: new Date() } },
    }),
  ]);

  return { listings, total, page, totalPages: Math.ceil(total / limit) };
}

export async function getMyListings(guildId: string, userId: string) {
  return prismaRead.marketplaceListing.findMany({
    where: { guildId, sellerId: userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}

export async function getTransactionHistory(guildId: string, userId?: string, limit = 30) {
  const where: any = { guildId };
  if (userId) where.OR = [{ sellerId: userId }, { buyerId: userId }];

  return prismaRead.marketplaceTransaction.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function getMarketplaceDashboardData(guildId: string) {
  const [active, recent, totalTransactions, totalVolume] = await Promise.all([
    getActiveListings(guildId, 0, 50),
    getTransactionHistory(guildId, undefined, 30),
    prismaRead.marketplaceTransaction.count({ where: { guildId } }),
    prismaRead.marketplaceTransaction.aggregate({
      where: { guildId },
      _sum: { price: true },
    }),
  ]);

  return {
    activeListings: active.listings,
    recentTransactions: recent,
    totalTransactions,
    totalVolume: totalVolume._sum.price ?? 0,
  };
}
