export { VerificationService } from './services/verification.service.js';
export type {
  DeployVerificationEmbedInput,
  DeployVerificationEmbedResult,
  CompleteVerificationInput,
  CompleteVerificationResult,
} from './services/verification.service.js';

export { ActivationService } from './services/activation.service.js';
export type { ActivateGuildResult } from './services/activation.service.js';

export { DataRetentionService } from './services/dataRetention.service.js';
export type { RetentionConfig } from './services/dataRetention.service.js';

export type {
  DiscordPort,
  DiscordMember,
  GuildInfo,
  SendEmbedParams,
  EmbedComponent,
} from './ports/discord.port.js';

export {
  generateTranscriptSignature,
  verifyTranscriptSignature,
} from './utils/signedUrl.js';
