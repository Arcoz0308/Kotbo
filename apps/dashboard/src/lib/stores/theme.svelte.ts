function createThemeStore() {
    const STORAGE_KEY = 'kotbo_theme';

    const saved = localStorage.getItem(STORAGE_KEY);
    let dark = $state(saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches);

    function applyTheme() {
        if (dark) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }

    applyTheme();

    return {
        get dark() {
            return dark;
        },

        set dark(value: boolean) {
            dark = value;
            localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
            applyTheme();
        },

        toggle() {
            dark = !dark;
            localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
            applyTheme();
        }
    };
}

export const themeStore = createThemeStore();
