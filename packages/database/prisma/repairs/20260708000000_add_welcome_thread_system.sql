CREATE TABLE IF NOT EXISTS "welcome_thread_configs" (
    "guildId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "channelId" TEXT,
    "threadNameTemplate" TEXT NOT NULL DEFAULT '👋 Bienvenue {username} !',
    "threadMode" TEXT NOT NULL DEFAULT 'public',
    "autoArchiveMinutes" INTEGER NOT NULL DEFAULT 1440,
    "typingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "webhookName" TEXT NOT NULL DEFAULT 'Kotbo',
    "webhookAvatarUrl" TEXT,
    "menuEnabled" BOOLEAN NOT NULL DEFAULT true,
    "menuStyle" TEXT NOT NULL DEFAULT 'buttons',
    "menuPlaceholder" TEXT NOT NULL DEFAULT 'Découvrir le serveur...',
    "embedTitle" TEXT NOT NULL DEFAULT 'Bienvenue sur {server} !',
    "embedDescription" TEXT NOT NULL DEFAULT 'Explore les sections ci-dessous pour découvrir le serveur. 👇',
    "embedColor" TEXT NOT NULL DEFAULT '#5865F2',
    "embedImageUrl" TEXT,
    "embedThumbnailUrl" TEXT,

    CONSTRAINT "welcome_thread_configs_pkey" PRIMARY KEY ("guildId")
);

CREATE TABLE IF NOT EXISTS "welcome_thread_steps" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "content" TEXT NOT NULL,
    "name" TEXT,
    "avatarUrl" TEXT,
    "delayMs" INTEGER NOT NULL DEFAULT 3000,

    CONSTRAINT "welcome_thread_steps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "welcome_menu_pages" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "label" TEXT NOT NULL,
    "emoji" TEXT,
    "summary" TEXT,
    "embedTitle" TEXT NOT NULL,
    "embedDescription" TEXT NOT NULL,
    "embedColor" TEXT NOT NULL DEFAULT '#5865F2',
    "embedImageUrl" TEXT,
    "embedThumbnailUrl" TEXT,

    CONSTRAINT "welcome_menu_pages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "welcome_thread_steps_guildId_order_idx" ON "welcome_thread_steps"("guildId", "order");

CREATE INDEX IF NOT EXISTS "welcome_menu_pages_guildId_order_idx" ON "welcome_menu_pages"("guildId", "order");

DO $$ BEGIN
  ALTER TABLE "welcome_thread_configs" ADD CONSTRAINT "welcome_thread_configs_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "welcome_thread_steps" ADD CONSTRAINT "welcome_thread_steps_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "welcome_thread_configs"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "welcome_menu_pages" ADD CONSTRAINT "welcome_menu_pages_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "welcome_thread_configs"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
