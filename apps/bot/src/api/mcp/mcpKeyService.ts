import prisma from '../../utils/db.js';
import crypto from 'node:crypto';
import type { McpKeyPermission } from '@prisma/client';

export const hashMcpKey = (key: string): string => {
  return crypto.createHash('sha256').update(key).digest('hex');
};

export const generateMcpKey = (): { fullKey: string; displayKey: string } => {
  const fullKey = `mcp_${crypto.randomBytes(32).toString('hex')}`;
  const displayKey = `${fullKey.slice(0, 8)}...${fullKey.slice(-4)}`;
  return { fullKey, displayKey };
};

export const createMcpKey = async (
  guildId: string,
  name: string,
  permissions: McpKeyPermission[]
) => {
  const { fullKey, displayKey } = generateMcpKey();
  const keyHash = hashMcpKey(fullKey);

  const record = await prisma.mcpApiKey.create({
    data: {
      guildId,
      name,
      keyHash,
      displayKey,
      permissions,
    },
  });

  return { ...record, fullKey };
};

export const getMcpKeys = async (guildId: string) => {
  return prisma.mcpApiKey.findMany({
    where: { guildId, isActive: true },
    select: {
      id: true,
      name: true,
      displayKey: true,
      permissions: true,
      isActive: true,
      lastUsedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
};

export const deactivateMcpKey = async (guildId: string, keyId: string) => {
  return prisma.mcpApiKey.updateMany({
    where: { id: keyId, guildId },
    data: { isActive: false },
  });
};

export const verifyMcpKey = async (rawKey: string, guildId: string) => {
  const keyHash = hashMcpKey(rawKey);
  const key = await prisma.mcpApiKey.findUnique({ where: { keyHash } });

  if (!key || key.guildId !== guildId || !key.isActive) {
    return null;
  }

  await prisma.mcpApiKey.update({
    where: { id: key.id },
    data: { lastUsedAt: new Date() },
  });

  return key;
};
