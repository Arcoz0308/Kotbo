-- Lie un CustomForm de recrutement à une StaffHierarchy pour que l'embauche
-- (completeOral) attribue le rôle/grade de la bonne hiérarchie (ex: Modération
-- vs Animation) au lieu du rôle le plus bas toutes hiérarchies confondues.

-- AlterTable
ALTER TABLE "custom_forms" ADD COLUMN "hierarchyId" TEXT;

-- CreateIndex
CREATE INDEX "custom_forms_hierarchyId_idx" ON "custom_forms"("hierarchyId");

-- AddForeignKey
ALTER TABLE "custom_forms" ADD CONSTRAINT "custom_forms_hierarchyId_fkey" FOREIGN KEY ("hierarchyId") REFERENCES "staff_hierarchies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
