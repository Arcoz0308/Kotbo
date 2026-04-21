ALTER TABLE "guilds"
ADD COLUMN IF NOT EXISTS "meetingAnnouncementChannelId" TEXT,
ADD COLUMN IF NOT EXISTS "meetingVoiceChannelId" TEXT;
