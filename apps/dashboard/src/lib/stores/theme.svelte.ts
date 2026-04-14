class ThemeStore {
    dark = $state(false);

    constructor() {
        const saved = localStorage.getItem('kotbo_theme');
        if (saved) {
            this.dark = saved === 'dark';
        } else {
            this.dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        }
        this.applyTheme();
    }

    toggle() {
        this.dark = !this.dark;
        localStorage.setItem('kotbo_theme', this.dark ? 'dark' : 'light');
        this.applyTheme();
    }

    private applyTheme() {
        if (this.dark) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }
}

export const themeStore = new ThemeStore();
