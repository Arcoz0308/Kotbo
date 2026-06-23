import { API_BASE_URL } from '../api';

export interface BrandingInfo {
    instanceId: string;
    slug: string;
    name: string;
    color: string;
    logoUrl: string | null;
    faviconUrl: string | null;
    footerText: string | null;
    isWhiteLabel: boolean;
}

const DEFAULT_BRANDING: BrandingInfo = {
    instanceId: '__default__',
    slug: 'default',
    name: 'Kotbo',
    color: '#5865F2',
    logoUrl: null,
    faviconUrl: null,
    footerText: null,
    isWhiteLabel: false,
};

class BrandingStore {
    info = $state<BrandingInfo>(DEFAULT_BRANDING);
    loaded = $state(false);

    async load() {
        try {
            const res = await fetch(`${API_BASE_URL}/api/branding`);
            if (res.ok) {
                const data = await res.json();
                this.info = data;
                this.applyBranding(data);
            }
        } catch (err) {
            console.warn('Failed to load branding:', err);
        } finally {
            this.loaded = true;
        }
    }

    private applyBranding(branding: BrandingInfo) {
        if (branding.color && branding.color !== '#5865F2') {
            document.documentElement.style.setProperty('--brand-color', branding.color);
        }

        if (branding.faviconUrl) {
            const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement
                || document.createElement('link');
            link.type = 'image/x-icon';
            link.rel = 'shortcut icon';
            link.href = branding.faviconUrl;
            document.head.appendChild(link);
        }

        if (branding.name && branding.name !== 'Kotbo') {
            document.title = `${branding.name} Dashboard`;
        }
    }

    get brandName(): string {
        return this.info.name;
    }

    get isWhiteLabel(): boolean {
        return this.info.isWhiteLabel;
    }

    get primaryColor(): string {
        return this.info.color;
    }

    get logoUrl(): string | null {
        return this.info.logoUrl;
    }

    get footerText(): string | null {
        return this.info.footerText;
    }
}

export const brandingStore = new BrandingStore();
