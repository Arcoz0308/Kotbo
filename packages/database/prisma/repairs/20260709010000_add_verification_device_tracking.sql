ALTER TABLE guilds ADD COLUMN "verificationSaveDevice" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE ban_appeal_configs ADD COLUMN "appealSaveDevice" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE security_verifications ADD COLUMN "deviceInfo" JSONB;
