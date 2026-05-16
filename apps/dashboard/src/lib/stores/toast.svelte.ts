
export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

class ToastStore {
  toasts = $state<Toast[]>([]);

  add(message: string, type: ToastType = 'info', duration = 5000) {
    const id = crypto.randomUUID();
    this.toasts.push({ id, message, type, duration });

    if (duration > 0) {
      setTimeout(() => {
        this.remove(id);
      }, duration);
    }
  }

  success(message: string, duration?: number) {
    this.add(message, 'success', duration);
  }

  error(message: string, duration?: number) {
    this.add(message, 'error', duration);
  }

  info(message: string, duration?: number) {
    this.add(message, 'info', duration);
  }

  warning(message: string, duration?: number) {
    this.add(message, 'warning', duration);
  }

  remove(id: string) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }
}

export const toast = new ToastStore();
