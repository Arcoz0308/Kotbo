import { onMount } from 'svelte';
import { DASHBOARD_WS_URL } from './api';
import { authStore } from './stores/auth.svelte';
import { dashboardStore } from './stores/dashboard.svelte';

function waitForWindowLoad() {
  if (document.readyState === 'complete') {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const handleLoad = () => {
      window.removeEventListener('load', handleLoad);
      resolve();
    };

    window.addEventListener('load', handleLoad, { once: true });
  });
}

function waitForBrowserIdle() {
  return new Promise((resolve) => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => resolve(), { timeout: 300 });
      return;
    }

    window.requestAnimationFrame(() => {
      window.setTimeout(resolve, 150);
    });
  });
}

export function refreshDashboardOnMount() {
  onMount(() => {
    dashboardStore.refresh();

    if (!authStore.token) return;

    let socket = null;
    let reconnectTimer = null;
    let intentionallyClosed = false;
    let loadListener = null;

    const connect = async () => {
      if (!authStore.token) return;

      await waitForWindowLoad();
      await waitForBrowserIdle();

      if (intentionallyClosed || !authStore.token) return;
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        return;
      }

      const wsUrl = new URL(DASHBOARD_WS_URL);
      wsUrl.searchParams.set('token', authStore.token);

      socket = new WebSocket(wsUrl.toString());

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          const shouldRefresh =
            payload?.type === 'dashboard_state_changed' &&
            payload?.guildId === authStore.selectedGuildId;

          if (shouldRefresh) {
            dashboardStore.refresh();
          }
        } catch (error) {
          console.error('WS dashboard payload invalide:', error);
        }
      };

      socket.onclose = () => {
        if (intentionallyClosed) return;
        reconnectTimer = setTimeout(connect, 1500);
      };

      socket.onerror = () => {
        socket?.close();
      };
    };

    if (document.readyState === 'complete') {
      connect();
    } else {
      loadListener = () => {
        connect();
      };
      window.addEventListener('load', loadListener, { once: true });
    }

    return () => {
      intentionallyClosed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (loadListener) window.removeEventListener('load', loadListener);
      if (socket) socket.close();
    };
  });
}
