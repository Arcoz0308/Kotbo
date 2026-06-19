-- AlterTable
ALTER TABLE "global_admins" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "global_admins" ADD COLUMN "reason" TEXT;
