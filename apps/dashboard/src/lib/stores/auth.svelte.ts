import { router } from 'tinro';
import { API_BASE_URL } from '../api';

class AuthStore {
    token = $state(localStorage.getItem('kotbo_token') || null);
    user = $state(null);
    guilds = $state([]);
    selectedGuildId = $state(localStorage.getItem('kotbo_guild_id') || null);
    loading = $state(false);

    constructor() {
        if (this.token) {
            this.fetchUser();
            this.fetchGuilds();
        }
    }

    setToken(token) {
        this.token = token;
        if (token) {
            localStorage.setItem('kotbo_token', token);
            this.fetchUser();
            this.fetchGuilds();
        } else {
            localStorage.removeItem('kotbo_token');
            this.user = null;
            this.guilds = [];
        }
    }

    async fetchUser() {
        try {
            const res = await fetch(`${API_BASE_URL}/api/user/me`, {
                headers: { Authorization: `Bearer ${this.token}` }
            });
            if (res.ok) {
                this.user = await res.json();
            } else {
                this.logout();
            }
        } catch (err) {
            console.error('Fetch user error:', err);
        }
    }

    async fetchGuilds() {
        try {
            const res = await fetch(`${API_BASE_URL}/api/user/guilds`, {
                headers: { Authorization: `Bearer ${this.token}` }
            });
            if (res.ok) {
                const data = await res.json();
                this.guilds = data.guilds.filter(g => g.botPresent);
                if (!this.selectedGuildId && this.guilds.length > 0) {
                    this.setGuild(this.guilds[0].id);
                } else if (this.selectedGuildId && !this.guilds.some((guild) => guild.id === this.selectedGuildId) && this.guilds.length > 0) {
                    this.setGuild(this.guilds[0].id);
                } else if (typeof window !== 'undefined') {
                    window.dispatchEvent(new Event('kotbo-dashboard-refresh-request'));
                }
            }
        } catch (err) {
            console.error('Fetch guilds error:', err);
        }
    }

    setGuild(guildId) {
        this.selectedGuildId = guildId;
        localStorage.setItem('kotbo_guild_id', guildId);

        if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('kotbo-dashboard-refresh-request'));
        }
    }

    logout() {
        this.setToken(null);
        router.goto('/login');
    }

    get isAuthenticated() {
        return !!this.token;
    }
}

export const authStore = new AuthStore();
