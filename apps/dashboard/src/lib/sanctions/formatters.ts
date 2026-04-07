export function typeLabel(value: string): string {
  if (value === 'WARN') return 'Avertissement (Warn)';
  if (value === 'KICK') return 'Exclusion (Kick)';
  if (value === 'TIMEOUT') return 'Mise en sourdine / Timeout (TO)';
  if (value === 'TEMP_BAN') return 'Bannissement temporaire';
  if (value === 'BAN') return 'Bannissement definitif';
  return value;
}

export function statusLabel(value: string): string {
  if (value === 'ACTIVE') return 'Active';
  if (value === 'RESOLVED') return 'Terminee';
  return 'Echec';
}

export function durationLabel(seconds: number | null): string {
  if (!seconds) return 'N/A';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (days) parts.push(`${days}j`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  return parts.length > 0 ? parts.join(' ') : `${seconds}s`;
}

export function toDateTimeLocal(value: string | null | undefined): string {
  if (!value) return new Date().toISOString().slice(0, 16);
  return new Date(value).toISOString().slice(0, 16);
}
