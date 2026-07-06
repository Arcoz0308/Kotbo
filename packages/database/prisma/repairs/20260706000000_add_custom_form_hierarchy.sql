ALTER TABLE "custom_forms"
ADD COLUMN IF NOT EXISTS "hierarchyId" TEXT;

CREATE INDEX IF NOT EXISTS "custom_forms_hierarchyId_idx"
  ON "custom_forms"("hierarchyId");

DO $$ BEGIN
  ALTER TABLE "custom_forms"
  ADD CONSTRAINT "custom_forms_hierarchyId_fkey"
  FOREIGN KEY ("hierarchyId") REFERENCES "staff_hierarchies"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
