import type { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

export interface ActivateGuildResult {
  success: boolean;
  error?: string;
}

export class ActivationService {
  constructor(private readonly db: PrismaClient) {}

  async activateGuild(
    guildId: string,
    code: string,
  ): Promise<ActivateGuildResult> {
    const normalizedCode = code.trim().toUpperCase();

    try {
      await this.db.$transaction(async (tx) => {
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
      });

      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Erreur interne.',
      };
    }
  }

  async deactivateGuild(guildId: string): Promise<ActivateGuildResult> {
    try {
      const dbGuild = await this.db.guild.findUnique({
        where: { id: guildId },
        select: { activationCode: true },
      });

      await this.db.$transaction(async (tx) => {
        if (dbGuild?.activationCode) {
          await tx.activationCode
            .updateMany({
              where: { usedByGuildId: guildId },
              data: { usedAt: null, usedByGuildId: null, isActive: true },
            })
            .catch(() => null);
        }

        await tx.guild.update({
          where: { id: guildId },
          data: {
            activated: false,
            activatedAt: null,
            activationCode: null,
          },
        });
      });

      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Erreur interne.',
      };
    }
  }

  async listActivatedGuildIds(): Promise<string[]> {
    const guilds = await this.db.guild.findMany({
      where: { activated: true },
      select: { id: true },
    });
    return guilds.map((g) => g.id);
  }
}
