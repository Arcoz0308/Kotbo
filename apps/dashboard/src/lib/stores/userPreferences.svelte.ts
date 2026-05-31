/**
 * Store for user-specific UI preferences.
 * All values are persisted to localStorage under the `kotbo_prefs` key.
 */

import { sidebarStore } from './sidebar.svelte';
import { themeStore } from './theme.svelte';

type Language = 'fr' | 'en';
type DateFormat = 'relative' | 'absolute' | 'both';
type SidebarBehavior = 'auto' | 'always-open' | 'always-closed';
type AccentColor = 'violet' | 'blue' | 'green' | 'rose' | 'orange' | 'cyan';

interface UserPrefs {
  theme: 'dark' | 'light';
  language: Language;
  sidebarBehavior: SidebarBehavior;
  compactMode: boolean;
  soundNotifications: boolean;
  desktopNotifications: boolean;
  dateFormat: DateFormat;
  accentColor: AccentColor;
  animationsEnabled: boolean;
  showOnlineStatus: boolean;
}

const DEFAULT_PREFS: UserPrefs = {
  theme: 'dark',
  language: 'fr',
  sidebarBehavior: 'auto',
  compactMode: false,
  soundNotifications: false,
  desktopNotifications: false,
  dateFormat: 'relative',
  accentColor: 'violet',
  animationsEnabled: true,
  showOnlineStatus: true,
};

const ACCENT_COLORS: Record<AccentColor, string> = {
  violet: '#8b5cf6',
  blue: '#3b82f6',
  green: '#10b981',
  rose: '#f43f5e',
  orange: '#f97316',
  cyan: '#06b6d4',
};

const STORAGE_KEY = 'kotbo_prefs';

function canUseDom() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function loadPrefs(): UserPrefs {
  try {
    if (!canUseDom()) {
      return { ...DEFAULT_PREFS };
    }

    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
    }
  } catch {
    // ignore parse errors
  }
  return { ...DEFAULT_PREFS };
}

class UserPreferencesStore {
  prefs = $state<UserPrefs>(loadPrefs());

  private readonly storageListener = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) {
      return;
    }

    this.prefs = loadPrefs();
    this.applyPreferences();
  };

  constructor() {
    if (canUseDom()) {
      window.addEventListener('storage', this.storageListener);

      const savedTheme = localStorage.getItem('kotbo_theme');
      if (savedTheme === 'dark' || savedTheme === 'light') {
        this.prefs.theme = savedTheme;
      } else {
        this.prefs.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
    }

    this.applyPreferences();
  }

  private save() {
    if (!canUseDom()) {
      return;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.prefs));
  }

  private applyThemePreference(theme: UserPrefs['theme']) {
    if (!canUseDom()) {
      return;
    }

    themeStore.dark = theme === 'dark';
    localStorage.setItem('kotbo_theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }

  private applyAccentColorPreference(accentColor: AccentColor) {
    if (!canUseDom()) {
      return;
    }

    document.documentElement.style.setProperty('--primary-color', ACCENT_COLORS[accentColor]);
  }

  private applyUiPreferences() {
    if (!canUseDom()) {
      return;
    }

    document.documentElement.classList.toggle('no-animations', !this.prefs.animationsEnabled);
    document.documentElement.classList.toggle('compact-ui', this.prefs.compactMode);
    document.documentElement.lang = this.prefs.language;
    document.documentElement.dataset.sidebarBehavior = this.prefs.sidebarBehavior;
    document.documentElement.dataset.dateFormat = this.prefs.dateFormat;

    if (this.prefs.sidebarBehavior === 'always-open') {
      sidebarStore.set(false);
    } else if (this.prefs.sidebarBehavior === 'always-closed') {
      sidebarStore.set(true);
    }
  }

  private applyPreferences() {
    this.applyThemePreference(this.prefs.theme);
    this.applyAccentColorPreference(this.prefs.accentColor);
    this.applyUiPreferences();
  }

  set<K extends keyof UserPrefs>(key: K, value: UserPrefs[K]) {
    this.prefs[key] = value;
    this.save();

    this.applyPreferences();
  }

  reset() {
    this.prefs = { ...DEFAULT_PREFS };
    this.save();
    this.applyPreferences();
  }
}

export const userPrefs = new UserPreferencesStore();
export type { UserPrefs, Language, DateFormat, SidebarBehavior, AccentColor };
