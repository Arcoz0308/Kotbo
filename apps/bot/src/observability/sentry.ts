import * as Sentry from '@sentry/bun';
import { logger } from '../utils/logger.js';

let initialized = false;

function parseRate(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
}

export function initBotSentry(): boolean {
  if (initialized) return true;

  const dsn = process.env.BOT_SENTRY_DSN ?? process.env.SENTRY_DSN;
  if (!dsn) {
    logger.warn('Sentry', 'Sentry désactivé: BOT_SENTRY_DSN/SENTRY_DSN absent.');
    return false;
  }

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: parseRate(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.1),
    profilesSampleRate: parseRate(process.env.SENTRY_PROFILES_SAMPLE_RATE, 0),
  });

  initialized = true;
  logger.success('Sentry', 'Sentry initialisé pour le bot.');
  return true;
}

export function captureException(error: unknown, context?: string): void {
  if (!initialized) return;

  if (context) {
    Sentry.withScope((scope) => {
      scope.setTag('context', context);
      Sentry.captureException(error);
    });
    return;
  }

  Sentry.captureException(error);
}

export function isSentryEnabled(): boolean {
  return initialized;
}
