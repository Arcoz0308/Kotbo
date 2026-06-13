DO $$ BEGIN
  CREATE TYPE "CodePoliceRuleCategory" AS ENUM ('SIGNAL', 'DANGER', 'LANGUAGE_FEEDBACK');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "CodePoliceMatchType" AS ENUM ('EXACT', 'REGEX');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "CodePoliceSeverity" AS ENUM ('INFO', 'WARNING', 'DANGER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "code_police_rules" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "guildId" TEXT,
  "category" "CodePoliceRuleCategory" NOT NULL,
  "matchType" "CodePoliceMatchType" NOT NULL DEFAULT 'EXACT',
  "language" TEXT,
  "pattern" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "feedback" TEXT NOT NULL,
  "severity" "CodePoliceSeverity" NOT NULL DEFAULT 'WARNING',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "code_police_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "code_police_rules_key_key" ON "code_police_rules"("key");
CREATE INDEX IF NOT EXISTS "code_police_rules_guildId_category_idx" ON "code_police_rules"("guildId", "category");
CREATE INDEX IF NOT EXISTS "code_police_rules_category_enabled_idx" ON "code_police_rules"("category", "enabled");
CREATE INDEX IF NOT EXISTS "code_police_rules_language_idx" ON "code_police_rules"("language");

DO $$ BEGIN
  ALTER TABLE "code_police_rules"
  ADD CONSTRAINT "code_police_rules_guildId_fkey"
  FOREIGN KEY ("guildId") REFERENCES "guilds"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
