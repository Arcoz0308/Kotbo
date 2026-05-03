import * as Sentry from '@sentry/browser';

let initialized = false;

function parseRate(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
}

export function initDashboardSentry(): boolean {
  if (initialized) return true;

  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment: (import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined) ?? 'development',
    release: import.meta.env.VITE_SENTRY_RELEASE as string | undefined,
    tracesSampleRate: parseRate(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE as string | undefined, 0.1),
  });

  initialized = true;
  return true;
}
