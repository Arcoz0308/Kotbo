<script lang="ts">
  import { router } from 'tinro';
  import Papicon from './Papicon.svelte';
  import { m } from '../i18n';
  import { dashboardStore } from '../stores/dashboard.svelte';
  import { sidebarStore } from '../stores/sidebar.svelte';
  import { notificationsStore } from '../stores/notifications.svelte';
  import { unsavedChanges } from '../stores/unsavedChanges.svelte';
  import { confirmDialog } from '../stores/confirmDialog.svelte';
  import { authStore } from '../stores/auth.svelte';

  type QuickItem = {
    label: string;
    icon: string;
    href: string;
    featureKey?: string;
    badge?: number;
  };

  const featureAccess = $derived(dashboardStore.state.featureAccess ?? {});

  function canView(featureKey?: string): boolean {
    if (!featureKey) return true;
    const access = (featureAccess as Record<string, { canView?: boolean }>)[featureKey];
    return access?.canView !== false;
  }

  const quickItems = $derived.by(() => {
    const candidates: QuickItem[] = [
      { label: m.nav_home(), icon: 'home', href: '/', featureKey: 'dashboard' },
      { label: m.nav_members(), icon: 'users', href: '/members', featureKey: 'members' },
      {
        label: m.nav_inbox(),
        icon: 'inbox',
        href: '/inbox',
        featureKey: 'inbox',
        badge: notificationsStore.unreadCount,
      },
      {
        label: m.nav_my_profile(),
        icon: 'user',
        href: authStore.user?.id ? `/profile/${authStore.user.id}` : '/profile',
      },
    ];

    return candidates.filter((item) => canView(item.featureKey)).slice(0, 3);
  });

  function isActive(href: string): boolean {
    return href === '/' ? $router.path === '/' : $router.path.startsWith(href);
  }

  async function navigate(event: MouseEvent, href: string) {
    event.preventDefault();
    if (isActive(href)) return;

    if (unsavedChanges.isDirty) {
      const confirmed = await confirmDialog.ask({
        title: 'Modifications non sauvegardées',
        description: `Vous avez des modifications non sauvegardées sur « ${unsavedChanges.pageLabel} ». Quitter sans enregistrer ?`,
        confirmLabel: 'Quitter sans enregistrer',
        variant: 'warning',
      });
      if (!confirmed) return;
      unsavedChanges.clear();
    }

    router.goto(href);
  }
</script>

<nav class="mobile-control-dock lg:hidden" aria-label="Navigation mobile principale">
  <div class="mobile-control-dock__surface" style={`--dock-items: ${quickItems.length + 1}`}>
    {#each quickItems as item (item.href)}
      <a
        href={item.href}
        onclick={(event) => navigate(event, item.href)}
        class:active={isActive(item.href)}
        class="mobile-control-dock__item"
        aria-current={isActive(item.href) ? 'page' : undefined}
      >
        <span class="mobile-control-dock__icon">
          <Papicon icon={item.icon} size={20} />
          {#if item.badge && item.badge > 0}
            <span class="mobile-control-dock__badge" aria-label={`${item.badge} éléments non lus`}>
              {item.badge > 9 ? '9+' : item.badge}
            </span>
          {/if}
        </span>
        <span>{item.label}</span>
      </a>
    {/each}

    <button
      type="button"
      onclick={() => sidebarStore.toggleMobile()}
      class:active={sidebarStore.mobileOpen}
      class="mobile-control-dock__item"
      aria-expanded={sidebarStore.mobileOpen}
      aria-controls="dashboard-sidebar"
    >
      <span class="mobile-control-dock__icon">
        <Papicon icon={sidebarStore.mobileOpen ? 'x' : 'menu'} size={20} />
      </span>
      <span>Menu</span>
    </button>
  </div>
</nav>

<style>
  .mobile-control-dock {
    position: fixed;
    z-index: 45;
    right: 0.75rem;
    bottom: max(0.625rem, env(safe-area-inset-bottom));
    left: 0.75rem;
    pointer-events: none;
  }

  .mobile-control-dock__surface {
    position: relative;
    display: grid;
    grid-template-columns: repeat(var(--dock-items, 4), minmax(0, 1fr));
    max-width: 30rem;
    min-height: 4.25rem;
    margin: 0 auto;
    padding: 0.375rem;
    overflow: hidden;
    pointer-events: auto;
    border: 1px solid color-mix(in srgb, var(--outline-variant) 82%, transparent);
    border-radius: 1.25rem;
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--primary-color) 8%, transparent), transparent 42%),
      color-mix(in srgb, var(--surface-container-lowest) 90%, transparent);
    box-shadow:
      0 18px 45px rgba(0, 0, 0, 0.18),
      0 2px 8px rgba(0, 0, 0, 0.08),
      inset 0 1px 0 color-mix(in srgb, white 9%, transparent);
    -webkit-backdrop-filter: blur(18px) saturate(1.4);
    backdrop-filter: blur(18px) saturate(1.4);
  }

  .mobile-control-dock__surface::before {
    position: absolute;
    top: 0;
    left: 18%;
    width: 38%;
    height: 1px;
    content: '';
    background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--primary-color) 65%, white), transparent);
  }

  .mobile-control-dock__item {
    position: relative;
    display: flex;
    min-width: 0;
    min-height: 3.5rem;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.2rem;
    border: 0;
    border-radius: 0.95rem;
    background: transparent;
    color: var(--on-surface-variant);
    font-family: var(--font-label);
    font-size: 0.625rem;
    font-weight: 650;
    line-height: 1;
    letter-spacing: 0.01em;
    transition: color 160ms ease, background-color 160ms ease, transform 120ms ease;
    -webkit-tap-highlight-color: transparent;
  }

  .mobile-control-dock__item:active {
    transform: scale(0.94);
  }

  .mobile-control-dock__item.active {
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 10%, transparent);
  }

  .mobile-control-dock__item.active::after {
    position: absolute;
    bottom: 0.25rem;
    width: 0.95rem;
    height: 2px;
    content: '';
    border-radius: 999px;
    background: var(--primary-color);
    box-shadow: 0 0 10px color-mix(in srgb, var(--primary-color) 70%, transparent);
  }

  .mobile-control-dock__icon {
    position: relative;
    display: grid;
    place-items: center;
    width: 1.65rem;
    height: 1.65rem;
  }

  .mobile-control-dock__badge {
    position: absolute;
    top: -0.3rem;
    right: -0.55rem;
    display: grid;
    min-width: 1rem;
    height: 1rem;
    padding: 0 0.2rem;
    place-items: center;
    border: 2px solid var(--surface-container-lowest);
    border-radius: 999px;
    background: #ef4444;
    color: white;
    font-size: 0.5rem;
    font-weight: 800;
  }

  @media (max-width: 360px) {
    .mobile-control-dock {
      right: 0.5rem;
      left: 0.5rem;
    }

    .mobile-control-dock__surface {
      min-height: 4rem;
      border-radius: 1.1rem;
    }
  }

  @media (max-height: 480px) and (orientation: landscape) {
    .mobile-control-dock {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .mobile-control-dock__item {
      transition: none;
    }
  }
</style>
