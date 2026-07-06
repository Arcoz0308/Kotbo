-- Permet d'avoir plusieurs checklists de tutorat selon la hiérarchie/grade ciblé.
-- Un item sans hierarchyId/grade reste commun à toutes les checklists.

-- AlterTable
ALTER TABLE "tutoring_items" ADD COLUMN "hierarchyId" TEXT;
ALTER TABLE "tutoring_items" ADD COLUMN "grade" TEXT;

-- AlterTable
ALTER TABLE "testing_periods" ADD COLUMN "hierarchyId" TEXT;

-- CreateIndex
CREATE INDEX "tutoring_items_guildId_hierarchyId_grade_idx" ON "tutoring_items"("guildId", "hierarchyId", "grade");

-- CreateIndex
CREATE INDEX "testing_periods_guildId_hierarchyId_idx" ON "testing_periods"("guildId", "hierarchyId");

-- AddForeignKey
ALTER TABLE "tutoring_items" ADD CONSTRAINT "tutoring_items_hierarchyId_fkey" FOREIGN KEY ("hierarchyId") REFERENCES "staff_hierarchies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "testing_periods" ADD CONSTRAINT "testing_periods_hierarchyId_fkey" FOREIGN KEY ("hierarchyId") REFERENCES "staff_hierarchies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
