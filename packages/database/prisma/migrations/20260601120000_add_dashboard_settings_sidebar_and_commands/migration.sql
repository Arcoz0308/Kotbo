-- dashboard_settings: colonnes utilisées par getOrCreateRuntime / getGuildState
ALTER TABLE "dashboard_settings"
  ADD COLUMN IF NOT EXISTS "commandRestrictions" JSONB,
  ADD COLUMN IF NOT EXISTS "sidebarFavorites" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- dashboard_audit_logs: salon lié à l'entrée d'audit
ALTER TABLE "dashboard_audit_logs"
  ADD COLUMN IF NOT EXISTS "channelId" TEXT;
