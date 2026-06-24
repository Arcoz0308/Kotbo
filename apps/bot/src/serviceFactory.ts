import { VerificationService, ActivationService, DataRetentionService } from '@kotbo/core';
import { DiscordAdapter } from './adapters/discord.adapter.js';
import prisma from './utils/db.js';
import { getClient } from './utils/client.js';

let verificationService: VerificationService | null = null;
let activationService: ActivationService | null = null;
let dataRetentionService: DataRetentionService | null = null;

export function getVerificationService(): VerificationService {
  if (!verificationService) {
    const client = getClient();
    const discord = new DiscordAdapter(client);
    verificationService = new VerificationService(prisma, discord);
  }
  return verificationService;
}

export function getActivationService(): ActivationService {
  if (!activationService) {
    activationService = new ActivationService(prisma);
  }
  return activationService;
}

export function getDataRetentionService(): DataRetentionService {
  if (!dataRetentionService) {
    dataRetentionService = new DataRetentionService(prisma);
  }
  return dataRetentionService;
}
