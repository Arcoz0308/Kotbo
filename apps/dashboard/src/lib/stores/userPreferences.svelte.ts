/**
 * Store for user-specific UI preferences.
 * All values are persisted to localStorage under the `kotbo_prefs` key.
 */

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

const STORAGE_KEY = 'kotbo_prefs';

function loadPrefs(): UserPrefs {
  try {
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

  constructor() {
    // Sync theme with themeStore on init
    const savedTheme = localStorage.getItem('kotbo_theme');
    if (savedTheme === 'dark' || savedTheme === 'light') {
      this.prefs.theme = savedTheme;
    } else {
      this.prefs.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
  }

  private save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.prefs));
  }

  set<K extends keyof UserPrefs>(key: K, value: UserPrefs[K]) {
    this.prefs[key] = value;
    this.save();

    // Side-effects for specific preferences
    if (key === 'theme') {
      const theme = value as 'dark' | 'light';
      localStorage.setItem('kotbo_theme', theme);
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }

    if (key === 'animationsEnabled') {
      if (!value) {
        document.documentElement.classList.add('no-animations');
      } else {
        document.documentElement.classList.remove('no-animations');
      }
    }
  }

  reset() {
    this.prefs = { ...DEFAULT_PREFS };
    localStorage.removeItem(STORAGE_KEY);
  }
}

export const userPrefs = new UserPreferencesStore();
export type { UserPrefs, Language, DateFormat, SidebarBehavior, AccentColor };
