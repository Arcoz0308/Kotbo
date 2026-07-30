/**
 * Reference-counted body scroll lock.
 *
 * The drawer, the bottom sheets and the modals can all be open at once (a sheet
 * opened from a modal, for instance). Toggling `overflow: hidden` from each of
 * them independently means whichever closes first releases the page while the
 * other is still open, so every consumer goes through this counter instead.
 *
 * The scroll position is pinned with `position: fixed` because iOS Safari
 * ignores `overflow: hidden` on the body once a touch scroll is in flight.
 */
let locks = 0;
let savedScrollY = 0;

export function lockBodyScroll(): void {
  if (typeof document === 'undefined') return;

  locks += 1;
  if (locks > 1) return;

  savedScrollY = window.scrollY;
  const { body } = document;
  body.style.position = 'fixed';
  body.style.top = `-${savedScrollY}px`;
  body.style.left = '0';
  body.style.right = '0';
  body.style.width = '100%';
  body.style.overflow = 'hidden';
}

export function unlockBodyScroll(): void {
  if (typeof document === 'undefined') return;

  locks = Math.max(0, locks - 1);
  if (locks > 0) return;

  const { body } = document;
  body.style.position = '';
  body.style.top = '';
  body.style.left = '';
  body.style.right = '';
  body.style.width = '';
  body.style.overflow = '';

  // Restoring synchronously avoids the visible jump to the top of the page.
  window.scrollTo({ top: savedScrollY, behavior: 'instant' as ScrollBehavior });
}

/** Svelte action: locks scrolling for as long as the node is mounted. */
export function scrollLock(_node: HTMLElement) {
  lockBodyScroll();
  return { destroy: unlockBodyScroll };
}
