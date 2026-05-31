-- AlterTable: add granular toggles for nickname moderation
ALTER TABLE "guilds"
  ADD COLUMN "nickModOnJoin" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "nickModOnUpdate" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "nickModCheckInvisible" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "nickModCheckGlobal" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "nickModCheckCustom" BOOLEAN NOT NULL DEFAULT true;
