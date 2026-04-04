-- CreateEnum
CREATE TYPE "CodePoliceRuleCategory" AS ENUM ('SIGNAL', 'DANGER', 'LANGUAGE_FEEDBACK');

-- CreateEnum
CREATE TYPE "CodePoliceMatchType" AS ENUM ('EXACT', 'REGEX');

-- CreateEnum
CREATE TYPE "CodePoliceSeverity" AS ENUM ('INFO', 'WARNING', 'DANGER');

-- CreateTable
CREATE TABLE "code_police_rules" (
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

-- CreateIndex
CREATE UNIQUE INDEX "code_police_rules_key_key" ON "code_police_rules"("key");

-- CreateIndex
CREATE INDEX "code_police_rules_guildId_category_idx" ON "code_police_rules"("guildId", "category");

-- CreateIndex
CREATE INDEX "code_police_rules_category_enabled_idx" ON "code_police_rules"("category", "enabled");

-- CreateIndex
CREATE INDEX "code_police_rules_language_idx" ON "code_police_rules"("language");

-- AddForeignKey
ALTER TABLE "code_police_rules" ADD CONSTRAINT "code_police_rules_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
