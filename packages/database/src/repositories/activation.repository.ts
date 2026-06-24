import type { Prisma, PrismaClient, ActivationCode } from '@prisma/client';
import crypto from 'node:crypto';

type DbClient = PrismaClient | Prisma.TransactionClient;

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

export class ActivationRepository {
  constructor(private readonly db: DbClient) {}

  async findActiveByCode(code: string): Promise<ActivationCode | null> {
    return this.db.activationCode.findUnique({
      where: { code },
    });
  }

  async activateGuildAtomically(
    tx: Prisma.TransactionClient,
    guildId: string,
    normalizedCode: string,
  ): Promise<void> {
    const activationCode = await tx.activationCode.findUnique({
      where: { code: normalizedCode },
    });

    if (!activationCode || !activationCode.isActive || activationCode.usedAt) {
      throw new Error('Code invalide, déjà utilisé ou expiré.');
    }

    await tx.activationCode.update({
      where: { code: normalizedCode },
      data: {
        usedAt: new Date(),
        usedByGuildId: guildId,
        isActive: false,
      },
    });

    await tx.guild.upsert({
      where: { id: guildId },
      update: {
        activated: true,
        activatedAt: new Date(),
        activationCode: hashCode(normalizedCode),
      },
      create: {
        id: guildId,
        activated: true,
        activatedAt: new Date(),
        activationCode: hashCode(normalizedCode),
      },
    });
  }
}
