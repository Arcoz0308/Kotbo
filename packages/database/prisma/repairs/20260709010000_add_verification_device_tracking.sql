ALTER TABLE guilds ADD COLUMN IF NOT EXISTS "verificationSaveDevice" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE ban_appeal_configs ADD COLUMN IF NOT EXISTS "appealSaveDevice" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE security_verifications ADD COLUMN IF NOT EXISTS "deviceInfo" JSONB;
