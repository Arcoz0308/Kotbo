import { API_BASE_URL } from '../api';
import { authStore } from './auth.svelte';

class StaffStore {
  absences = $state<any[]>([]);
  meetings = $state<any[]>([]);
  members = $state<any[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);

  async fetchAll() {
    if (!authStore.selectedGuildId || !authStore.token) return;

    this.loading = true;
    try {
      const guildId = authStore.selectedGuildId;
      const headers = { Authorization: `Bearer ${authStore.token}` };

      const [absencesRes, meetingsRes, membersRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/absences`, { headers }),
        fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/meetings`, { headers }),
        fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/staff/members`, { headers })
      ]);

      if (absencesRes.ok) {
        const data = await absencesRes.json();
        this.absences = data.absences || [];
      }

      if (meetingsRes.ok) {
        const data = await meetingsRes.json();
        this.meetings = data.meetings || [];
      }

      if (membersRes.ok) {
        const data = await membersRes.json();
        this.members = data.members || [];
      }

    } catch (err) {
      console.error('StaffStore fetch error:', err);
      this.error = 'Erreur lors du chargement des données staff';
    } finally {
      this.loading = false;
    }
  }

  get pendingAbsences() {
    return this.absences.filter(a => a.status === 'PENDING' || a.status === 'ACKNOWLEDGED');
  }

  get upcomingMeetings() {
    return this.meetings
      .filter(m => new Date(m.scheduledAt) > new Date())
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  }
}

export const staffStore = new StaffStore();
