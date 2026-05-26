
export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void | Promise<void>;
  };
}

class ToastStore {
  toasts = $state<Toast[]>([]);

  add(
    message: string,
    type: ToastType = 'info',
    duration = 5000,
    action?: { label: string; onClick: () => void | Promise<void> }
  ) {
    const id = crypto.randomUUID();
    this.toasts.push({ id, message, type, duration, action });

    if (duration > 0) {
      setTimeout(() => {
        this.remove(id);
      }, duration);
    }
  }

  success(message: string, duration?: number, action?: { label: string; onClick: () => void | Promise<void> }) {
    this.add(message, 'success', duration, action);
  }

  error(message: string, duration?: number, action?: { label: string; onClick: () => void | Promise<void> }) {
    this.add(message, 'error', duration, action);
  }

  info(message: string, duration?: number, action?: { label: string; onClick: () => void | Promise<void> }) {
    this.add(message, 'info', duration, action);
  }

  warning(message: string, duration?: number, action?: { label: string; onClick: () => void | Promise<void> }) {
    this.add(message, 'warning', duration, action);
  }

  remove(id: string) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }
}

export const toast = new ToastStore();

