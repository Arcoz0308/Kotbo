import { DASHBOARD_WS_URL } from './api';
import { authStore } from './stores/auth.svelte';
import { dashboardStore } from './stores/dashboard.svelte';

function waitForWindowLoad(): Promise<void> {
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

function waitForBrowserIdle(): Promise<void> {
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

class DashboardLifecycleManager {
  private socket: WebSocket | null = null;
  private reconnectTimer: any = null;
  private intentionallyClosed = false;
  private isConnecting = false;
  private initialized = false;

  constructor() {}

  async init() {
    if (this.initialized) return;
    this.initialized = true;

    // Refresh initially
    if (authStore.token && authStore.selectedGuildId) {
      dashboardStore.refresh();
    }

    // Event listener for manual refresh requests
    window.addEventListener('kotbo-dashboard-refresh-request', () => {
      dashboardStore.refresh();
    });

    // Start connection
    this.connect();
  }

  async connect() {
    if (!authStore.token) return;
    if (this.isConnecting) return;
    
    // Si déjà ouvert ou en cours, on ne fait rien
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isConnecting = true;
    this.intentionallyClosed = false;

    try {
      // On attend que la page soit stable pour éviter les interruptions mentionnées par l'utilisateur
      await waitForWindowLoad();
      await waitForBrowserIdle();

      if (this.intentionallyClosed || !authStore.token) {
        this.isConnecting = false;
        return;
      }

      const wsUrl = new URL(DASHBOARD_WS_URL);

      this.socket = new WebSocket(wsUrl.toString());

      this.socket.onopen = () => {
        console.log("[DashboardWS] Connecté. Envoi de l\'authentification...");
        this.socket?.send(
          JSON.stringify({
            type: 'auth',
            token: authStore.token,
          })
        );
        this.isConnecting = false;
      };

      this.socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          
          // Emettre un événement global Svelte/JS pour tout composant intéressé
          const customEvent = new CustomEvent('kotbo-ws-message', { detail: payload });
          window.dispatchEvent(customEvent);

          const shouldRefresh =
            payload?.type === 'dashboard_state_changed' &&
            payload?.guildId === authStore.selectedGuildId;

          if (shouldRefresh) {
            console.log('[DashboardWS] Changement détecté, actualisation...');
            dashboardStore.refresh();
          }
        } catch (error) {
          console.error('[DashboardWS] Payload invalide:', error);
        }
      };

      this.socket.onclose = (event) => {
        this.isConnecting = false;
        this.socket = null;
        
        if (this.intentionallyClosed) {
          console.log('[DashboardWS] Déconnecté (intentionnel)');
          return;
        }

        console.warn(`[DashboardWS] Connexion interrompue (code: ${event.code}). Reconnexion dans 3s...`);
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => this.connect(), 3000);
      };

      this.socket.onerror = (error) => {
        console.error('[DashboardWS] Erreur:', error);
        this.socket?.close();
      };
    } catch (err) {
      this.isConnecting = false;
      console.error('[DashboardWS] Erreur lors de la tentative de connexion:', err);
      this.reconnectTimer = setTimeout(() => this.connect(), 5000);
    }
  }

  destroy() {
    this.intentionallyClosed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.initialized = false;
  }
}

export const dashboardLifecycle = new DashboardLifecycleManager();

/**
 * @deprecated Use dashboardLifecycle.init() in MainLayout instead
 */
export function refreshDashboardOnMount() {
  // Empty to avoid breaking components while refactoring
}
