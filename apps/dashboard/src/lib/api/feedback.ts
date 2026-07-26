/** Remontees d erreurs, feedback et partenariats. */
import { authStore } from '../stores/auth.svelte';
import { API_BASE_URL } from './client';

export async function reportDashboardError(errorData: {
  error: string;
  stack?: string;
  url: string;
  userAgent: string;
  guildId?: string | null;
}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
  if (authStore.token) {
    headers.Authorization = `Bearer ${authStore.token}`;
  }

  const response = await fetch(`${API_BASE_URL}/api/report-error`, {
    method: 'POST',
    headers,
    body: JSON.stringify(errorData)
  });

  if (!response.ok) {
    throw new Error(`Server error: ${response.status}`);
  }

  return response.json();
}

export async function reportFeedback(feedbackData: {
  type: 'retour' | 'bloquage' | 'suggestion' | 'autre';
  message: string;
  url: string;
  guildId?: string | null;
}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
  if (authStore.token) {
    headers.Authorization = `Bearer ${authStore.token}`;
  }

  const response = await fetch(`${API_BASE_URL}/api/report-feedback`, {
    method: 'POST',
    headers,
    body: JSON.stringify(feedbackData)
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Server error: ${response.status}`);
  }

  return response.json();
}

export async function submitPartnershipApplication(data: {
  category: 'partenariat' | 'beta';
  projectName: string;
  projectUrl?: string | null;
  memberCount?: string | null;
  description: string;
  motivation: string;
  experience?: string | null;
  availability?: string | null;
  contact?: string | null;
}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
  if (authStore.token) {
    headers.Authorization = `Bearer ${authStore.token}`;
  }

  const response = await fetch(`${API_BASE_URL}/api/partnership-application`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Server error: ${response.status}`);
  }

  return response.json() as Promise<{
    success: boolean;
    alreadyMember: boolean;
    dmDelivered: boolean;
    inviteUrl: string | null;
  }>;
}
