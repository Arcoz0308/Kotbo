export type ValidateRoute = {
  action: 'approve' | 'reject' | 'translate' | 'pin';
  type: 'rss' | 'youtube' | 'daily-algo';
  itemId: string;
};

export type UserCaseSection = 'resume' | 'sanctions' | 'identite' | 'activite';

export type UserCaseRoute = {
  action: 'open' | 'refresh' | 'prev' | 'next' | 'close' | 'section';
  userId: string;
  section?: UserCaseSection;
  pageIndex?: number;
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

export function parseUserCaseRoute(customId: string): UserCaseRoute | null {
  if (!customId.startsWith('case:')) return null;

  const parts = customId.split(':');
  const action = parts[1];

  if (action === 'open' || action === 'close') {
    const userId = parts[2];
    if (!userId) return null;
    return { action, userId };
  }

  if (action === 'refresh' || action === 'prev' || action === 'next') {
    const userId = parts[2];
    const section = parts[3] as UserCaseSection | undefined;
    const pageIndex = Number.parseInt(parts[4] ?? '0', 10);
    if (!userId) return null;
    if (section && section !== 'resume' && section !== 'sanctions' && section !== 'identite' && section !== 'activite') return null;
    return {
      action,
      userId,
      section,
      pageIndex: Number.isFinite(pageIndex) ? pageIndex : 0,
    };
  }

  if (action === 'section') {
    const userId = parts[2];
    const pageIndex = Number.parseInt(parts[3] ?? '0', 10);
    if (!userId) return null;
    return {
      action,
      userId,
      pageIndex: Number.isFinite(pageIndex) ? pageIndex : 0,
    };
  }

  return null;
}
