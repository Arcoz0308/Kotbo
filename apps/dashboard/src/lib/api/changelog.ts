/** Journal des versions. */
import { API_BASE_URL } from './client';

export interface ChangelogCommit {
  hash: string;
  date: string;
  title: string;
  description: string;
  type: string;
  scope: string | null;
}

export async function fetchChangelog(limit = 20): Promise<ChangelogCommit[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/public/changelog?limit=${limit}`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.commits || [];
  } catch {
    return [];
  }
}
