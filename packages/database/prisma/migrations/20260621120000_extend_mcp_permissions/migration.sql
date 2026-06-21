-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.

ALTER TYPE "McpKeyPermission" ADD VALUE 'READ_COMMUNITY' BEFORE 'WRITE_SANCTIONS';
ALTER TYPE "McpKeyPermission" ADD VALUE 'WRITE_MESSAGES';
ALTER TYPE "McpKeyPermission" ADD VALUE 'WRITE_TICKETS';
