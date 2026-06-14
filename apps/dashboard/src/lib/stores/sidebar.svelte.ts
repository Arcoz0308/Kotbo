function createSidebarStore() {
  const STORAGE_KEY = 'sidebar_collapsed';

  const stored =
    typeof localStorage !== 'undefined'
      ? localStorage.getItem(STORAGE_KEY) === 'true'
      : false;

  let collapsed = $state(stored); // persistent
  let mobileOpen = $state(false);

  return {
    get collapsed() {
      return collapsed;
    },

    get mobileOpen() {
      return mobileOpen;
    },

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

    // mobile
    openMobile() {
      mobileOpen = true;
    },

    closeMobile() {
      mobileOpen = false;
    },

    toggleMobile() {
      mobileOpen = !mobileOpen;
    },
  };
}

export const sidebarStore = createSidebarStore();