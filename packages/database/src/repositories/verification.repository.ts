import type { Prisma, PrismaClient, SecurityVerification } from '@prisma/client';

type DbClient = PrismaClient | Prisma.TransactionClient;

export class VerificationRepository {
  constructor(private readonly db: DbClient) {}

  async findByToken(token: string): Promise<SecurityVerification | null> {
    return this.db.securityVerification.findFirst({
      where: {
        token,
        expiresAt: { gt: new Date() },
        status: 'PENDING',
      },
    });
  }

  async create(data: {
    guildId: string;
    userId: string;
    token: string;
    expiresAt: Date;
    ipAddress?: string;
  }): Promise<SecurityVerification> {
    return this.db.securityVerification.create({ data });
  }

  async markCompleted(
    id: string,
    verifiedDiscordId: string,
    ipAddress: string,
  ): Promise<SecurityVerification> {
    return this.db.securityVerification.update({
      where: { id },
      data: {
        status: 'VERIFIED',
        verifiedDiscordId,
        verifiedAt: new Date(),
        ipAddress,
      },
    });
  }

  async deleteExpired(): Promise<number> {
    const result = await this.db.securityVerification.deleteMany({
      where: { expiresAt: { lt: new Date() }, status: 'PENDING' },
    });
    return result.count;
  }
}
