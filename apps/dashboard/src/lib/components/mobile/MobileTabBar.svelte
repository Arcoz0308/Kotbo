<script lang="ts">
  import { router } from 'tinro';
  import { m } from '../../i18n';
  import { confirmDialog } from '../../stores/confirmDialog.svelte';
  import { mobileNav } from '../../stores/mobileNav.svelte';
  import { navigationStore, isActiveNavItem } from '../../stores/navigation.svelte';
  import { notificationsStore } from '../../stores/notifications.svelte';
  import { unsavedChanges } from '../../stores/unsavedChanges.svelte';
  import type { PageConfig } from '../../config/pages';
  import Papicon from '../Papicon.svelte';

  /**
   * Destinations competing for the four fixed slots, best first. Whatever the
   * user cannot reach is skipped, so a moderator and an admin get a tab bar
   * filled with pages that are actually useful to each of them.
   */
  const PREFERRED_TABS = ['/', '/inbox', '/members', '/tickets', '/sanctions', '/analytics'];
  const SLOTS = 4;

  const tabs = $derived.by((): PageConfig[] => {
    const reachable = navigationStore.allItems;
    const byHref = new Map(reachable.map((item) => [item.href, item]));

    const picked = PREFERRED_TABS.map((href) => byHref.get(href)).filter(
      (item): item is PageConfig => !!item,
    );

    // If permissions strip the preferred set down, top up from what is left so
    // the bar never collapses to one or two lonely icons.
    const extras = reachable.filter((item) => !PREFERRED_TABS.includes(item.href));
    return [...picked, ...extras].slice(0, SLOTS);
  });

  const isNavSheetOpen = $derived(mobileNav.sheet === 'nav');

  function isActive(href: string): boolean {
    return !isNavSheetOpen && isActiveNavItem(href, $router.path, $router.url);
  }

  function badgeFor(href: string): number {
    return href === '/inbox' ? notificationsStore.unreadCount : 0;
  }

  async function navigate(event: MouseEvent, href: string) {
    event.preventDefault();
    mobileNav.close();

    if (isActiveNavItem(href, $router.path, $router.url)) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

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

  /**
   * Android resizes the visual viewport when the soft keyboard opens, which
   * would leave a fixed bar stranded in the middle of the screen. Hide it while
   * the keyboard is up.
   */
  let keyboardOpen = $state(false);

  $effect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const onResize = () => {
      keyboardOpen = window.innerHeight - viewport.height > 160;
    };

    viewport.addEventListener('resize', onResize);
    onResize();
    return () => viewport.removeEventListener('resize', onResize);
  });
</script>

{#if tabs.length > 0}
  <nav
    class="tabbar"
    class:tabbar--hidden={keyboardOpen}
    aria-label={m.nav_group_general()}
    aria-hidden={keyboardOpen}
    inert={keyboardOpen}
  >
    {#each tabs as tab (tab.href)}
      {@const badge = badgeFor(tab.href)}
      <a
        href={tab.href}
        class="tabbar__tab"
        class:tabbar__tab--active={isActive(tab.href)}
        aria-current={isActive(tab.href) ? 'page' : undefined}
        onclick={(event) => navigate(event, tab.href)}
      >
        <span class="tabbar__glyph">
          <Papicon icon={tab.icon ?? 'circle'} size={21} />
          {#if badge > 0}
            <span class="tabbar__badge" aria-hidden="true">{badge > 9 ? '9+' : badge}</span>
          {/if}
        </span>
        <span class="tabbar__label">{tab.name}</span>
        {#if badge > 0}
          <span class="sr-only">{badge}</span>
        {/if}
      </a>
    {/each}

    <button
      type="button"
      class="tabbar__tab"
      class:tabbar__tab--active={isNavSheetOpen}
      aria-expanded={isNavSheetOpen}
      aria-haspopup="dialog"
      onclick={() => mobileNav.toggle('nav')}
    >
      <span class="tabbar__glyph">
        <Papicon icon={isNavSheetOpen ? 'x' : 'menu'} size={21} />
      </span>
      <span class="tabbar__label">{m.nav_more()}</span>
    </button>
  </nav>
{/if}

<style>
  .tabbar {
    position: fixed;
    z-index: 45;
    right: 0;
    bottom: 0;
    left: 0;
    display: grid;
    grid-auto-columns: minmax(0, 1fr);
    grid-auto-flow: column;
    align-items: stretch;
    padding: 0.3125rem 0.25rem calc(0.3125rem + env(safe-area-inset-bottom));
    border-top: 1px solid var(--outline-variant);
    background: color-mix(in srgb, var(--surface-container-lowest) 88%, transparent);
    transition: transform 200ms ease, opacity 200ms ease;
    -webkit-backdrop-filter: blur(20px) saturate(1.6);
    backdrop-filter: blur(20px) saturate(1.6);
  }

  .tabbar--hidden {
    opacity: 0;
    pointer-events: none;
    transform: translateY(100%);
  }

  .tabbar__tab {
    position: relative;
    display: flex;
    min-width: 0;
    min-height: 3rem;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.1875rem;
    border-radius: 0.75rem;
    color: var(--on-surface-variant);
    transition: color 150ms ease;
    -webkit-tap-highlight-color: transparent;
  }

  .tabbar__tab:active .tabbar__glyph {
    transform: scale(0.9);
  }

  .tabbar__tab--active {
    color: var(--primary-color);
  }

  .tabbar__glyph {
    position: relative;
    display: grid;
    width: 1.75rem;
    height: 1.5rem;
    place-items: center;
    transition: transform 150ms ease;
  }

  /* A short bar above the active icon reads faster than a filled pill. */
  .tabbar__tab--active .tabbar__glyph::after {
    position: absolute;
    top: -0.4375rem;
    width: 1.125rem;
    height: 0.1875rem;
    content: '';
    border-radius: 999px;
    background: var(--primary-color);
  }

  .tabbar__label {
    max-width: 100%;
    overflow: hidden;
    font-family: var(--font-label);
    font-size: 0.625rem;
    font-weight: 650;
    letter-spacing: -0.01em;
    line-height: 1.1;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tabbar__tab--active .tabbar__label {
    font-weight: 750;
  }

  .tabbar__badge {
    position: absolute;
    top: -0.1875rem;
    right: -0.0625rem;
    display: grid;
    min-width: 1.0625rem;
    height: 1.0625rem;
    padding: 0 0.25rem;
    place-items: center;
    border: 2px solid var(--surface-container-lowest);
    border-radius: 999px;
    background: #ef4444;
    color: #fff;
    font-size: 0.5625rem;
    font-weight: 800;
    line-height: 1;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* Landscape phones have almost no vertical room; drop the labels. */
  @media (max-height: 460px) and (orientation: landscape) {
    .tabbar__label {
      display: none;
    }

    .tabbar__tab {
      min-height: 2.5rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .tabbar,
    .tabbar__glyph {
      transition: none;
    }
  }
</style>
