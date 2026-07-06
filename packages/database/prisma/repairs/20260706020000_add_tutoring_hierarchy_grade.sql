ALTER TABLE "tutoring_items"
  ADD COLUMN IF NOT EXISTS "hierarchyId" TEXT,
  ADD COLUMN IF NOT EXISTS "grade" TEXT;

ALTER TABLE "testing_periods"
ADD COLUMN IF NOT EXISTS "hierarchyId" TEXT;

CREATE INDEX IF NOT EXISTS "tutoring_items_guildId_hierarchyId_grade_idx"
  ON "tutoring_items"("guildId", "hierarchyId", "grade");

CREATE INDEX IF NOT EXISTS "testing_periods_guildId_hierarchyId_idx"
  ON "testing_periods"("guildId", "hierarchyId");

DO $$ BEGIN
  ALTER TABLE "tutoring_items"
  ADD CONSTRAINT "tutoring_items_hierarchyId_fkey"
  FOREIGN KEY ("hierarchyId") REFERENCES "staff_hierarchies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "testing_periods"
  ADD CONSTRAINT "testing_periods_hierarchyId_fkey"
  FOREIGN KEY ("hierarchyId") REFERENCES "staff_hierarchies"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
