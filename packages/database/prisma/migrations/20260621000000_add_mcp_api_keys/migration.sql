-- CreateEnum
CREATE TYPE "McpKeyPermission" AS ENUM ('READ_STATS', 'READ_MEMBERS', 'READ_SANCTIONS', 'READ_STAFF', 'READ_TICKETS', 'WRITE_SANCTIONS');

-- CreateTable
CREATE TABLE "mcp_api_keys" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "displayKey" TEXT NOT NULL,
    "permissions" "McpKeyPermission"[] DEFAULT ARRAY[]::"McpKeyPermission"[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mcp_api_keys_keyHash_key" ON "mcp_api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "mcp_api_keys_guildId_isActive_idx" ON "mcp_api_keys"("guildId", "isActive");

-- AddForeignKey
ALTER TABLE "mcp_api_keys" ADD CONSTRAINT "mcp_api_keys_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
