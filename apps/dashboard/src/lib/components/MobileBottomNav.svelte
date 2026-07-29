<script lang="ts">
  import { router } from 'tinro';
  import Papicon from './Papicon.svelte';
  import { m } from '../i18n';
  import { dashboardStore } from '../stores/dashboard.svelte';
  import { notificationsStore } from '../stores/notifications.svelte';
  import { unsavedChanges } from '../stores/unsavedChanges.svelte';
  import { confirmDialog } from '../stores/confirmDialog.svelte';
  import { getMobilePageLayout } from '../mobilePageContext';

  type NavItem = {
    label: string;
    icon: string;
    href: string;
    featureKey: string;
    badge?: number;
  };

  const featureAccess = $derived(dashboardStore.state.featureAccess ?? {});
  const mobileLayout = $derived(getMobilePageLayout($router.path));
  const isVisible = $derived(mobileLayout === 'overview' || mobileLayout === 'directory');

  const items = $derived(
    [
      { label: m.nav_home(), icon: 'home', href: '/', featureKey: 'dashboard' },
      { label: m.nav_inbox(), icon: 'inbox', href: '/inbox', featureKey: 'inbox', badge: notificationsStore.unreadCount },
      { label: m.nav_members(), icon: 'users', href: '/members', featureKey: 'members' },
    ].filter((item) => {
      const access = (featureAccess as Record<string, { canView?: boolean }>)[item.featureKey];
      return access?.canView !== false;
    }) as NavItem[],
  );

  $effect(() => {
    document.body.classList.toggle('has-mobile-dock', isVisible);
    return () => document.body.classList.remove('has-mobile-dock');
  });

  function isActive(href: string): boolean {
    return href === '/' ? $router.path === '/' : $router.path.startsWith(href);
  }

  async function navigate(event: MouseEvent, href: string) {
    event.preventDefault();
    if (isActive(href)) return;

    if (unsavedChanges.isDirty) {
      const confirmed = await confirmDialog.ask({
        title: m.banner_unsaved_title(),
        description: m.banner_unsaved_desc({ page: unsavedChanges.pageLabel }),
        confirmLabel: m.banner_unsaved_leave(),
        variant: 'warning',
      });
      if (!confirmed) return;
      unsavedChanges.clear();
    }

    router.goto(href);
  }
</script>

{#if isVisible && items.length > 0}
  <nav class="mobile-bottom-nav md:hidden" aria-label="Navigation mobile principale">
    {#each items as item (item.href)}
      <a
        href={item.href}
        onclick={(event) => navigate(event, item.href)}
        class:active={isActive(item.href)}
        class="mobile-bottom-nav__item"
        aria-current={isActive(item.href) ? 'page' : undefined}
      >
        <span class="mobile-bottom-nav__icon">
          <Papicon icon={item.icon} size={20} />
          {#if item.badge && item.badge > 0}
            <span class="mobile-bottom-nav__badge" aria-label={`${item.badge} éléments non lus`}>
              {item.badge > 9 ? '9+' : item.badge}
            </span>
          {/if}
        </span>
        <span class="mobile-bottom-nav__label">{item.label}</span>
      </a>
    {/each}
  </nav>
{/if}

<style>
  .mobile-bottom-nav {
    position: fixed;
    z-index: 39;
    right: max(0.75rem, env(safe-area-inset-right));
    bottom: max(0.5rem, env(safe-area-inset-bottom));
    left: max(0.75rem, env(safe-area-inset-left));
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    max-width: 25rem;
    min-height: 3.875rem;
    margin: 0 auto;
    padding: 0.3rem;
    border: 1px solid color-mix(in srgb, var(--outline-variant) 78%, transparent);
    border-radius: 1.125rem;
    background: color-mix(in srgb, var(--surface-container-lowest) 94%, transparent);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.16);
    -webkit-backdrop-filter: blur(16px) saturate(1.25);
    backdrop-filter: blur(16px) saturate(1.25);
  }

  .mobile-bottom-nav__item {
    position: relative;
    display: flex;
    min-width: 0;
    min-height: 3.25rem;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.15rem;
    border-radius: 0.85rem;
    color: var(--on-surface-variant);
    font-family: var(--font-label);
    -webkit-tap-highlight-color: transparent;
  }

  .mobile-bottom-nav__item.active {
    background: color-mix(in srgb, var(--primary-color) 11%, transparent);
    color: var(--primary-color);
  }

  .mobile-bottom-nav__icon {
    position: relative;
    display: grid;
    width: 1.5rem;
    height: 1.5rem;
    place-items: center;
  }

  .mobile-bottom-nav__label {
    display: block;
    width: 100%;
    overflow: hidden;
    font-size: 0.625rem;
    font-weight: 700;
    line-height: 1;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mobile-bottom-nav__badge {
    position: absolute;
    top: -0.35rem;
    right: -0.6rem;
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

  @media (max-height: 480px) and (orientation: landscape) {
    .mobile-bottom-nav {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .mobile-bottom-nav__item {
      transition: none;
    }
  }
</style>
