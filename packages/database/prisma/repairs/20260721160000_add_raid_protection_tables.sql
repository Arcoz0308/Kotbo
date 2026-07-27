CREATE TABLE IF NOT EXISTS "raid_protection_configs" (
  "guildId" TEXT NOT NULL,
  "captchaEnabled" BOOLEAN NOT NULL DEFAULT false,
  "captchaChannelId" TEXT,
  "captchaUnverifiedRoleId" TEXT,
  "captchaTimeoutMinutes" INTEGER NOT NULL DEFAULT 10,
  "captchaMaxAttempts" INTEGER NOT NULL DEFAULT 3,
  "captchaFailAction" TEXT NOT NULL DEFAULT 'KICK',
  "captchaLogChannelId" TEXT,
  "antiRaidEnabled" BOOLEAN NOT NULL DEFAULT false,
  "antiRaidJoinThreshold" INTEGER NOT NULL DEFAULT 10,
  "antiRaidJoinWindowSec" INTEGER NOT NULL DEFAULT 60,
  "antiRaidAction" TEXT NOT NULL DEFAULT 'LOCK',
  "antiRaidAlertChannelId" TEXT,
  "antiRaidAutoDisableMinutes" INTEGER NOT NULL DEFAULT 30,
  "raidModeActive" BOOLEAN NOT NULL DEFAULT false,
  "raidModeActivatedAt" TIMESTAMP(3),
  "raidModeManual" BOOLEAN NOT NULL DEFAULT false,
  "joinLockEnabled" BOOLEAN NOT NULL DEFAULT false,
  "joinLockUntil" TIMESTAMP(3),
  "joinLockKick" BOOLEAN NOT NULL DEFAULT true,
  "joinLockMessage" TEXT NOT NULL DEFAULT 'Le serveur est temporairement fermé aux nouvelles arrivées. Merci de réessayer plus tard.',
  "dmLockEnabled" BOOLEAN NOT NULL DEFAULT false,
  "dmLockUntil" TIMESTAMP(3),
  "reportsEnabled" BOOLEAN NOT NULL DEFAULT false,
  "reportsChannelId" TEXT,
  "reportsCooldownSec" INTEGER NOT NULL DEFAULT 60,
  "reportsAnonymous" BOOLEAN NOT NULL DEFAULT false,
  "tagRoleEnabled" BOOLEAN NOT NULL DEFAULT false,
  "tagRoleId" TEXT,
  "scamFilterEnabled" BOOLEAN NOT NULL DEFAULT false,
  "scamFilterAction" TEXT NOT NULL DEFAULT 'DELETE_AND_TIMEOUT',
  "scamFilterTimeoutMin" INTEGER NOT NULL DEFAULT 60,
  "scamFilterCustomDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "scamFilterWhitelist" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "scamFilterAlertChannelId" TEXT,
  "scamImageFilterEnabled" BOOLEAN NOT NULL DEFAULT false,
  "inviteGuardEnabled" BOOLEAN NOT NULL DEFAULT false,
  "inviteEmergencyEnabled" BOOLEAN NOT NULL DEFAULT false,
  "inviteRequireUnitary" BOOLEAN NOT NULL DEFAULT false,
  "inviteValidationEnabled" BOOLEAN NOT NULL DEFAULT false,
  "inviteSpamThreshold" INTEGER NOT NULL DEFAULT 5,
  "inviteSpamWindowSec" INTEGER NOT NULL DEFAULT 60,
  "inviteAlertChannelId" TEXT,
  "inviteBypassRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "raid_protection_configs"
  ADD COLUMN IF NOT EXISTS "captchaEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "captchaChannelId" TEXT,
  ADD COLUMN IF NOT EXISTS "captchaUnverifiedRoleId" TEXT,
  ADD COLUMN IF NOT EXISTS "captchaTimeoutMinutes" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS "captchaMaxAttempts" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "captchaFailAction" TEXT NOT NULL DEFAULT 'KICK',
  ADD COLUMN IF NOT EXISTS "captchaLogChannelId" TEXT,
  ADD COLUMN IF NOT EXISTS "antiRaidEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "antiRaidJoinThreshold" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS "antiRaidJoinWindowSec" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS "antiRaidAction" TEXT NOT NULL DEFAULT 'LOCK',
  ADD COLUMN IF NOT EXISTS "antiRaidAlertChannelId" TEXT,
  ADD COLUMN IF NOT EXISTS "antiRaidAutoDisableMinutes" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "raidModeActive" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "raidModeActivatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "raidModeManual" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "joinLockEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "joinLockUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "joinLockKick" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "joinLockMessage" TEXT NOT NULL DEFAULT 'Le serveur est temporairement fermé aux nouvelles arrivées. Merci de réessayer plus tard.',
  ADD COLUMN IF NOT EXISTS "dmLockEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "dmLockUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reportsEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "reportsChannelId" TEXT,
  ADD COLUMN IF NOT EXISTS "reportsCooldownSec" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS "reportsAnonymous" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "tagRoleEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "tagRoleId" TEXT,
  ADD COLUMN IF NOT EXISTS "scamFilterEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "scamFilterAction" TEXT NOT NULL DEFAULT 'DELETE_AND_TIMEOUT',
  ADD COLUMN IF NOT EXISTS "scamFilterTimeoutMin" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS "scamFilterCustomDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "scamFilterWhitelist" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "scamFilterAlertChannelId" TEXT,
  ADD COLUMN IF NOT EXISTS "scamImageFilterEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "inviteGuardEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "inviteEmergencyEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "inviteRequireUnitary" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "inviteValidationEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "inviteSpamThreshold" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS "inviteSpamWindowSec" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS "inviteAlertChannelId" TEXT,
  ADD COLUMN IF NOT EXISTS "inviteBypassRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "raid_protection_configs"
  ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE TABLE IF NOT EXISTS "captcha_sessions" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "messageId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "captcha_sessions"
  ADD COLUMN IF NOT EXISTS "guildId" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "userId" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "code" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "messageId" TEXT,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "captcha_sessions"
  ALTER COLUMN "guildId" DROP DEFAULT,
  ALTER COLUMN "userId" DROP DEFAULT,
  ALTER COLUMN "code" DROP DEFAULT,
  ALTER COLUMN "expiresAt" DROP DEFAULT;

CREATE TABLE IF NOT EXISTS "scam_image_hashes" (
  "id" TEXT NOT NULL,
  "guildId" TEXT,
  "hash" TEXT NOT NULL,
  "filename" TEXT,
  "source" TEXT NOT NULL DEFAULT 'HONEYPOT',
  "addedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "scam_image_hashes"
  ADD COLUMN IF NOT EXISTS "guildId" TEXT,
  ADD COLUMN IF NOT EXISTS "hash" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "filename" TEXT,
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'HONEYPOT',
  ADD COLUMN IF NOT EXISTS "addedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "scam_image_hashes"
  ALTER COLUMN "hash" DROP DEFAULT;

CREATE TABLE IF NOT EXISTS "invite_approval_requests" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "creatorId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "inviteCode" TEXT,
  "maxUses" INTEGER NOT NULL DEFAULT 1,
  "maxAgeSec" INTEGER NOT NULL DEFAULT 86400,
  "temporary" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "handledById" TEXT,
  "handledAt" TIMESTAMP(3),
  "approvedInviteCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "invite_approval_requests"
  ADD COLUMN IF NOT EXISTS "guildId" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "creatorId" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "channelId" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "inviteCode" TEXT,
  ADD COLUMN IF NOT EXISTS "maxUses" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "maxAgeSec" INTEGER NOT NULL DEFAULT 86400,
  ADD COLUMN IF NOT EXISTS "temporary" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "handledById" TEXT,
  ADD COLUMN IF NOT EXISTS "handledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approvedInviteCode" TEXT,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "invite_approval_requests"
  ALTER COLUMN "guildId" DROP DEFAULT,
  ALTER COLUMN "creatorId" DROP DEFAULT,
  ALTER COLUMN "channelId" DROP DEFAULT;

CREATE TABLE IF NOT EXISTS "member_reports" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "reporterId" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "channelId" TEXT,
  "messageId" TEXT,
  "messageContent" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "handledById" TEXT,
  "handledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "member_reports"
  ADD COLUMN IF NOT EXISTS "guildId" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "reporterId" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "targetId" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "reason" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "channelId" TEXT,
  ADD COLUMN IF NOT EXISTS "messageId" TEXT,
  ADD COLUMN IF NOT EXISTS "messageContent" TEXT,
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "handledById" TEXT,
  ADD COLUMN IF NOT EXISTS "handledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "member_reports"
  ALTER COLUMN "guildId" DROP DEFAULT,
  ALTER COLUMN "reporterId" DROP DEFAULT,
  ALTER COLUMN "targetId" DROP DEFAULT,
  ALTER COLUMN "reason" DROP DEFAULT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'raid_protection_configs_pkey') THEN
    ALTER TABLE "raid_protection_configs" ADD CONSTRAINT "raid_protection_configs_pkey" PRIMARY KEY ("guildId");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'captcha_sessions_pkey') THEN
    ALTER TABLE "captcha_sessions" ADD CONSTRAINT "captcha_sessions_pkey" PRIMARY KEY ("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scam_image_hashes_pkey') THEN
    ALTER TABLE "scam_image_hashes" ADD CONSTRAINT "scam_image_hashes_pkey" PRIMARY KEY ("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invite_approval_requests_pkey') THEN
    ALTER TABLE "invite_approval_requests" ADD CONSTRAINT "invite_approval_requests_pkey" PRIMARY KEY ("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'member_reports_pkey') THEN
    ALTER TABLE "member_reports" ADD CONSTRAINT "member_reports_pkey" PRIMARY KEY ("id");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "captcha_sessions_guildId_userId_status_idx" ON "captcha_sessions"("guildId", "userId", "status");
CREATE INDEX IF NOT EXISTS "captcha_sessions_status_expiresAt_idx" ON "captcha_sessions"("status", "expiresAt");
CREATE INDEX IF NOT EXISTS "scam_image_hashes_hash_idx" ON "scam_image_hashes"("hash");
CREATE UNIQUE INDEX IF NOT EXISTS "scam_image_hashes_guildId_hash_key" ON "scam_image_hashes"("guildId", "hash");
CREATE INDEX IF NOT EXISTS "invite_approval_requests_guildId_status_idx" ON "invite_approval_requests"("guildId", "status");
CREATE INDEX IF NOT EXISTS "member_reports_guildId_status_createdAt_idx" ON "member_reports"("guildId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "member_reports_guildId_targetId_idx" ON "member_reports"("guildId", "targetId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'raid_protection_configs_guildId_fkey') THEN
    ALTER TABLE "raid_protection_configs" ADD CONSTRAINT "raid_protection_configs_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'captcha_sessions_guildId_fkey') THEN
    ALTER TABLE "captcha_sessions" ADD CONSTRAINT "captcha_sessions_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scam_image_hashes_guildId_fkey') THEN
    ALTER TABLE "scam_image_hashes" ADD CONSTRAINT "scam_image_hashes_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invite_approval_requests_guildId_fkey') THEN
    ALTER TABLE "invite_approval_requests" ADD CONSTRAINT "invite_approval_requests_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'member_reports_guildId_fkey') THEN
    ALTER TABLE "member_reports" ADD CONSTRAINT "member_reports_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
