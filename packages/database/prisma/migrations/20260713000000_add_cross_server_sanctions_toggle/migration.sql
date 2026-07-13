-- AlterTable
ALTER TABLE "guilds" ADD COLUMN     "crossServerSanctionsEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "sanctions_targetUserId_createdAt_idx" ON "sanctions"("targetUserId", "createdAt");
