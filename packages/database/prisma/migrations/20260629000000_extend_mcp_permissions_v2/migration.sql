-- AlterEnum
-- This migration adds new MCP permission values for economy, moderation,
-- analytics, community write, and member management capabilities.

ALTER TYPE "McpKeyPermission" ADD VALUE 'READ_ECONOMY' BEFORE 'WRITE_SANCTIONS';
ALTER TYPE "McpKeyPermission" ADD VALUE 'READ_MODERATION' BEFORE 'WRITE_SANCTIONS';
ALTER TYPE "McpKeyPermission" ADD VALUE 'READ_ANALYTICS' BEFORE 'WRITE_SANCTIONS';
ALTER TYPE "McpKeyPermission" ADD VALUE 'WRITE_COMMUNITY';
ALTER TYPE "McpKeyPermission" ADD VALUE 'WRITE_MEMBERS';
