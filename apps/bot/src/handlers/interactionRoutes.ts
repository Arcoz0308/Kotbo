export type ValidateRoute = {
  action: 'approve' | 'reject' | 'translate' | 'pin';
  type: 'rss' | 'youtube' | 'daily-algo';
  itemId: string;
};

export function parseSetupStep(customId: string): string | null {
  if (!customId.startsWith('setup:')) return null;
  return customId.split(':')[1] ?? null;
}

export function parseValidateRoute(customId: string): ValidateRoute | null {
  if (!customId.startsWith('validate:')) return null;

  const parts = customId.split(':');
  if (parts.length < 4) return null;

  const action = parts[1];
  const type = parts[2];
  const itemId = parts[3];

  if (!itemId) return null;
  if (action !== 'approve' && action !== 'reject' && action !== 'translate' && action !== 'pin') return null;
  if (type !== 'rss' && type !== 'youtube' && type !== 'daily-algo') return null;

  return { action, type, itemId };
}

export function parseNewsSessionId(customId: string, expectedPrefix: string): string | null {
  if (!customId.startsWith(expectedPrefix)) return null;
  return customId.split(':')[2] ?? null;
}

export function parseModalSessionId(customId: string, expectedPrefix: string): string | null {
  if (!customId.startsWith(expectedPrefix)) return null;
  return customId.split(':')[3] ?? null;
}
