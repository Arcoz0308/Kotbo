import { readable, writable } from 'svelte/store';

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

/**
 * Breakpoint stores are driven by matchMedia rather than window.innerWidth so
 * that JavaScript and CSS always flip at exactly the same pixel. Deriving them
 * from innerWidth drifts by the scrollbar width and produced layouts where the
 * mobile markup rendered under desktop styling.
 */
function mediaQuery(query: string) {
  return readable(
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
    (set) => {
      if (typeof window === 'undefined') return;
      const mql = window.matchMedia(query);
      const handler = (event: MediaQueryListEvent) => set(event.matches);
      set(mql.matches);
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    },
  );
}

/** Phones: the mobile shell (tab bar, sheets, single column) is active. */
export const isPhone = mediaQuery('(max-width: 767px)');

/** Tablets: drawer navigation, but roomy enough for desktop-density content. */
export const isTablet = mediaQuery('(min-width: 768px) and (max-width: 1023px)');

/** Anything without a persistent sidebar. */
export const isMobile = mediaQuery('(max-width: 1023px)');

/** True on devices whose primary input cannot hover, i.e. touch. */
export const isTouch = mediaQuery('(hover: none) and (pointer: coarse)');

export const prefersReducedMotion = mediaQuery('(prefers-reduced-motion: reduce)');
