// Sidebar collapse state — persisted in localStorage
function createSidebarStore() {
  const STORAGE_KEY = 'sidebar_collapsed';

  const stored = typeof localStorage !== 'undefined'
    ? localStorage.getItem(STORAGE_KEY) === 'true'
    : false;

  let collapsed = $state(stored);

  return {
    get collapsed() { return collapsed; },
    toggle() {
      collapsed = !collapsed;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, String(collapsed));
      }
    },
    set(value: boolean) {
      collapsed = value;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, String(value));
      }
    },
  };
}

export const sidebarStore = createSidebarStore();
