import { writable, derived } from 'svelte/store';

function createWindowSizeStore() {
  const { subscribe, set } = writable({ width: 0, height: 0 });

  let rafId: number | null = null;
  function update() {
    set({ width: window.innerWidth, height: window.innerHeight });
  }

  function onResize() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      update();
      rafId = null;
    });
  }

  if (typeof window !== 'undefined') {
    update();
    window.addEventListener('resize', onResize);
  }

  return {
    subscribe,
    refresh: () => (typeof window !== 'undefined' ? update() : null),
    stop: () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', onResize);
        if (rafId) cancelAnimationFrame(rafId);
      }
    }
  };
}

export const windowSize = createWindowSizeStore();

export const isMobile = derived(windowSize, ({ width }) => width < 1024);
