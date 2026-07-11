-- CreateEnum
CREATE TYPE "AdminPermissionRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AdminPermissionRequestType" AS ENUM ('ROLE_CREATE', 'ROLE_PERMISSION_EDIT', 'MEMBER_ROLE_GRANT');

-- AlterTable
ALTER TABLE "automod_configs" ADD COLUMN     "adminLockAction" TEXT NOT NULL DEFAULT 'BLOCK',
ADD COLUMN     "adminLockEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "adminLockNotifyChannelId" TEXT,
ADD COLUMN     "adminLockSecurityRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "burstSuspendEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "burstSuspendFastLimit" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "burstSuspendFastWindowSec" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "burstSuspendSlowLimit" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "burstSuspendSlowWindowSec" INTEGER NOT NULL DEFAULT 60;

-- CreateTable
CREATE TABLE "admin_permission_requests" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "type" "AdminPermissionRequestType" NOT NULL,
    "status" "AdminPermissionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "targetRoleId" TEXT,
    "targetRoleName" TEXT,
    "targetMemberId" TEXT,
    "requestedPermissionBits" TEXT NOT NULL,
    "pendingRoleCreatePayload" JSONB,
    "requestedByUserId" TEXT NOT NULL,
    "requestedByTag" TEXT,
    "requestedVia" TEXT NOT NULL,
    "requestReason" TEXT,
    "staffChannelId" TEXT,
    "staffMessageId" TEXT,
    "decidedByUserId" TEXT,
    "decidedByTag" TEXT,
    "decisionReason" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_permission_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_permission_requests_guildId_status_idx" ON "admin_permission_requests"("guildId", "status");

-- AddForeignKey
ALTER TABLE "admin_permission_requests" ADD CONSTRAINT "admin_permission_requests_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
