import type { CandidatureStatus } from '@prisma/client';
import prisma from '../utils/db.js';
import { logger } from '../utils/logger.js';

export async function getCandidatures(guildId: string) {
  return await prisma.recruitmentCandidature.findMany({
    where: { guildId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createCandidature(guildId: string, data: any) {
  // Try to find identifiers in the data
  let discordId: string | null = null;
  let username: string | null = null;
  let email: string | null = null;

  // common field names for Discord ID/Username
  const keys = Object.keys(data);
  for (const key of keys) {
    const k = key.toLowerCase();
    const val = String(data[key]);
    
    // Exact match or contains for the user's specific form
    if (k.includes('discord') && (k.includes('nom') || k.includes('utilisateur') || k.includes('id') || k.includes('identifiant'))) {
      if (/^\d{17,19}$/.test(val)) {
        discordId = val;
      } else {
        username = val;
      }
    }
    
    if (k.includes('pseudo') || k.includes('username')) {
       if (!username) username = val;
    }
    if (k.includes('email') || k.includes('mail')) {
       if (!email) email = val;
    }
  }

  // If data is from Google Forms, it might be nested
  // Google Apps Script usually sends: { timestamp: "...", data: { "Field 1": ["Value"], ... } }
  const rawData = data.data || data;

  return await prisma.recruitmentCandidature.create({
    data: {
      guildId,
      discordId,
      username: username || (discordId ? `User_${discordId}` : 'Candidat Anonyme'),
      email,
      data: rawData,
      status: 'PENDING',
    },
  });
}

export async function updateCandidatureStatus(id: string, status: CandidatureStatus, notes?: string) {
  return await prisma.recruitmentCandidature.update({
    where: { id },
    data: {
      status,
      ...(notes !== undefined ? { notes } : {}),
    },
  });
}

export async function deleteCandidature(id: string) {
  return await prisma.recruitmentCandidature.delete({
    where: { id },
  });
}
