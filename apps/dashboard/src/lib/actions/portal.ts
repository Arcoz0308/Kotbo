/**
 * Svelte action that teleports the element to document.body,
 * escaping any stacking context created by ancestors (backdrop-filter, transform, etc.)
 * This ensures modals always render on top of everything.
 */
export function portal(node: HTMLElement, target: HTMLElement | string = document.body) {
  let targetEl: HTMLElement;

  if (typeof target === 'string') {
    targetEl = document.querySelector(target) as HTMLElement ?? document.body;
  } else {
    targetEl = target;
  }

  targetEl.appendChild(node);

  return {
    update(newTarget: HTMLElement | string) {
      if (typeof newTarget === 'string') {
        targetEl = document.querySelector(newTarget) as HTMLElement ?? document.body;
      } else {
        targetEl = newTarget;
      }
      targetEl.appendChild(node);
    },
    destroy() {
      if (node.parentNode) {
        node.parentNode.removeChild(node);
      }
    }
  };
}
