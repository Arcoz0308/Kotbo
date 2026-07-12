-- AlterTable
ALTER TABLE "auto_responses" ADD COLUMN     "responseDestination" TEXT NOT NULL DEFAULT 'DM',
ADD COLUMN     "responseChannelId" TEXT,
ADD COLUMN     "relayToStaffServer" BOOLEAN NOT NULL DEFAULT false;
