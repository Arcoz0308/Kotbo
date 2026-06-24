import type { PrismaClient } from '@prisma/client';

export interface RetentionConfig {
  auditLogDays: number;
  analyticsSnapshotDays: number;
  expiredVerificationDays: number;
}

const DEFAULT_RETENTION: RetentionConfig = {
  auditLogDays: 90,
  analyticsSnapshotDays: 90,
  expiredVerificationDays: 7,
};

export class DataRetentionService {
  constructor(
    private readonly db: PrismaClient,
    private readonly config: RetentionConfig = DEFAULT_RETENTION,
  ) {}

  async runRetention(guildId: string): Promise<{
    auditLogsDeleted: number;
    verificationsDeleted: number;
  }> {
    const auditCutoff = new Date(
      Date.now() - this.config.auditLogDays * 86_400_000,
    );
    const verificationCutoff = new Date(
      Date.now() - this.config.expiredVerificationDays * 86_400_000,
    );

    const [auditResult, verificationResult] = await Promise.all([
      this.db.dashboardAuditLog.deleteMany({
        where: { guildId, dateIso: { lt: auditCutoff } },
      }),
      this.db.securityVerification.deleteMany({
        where: {
          guildId,
          expiresAt: { lt: verificationCutoff },
          status: { in: ['PENDING', 'EXPIRED'] },
        },
      }),
    ]);

    return {
      auditLogsDeleted: auditResult.count,
      verificationsDeleted: verificationResult.count,
    };
  }

  async runRetentionAllGuilds(): Promise<number> {
    const guilds = await this.db.guild.findMany({
      where: { activated: true },
      select: { id: true },
    });

    let totalDeleted = 0;
    for (const guild of guilds) {
      const result = await this.runRetention(guild.id);
      totalDeleted += result.auditLogsDeleted + result.verificationsDeleted;
    }
    return totalDeleted;
  }
}
