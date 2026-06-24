import type { Prisma, PrismaClient, Guild } from '@prisma/client';

type DbClient = PrismaClient | Prisma.TransactionClient;

const GUILD_VERIFICATION_SELECT = {
  id: true,
  verificationEnabled: true,
  verificationMode: true,
  verificationAction: true,
  verificationChannelId: true,
  verificationRoleId: true,
  verificationLogChannelId: true,
  verificationEmbedTitle: true,
  verificationEmbedDesc: true,
  verificationEmbedColor: true,
  verificationOnJoin: true,
} as const satisfies Prisma.GuildSelect;

export type GuildVerificationConfig = Prisma.GuildGetPayload<{
  select: typeof GUILD_VERIFICATION_SELECT;
}>;

export class GuildRepository {
  constructor(private readonly db: DbClient) {}

  async findById(guildId: string): Promise<Guild | null> {
    return this.db.guild.findUnique({ where: { id: guildId } });
  }

  async getVerificationConfig(guildId: string): Promise<GuildVerificationConfig | null> {
    return this.db.guild.findUnique({
      where: { id: guildId },
      select: GUILD_VERIFICATION_SELECT,
    });
  }

  async upsert(guildId: string, data: Partial<Prisma.GuildCreateInput>): Promise<Guild> {
    return this.db.guild.upsert({
      where: { id: guildId },
      update: data,
      create: { id: guildId, ...data },
    });
  }

  async isActivated(guildId: string): Promise<boolean> {
    const guild = await this.db.guild.findUnique({
      where: { id: guildId },
      select: { activated: true },
    });
    return guild?.activated ?? false;
  }

  async listActivatedIds(): Promise<string[]> {
    const guilds = await this.db.guild.findMany({
      where: { activated: true },
      select: { id: true },
    });
    return guilds.map((g) => g.id);
  }
}
