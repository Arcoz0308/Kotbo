export function normalizeEvidenceLinks(value: unknown, ensureOne = false): string[] {
  const links = Array.isArray(value)
    ? value.map((entry) => (typeof entry === 'string' ? entry : ''))
    : [];

  return links.length > 0 || !ensureOne ? links : [''];
}

export function sanitizeEvidenceLinks(value: unknown): string[] {
  return normalizeEvidenceLinks(value)
    .map((entry) => entry.trim())
    .filter((entry) => /^https?:\/\//i.test(entry));
}
