CREATE TABLE IF NOT EXISTS "dashboard_feature_role_accesses" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "featureConfigId" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "canView" BOOLEAN NOT NULL DEFAULT false,
  "canModerate" BOOLEAN NOT NULL DEFAULT false,
  "canConfigure" BOOLEAN NOT NULL DEFAULT false,
  "canDelete" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "dashboard_feature_role_accesses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "dashboard_feature_role_accesses_featureConfigId_roleId_key"
ON "dashboard_feature_role_accesses"("featureConfigId", "roleId");

CREATE INDEX IF NOT EXISTS "dashboard_feature_role_accesses_guildId_featureConfigId_idx"
ON "dashboard_feature_role_accesses"("guildId", "featureConfigId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'dashboard_feature_role_accesses_featureConfigId_fkey'
  ) THEN
    ALTER TABLE "dashboard_feature_role_accesses"
    ADD CONSTRAINT "dashboard_feature_role_accesses_featureConfigId_fkey"
    FOREIGN KEY ("featureConfigId") REFERENCES "dashboard_feature_configs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
