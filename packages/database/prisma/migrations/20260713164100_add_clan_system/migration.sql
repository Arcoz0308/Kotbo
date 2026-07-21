-- AlterTable
ALTER TABLE "guilds" ADD COLUMN     "clansEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "clansUnique" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "currentClanSeason" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "clans" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clan_member_contributions" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "clanId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "season" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clan_member_contributions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clans_roleId_key" ON "clans"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "clans_guildId_name_key" ON "clans"("guildId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "clan_member_contributions_guildId_clanId_userId_season_key" ON "clan_member_contributions"("guildId", "clanId", "userId", "season");

-- AddForeignKey
ALTER TABLE "clans" ADD CONSTRAINT "clans_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clan_member_contributions" ADD CONSTRAINT "clan_member_contributions_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clan_member_contributions" ADD CONSTRAINT "clan_member_contributions_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
