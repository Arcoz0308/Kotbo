<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { notificationsStore } from '../stores/notifications.svelte';
  import { fade, slide } from 'svelte/transition';
  import Papicon from './Papicon.svelte';

  let open = $state(false);

  onMount(() => {
    notificationsStore.fetchNotifications();
    
    // Polling every 60s
    const interval = setInterval(() => {
      notificationsStore.fetchNotifications();
    }, 60000);

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.notif-container')) {
        open = false;
      }
    };
    window.addEventListener('click', handleClick);

    return () => {
      clearInterval(interval);
      window.removeEventListener('click', handleClick);
    };
  });

  const toggle = (e: MouseEvent) => {
    e.stopPropagation();
    open = !open;
  };

  const getIconForType = (type: string) => {
    switch (type) {
      case 'SUCCESS': return 'check-circle';
      case 'WARNING': return 'alert-triangle';
      case 'ERROR': return 'alert-circle';
      default: return 'info';
    }
  };

  const getColorForType = (type: string) => {
    switch (type) {
      case 'SUCCESS': return 'text-emerald-500 bg-emerald-500/10';
      case 'WARNING': return 'text-amber-500 bg-amber-500/10';
      case 'ERROR': return 'text-rose-500 bg-rose-500/10';
      default: return 'text-primary bg-primary/10';
    }
  };
</script>

<div class="relative notif-container group">
  <button 
    onclick={toggle}
    class="relative w-10 h-10 rounded-2xl border border-outline-variant/30 bg-surface-container-low flex items-center justify-center transition-all duration-300 hover:bg-surface-container-high hover:scale-105"
  >
    <Papicon 
      icon="bell" 
      size={20} 
      class="text-on-surface-variant {notificationsStore.unreadCount > 0 ? 'animate-bounce text-primary' : ''}" 
    />
    
    {#if notificationsStore.unreadCount > 0}
      <div class="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-primary rounded-full flex items-center justify-center border-2 border-surface shadow-[0_0_10px_rgba(var(--color-primary),0.4)]">
        <span class="text-[10px] font-black text-white leading-none">
          {notificationsStore.unreadCount > 99 ? '99+' : notificationsStore.unreadCount}
        </span>
      </div>
    {/if}
  </button>

  {#if open}
    <div 
      transition:slide={{ duration: 200, axis: 'y' }}
      class="absolute right-0 top-14 w-80 max-h-[400px] bg-surface-container-lowest/95 backdrop-blur-2xl rounded-2xl border border-outline-variant/30 shadow-2xl flex flex-col overflow-hidden z-50 origin-top-right"
    >
      <div class="p-4 border-b border-outline-variant/20 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-2">
          <span class="text-sm font-black text-on-surface">Notifications</span>
          {#if notificationsStore.unreadCount > 0}
            <span class="px-2 py-0.5 rounded-full bg-primary/10 text-[10px] font-black text-primary">
              {notificationsStore.unreadCount} non lues
            </span>
          {/if}
        </div>
        {#if notificationsStore.unreadCount > 0}
          <button 
            onclick={() => notificationsStore.markAllAsRead()}
            class="text-[10px] font-bold text-on-surface-variant hover:text-primary transition-colors"
          >
            Tout marquer lu
          </button>
        {/if}
      </div>

      <div class="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-outline-variant/30 scrollbar-track-transparent">
        {#if notificationsStore.loading && notificationsStore.items.length === 0}
          <div class="p-8 flex flex-col items-center justify-center text-on-surface-variant/50">
            <Papicon icon="refresh-cw" size={24} class="animate-spin mb-2" />
            <span class="text-xs font-bold">Chargement...</span>
          </div>
        {:else if notificationsStore.items.length === 0}
          <div class="p-8 flex flex-col items-center justify-center text-on-surface-variant/40">
            <Papicon icon="bell-off" size={40} class="mb-2" />
            <span class="text-xs font-bold text-center">Aucune notification</span>
          </div>
        {:else}
          <div class="flex flex-col">
            {#each notificationsStore.items as notif}
              <div 
                class="flex gap-3 p-4 border-b border-outline-variant/10 last:border-0 hover:bg-surface-container-high/50 transition-colors cursor-pointer {notif.isRead ? 'opacity-60' : 'bg-primary/5'}"
                onclick={() => {
                  if (!notif.isRead) notificationsStore.markAsRead(notif.id);
                  if (notif.link) window.location.href = notif.link;
                }}
                onkeydown={(e) => {
                  if (e.key === 'Enter') {
                    if (!notif.isRead) notificationsStore.markAsRead(notif.id);
                    if (notif.link) window.location.href = notif.link;
                  }
                }}
                role="button"
                tabindex="0"
              >
                <div class="shrink-0 w-8 h-8 rounded-full flex items-center justify-center {getColorForType(notif.type)}">
                  <Papicon icon={getIconForType(notif.type)} size={14} />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-start justify-between gap-2 mb-0.5">
                    <p class="text-xs font-bold text-on-surface truncate {notif.isRead ? 'font-medium' : 'font-black'}">
                      {notif.title}
                    </p>
                    <span class="text-[9px] font-bold text-on-surface-variant/60 whitespace-nowrap shrink-0">
                      {new Date(notif.createdAt).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                  <p class="text-[11px] text-on-surface-variant leading-tight line-clamp-2">
                    {notif.message}
                  </p>
                </div>
                {#if !notif.isRead}
                  <div class="shrink-0 w-2 h-2 rounded-full bg-primary mt-1.5 shadow-[0_0_8px_rgba(var(--color-primary),0.5)]"></div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <div class="p-2 border-t border-outline-variant/20 shrink-0">
        <a 
          href="/inbox" 
          class="flex items-center justify-center w-full py-2 rounded-xl text-xs font-bold text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-all"
        >
          Voir tout l'historique
        </a>
      </div>
    </div>
  {/if}
</div>
