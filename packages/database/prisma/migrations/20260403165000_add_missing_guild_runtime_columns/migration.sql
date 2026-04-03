ALTER TABLE "guilds"
ADD COLUMN IF NOT EXISTS "dailyAlgoEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "dailyAlgoChannelId" TEXT,
ADD COLUMN IF NOT EXISTS "dailyAlgoTime" TEXT NOT NULL DEFAULT '09:00',
ADD COLUMN IF NOT EXISTS "githubReleasesEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "githubReleasesChannelId" TEXT,
ADD COLUMN IF NOT EXISTS "githubRepositories" TEXT[] NOT NULL DEFAULT ARRAY['facebook/react', 'docker/compose', 'microsoft/typescript', 'vercel/next.js', 'sveltejs/svelte']::TEXT[],
ADD COLUMN IF NOT EXISTS "statusCheckChannelId" TEXT;
