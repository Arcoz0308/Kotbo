-- AlterTable
ALTER TABLE "level_configs" ADD COLUMN     "lengthBonusEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lengthBonusThreshold" INTEGER NOT NULL DEFAULT 200,
ADD COLUMN     "lengthBonusMaxMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 2.0;
