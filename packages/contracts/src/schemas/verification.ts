import { z } from 'zod';

export const DeployVerificationBody = z.object({
  channelId: z.string().min(15).max(20).regex(/^\d+$/),
});

export const VerificationSessionResponse = z.object({
  guildId: z.string(),
  userId: z.string(),
  guildName: z.string(),
  guildIcon: z.string().nullable(),
  title: z.string(),
  color: z.string(),
  expiresAt: z.string(),
});

export const CompleteVerificationBody = z.object({
  discordToken: z.string().min(1),
});

export type DeployVerificationInput = z.infer<typeof DeployVerificationBody>;
export type VerificationSessionData = z.infer<typeof VerificationSessionResponse>;
export type CompleteVerificationInput = z.infer<typeof CompleteVerificationBody>;
