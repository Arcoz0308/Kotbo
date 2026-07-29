<script lang="ts">
  import { router } from 'tinro';
  import { buildCrumbs } from '../../breadcrumbs';
  import { m } from '../../i18n';
  import { resolveGuildIconSrc } from '../../discordMedia';
  import { authStore } from '../../stores/auth.svelte';
  import { confirmDialog } from '../../stores/confirmDialog.svelte';
  import { serverSwitcherStore } from '../../stores/serverSwitcher.svelte';
  import { unsavedChanges } from '../../stores/unsavedChanges.svelte';
  import NotificationBell from '../NotificationBell.svelte';
  import Papicon from '../Papicon.svelte';

  const crumbs = $derived(buildCrumbs($router.path));

  /** Anything deeper than "Home > Page" gets a back target instead of the logo. */
  const parent = $derived(crumbs.length > 2 ? crumbs[crumbs.length - 2] : null);
  const title = $derived(crumbs.at(-1)?.name ?? m.nav_home());

  const guild = $derived(authStore.guilds.find((g) => g.id === authStore.selectedGuildId));
  const guildIcon = $derived(guild ? resolveGuildIconSrc(guild.id, guild.icon) : null);
  const canSwitchServer = $derived(authStore.guilds.length > 1);

  /**
   * The bar hides on the way down and returns on the way up, so a long members
   * table gets the full screen without stranding the user without navigation.
   */
  let hidden = $state(false);

  $effect(() => {
    let lastY = window.scrollY;
    let ticking = false;

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - lastY;
        // Ignore rubber-banding and jitter below the fold threshold.
        if (Math.abs(delta) > 6 && y > 72) hidden = delta > 0;
        if (y <= 72) hidden = false;
        lastY = y;
        ticking = false;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  });

  // Never leave the bar hidden across a route change.
  $effect(() => {
    void $router.path;
    hidden = false;
  });

  async function goBack(event: MouseEvent) {
    if (!parent) return;
    event.preventDefault();

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

    router.goto(parent.href);
  }
</script>

<header class="topbar" class:topbar--hidden={hidden}>
  {#if parent}
    <a class="topbar__lead" href={parent.href} onclick={goBack} aria-label={m.nav_back_to({ page: parent.name })}>
      <Papicon icon="arrow-left" size={20} />
    </a>
  {:else}
    <button
      type="button"
      class="topbar__lead topbar__lead--server"
      onclick={() => serverSwitcherStore.show()}
      disabled={!canSwitchServer}
      aria-label={canSwitchServer ? m.nav_switch_server() : (guild?.name ?? '')}
    >
      {#if guildIcon}
        <img src={guildIcon} alt="" width="30" height="30" referrerpolicy="no-referrer" />
      {:else}
        <span class="topbar__server-fallback">{guild?.name?.charAt(0) ?? '?'}</span>
      {/if}
    </button>
  {/if}

  <div class="topbar__heading">
    <h1 class="topbar__title">{title}</h1>
    {#if guild?.name}
      <p class="topbar__context">{guild.name}</p>
    {/if}
  </div>

  <div class="topbar__trailing">
    <NotificationBell />
  </div>
</header>

<div class="topbar-spacer" aria-hidden="true"></div>

<style>
  .topbar {
    position: fixed;
    z-index: 40;
    top: 0;
    right: 0;
    left: 0;
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: env(safe-area-inset-top) max(0.5rem, env(safe-area-inset-right)) 0
      max(0.5rem, env(safe-area-inset-left));
    border-bottom: 1px solid var(--outline-variant);
    background: color-mix(in srgb, var(--surface-container-lowest) 86%, transparent);
    transition: transform 220ms ease;
    -webkit-backdrop-filter: blur(20px) saturate(1.6);
    backdrop-filter: blur(20px) saturate(1.6);
  }

  .topbar--hidden {
    transform: translateY(-100%);
  }

  .topbar__lead {
    display: grid;
    width: 2.75rem;
    height: 3.25rem;
    flex: none;
    place-items: center;
    color: var(--on-surface);
    -webkit-tap-highlight-color: transparent;
  }

  .topbar__lead--server:disabled {
    cursor: default;
  }

  .topbar__lead img,
  .topbar__server-fallback {
    display: grid;
    width: 1.875rem;
    height: 1.875rem;
    place-items: center;
    border-radius: 0.625rem;
    object-fit: cover;
  }

  .topbar__server-fallback {
    background: color-mix(in srgb, var(--primary-color) 14%, transparent);
    color: var(--primary-color);
    font-size: 0.8125rem;
    font-weight: 800;
  }

  .topbar__heading {
    min-width: 0;
    height: 3.25rem;
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .topbar__title {
    overflow: hidden;
    color: var(--on-surface);
    font-family: var(--font-headline);
    font-size: 1.0625rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.15;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .topbar__context {
    overflow: hidden;
    color: var(--on-surface-variant);
    font-size: 0.6875rem;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .topbar__trailing {
    display: flex;
    flex: none;
    align-items: center;
  }

  .topbar-spacer {
    height: calc(3.25rem + env(safe-area-inset-top));
  }

  @media (prefers-reduced-motion: reduce) {
    .topbar {
      transition: none;
    }
  }
</style>
