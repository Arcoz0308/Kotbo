import { API_BASE_URL } from '../api';
import { authStore } from './auth.svelte';

export type Notification = {
  id: string;
  title: string;
  message: string;
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  link?: string;
  isRead: boolean;
  createdAt: string;
};

class NotificationsStore {
  items = $state<Notification[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);

  get unreadCount() {
    return this.items.filter(n => !n.isRead).length;
  }

  async fetchNotifications() {
    if (!authStore.selectedGuildId || !authStore.token) return;

    this.loading = true;
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/notifications`, {
        headers: {
          'Authorization': `Bearer ${authStore.token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        this.items = data.notifications || [];
      } else {
        this.error = 'Erreur lors de la récupération des notifications';
      }
    } catch (err) {
      this.error = 'Erreur réseau';
    } finally {
      this.loading = false;
    }
  }

  async markAsRead(id: string) {
    if (!authStore.selectedGuildId || !authStore.token) return;

    // Optimistic update
    const notif = this.items.find(n => n.id === id);
    if (notif) notif.isRead = true;

    try {
      await fetch(`${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/notifications/${id}/read`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${authStore.token}`
        }
      });
    } catch (err) {
      // Revert on error
      if (notif) notif.isRead = false;
    }
  }

  async markAllAsRead() {
    if (!authStore.selectedGuildId || !authStore.token) return;

    // Optimistic update
    const prev = JSON.parse(JSON.stringify(this.items));
    this.items.forEach(n => n.isRead = true);

    try {
      await fetch(`${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/notifications/mark-all-read`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authStore.token}`
        }
      });
    } catch (err) {
      // Revert on error
      this.items = prev;
    }
  }
}

export const notificationsStore = new NotificationsStore();
