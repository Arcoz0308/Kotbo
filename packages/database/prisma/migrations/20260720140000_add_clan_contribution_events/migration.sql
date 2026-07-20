-- CreateTable
CREATE TABLE "clan_contribution_events" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "clanId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "season" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clan_contribution_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clan_contribution_events_guildId_createdAt_idx" ON "clan_contribution_events"("guildId", "createdAt");

-- AddForeignKey
ALTER TABLE "clan_contribution_events" ADD CONSTRAINT "clan_contribution_events_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clan_contribution_events" ADD CONSTRAINT "clan_contribution_events_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
