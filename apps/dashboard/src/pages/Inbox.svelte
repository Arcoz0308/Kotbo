<script lang="ts">
  import { onMount } from 'svelte';
  import { notificationsStore } from '../lib/stores/notifications.svelte';
  import { fade } from 'svelte/transition';
  import Papicon from '../lib/components/Papicon.svelte';

  onMount(() => {
    notificationsStore.fetchNotifications();
  });

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

<div class="max-w-4xl mx-auto space-y-6" in:fade={{ duration: 300, delay: 150 }}>
  <div class="flex items-end justify-between">
    <div>
      <h1 class="text-3xl font-black text-on-surface font-headline tracking-tight">Inbox</h1>
      <p class="text-on-surface-variant mt-1 text-sm font-medium">Historique de vos notifications</p>
    </div>
    {#if notificationsStore.unreadCount > 0}
      <button 
        onclick={() => notificationsStore.markAllAsRead()}
        class="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary font-bold text-sm rounded-xl hover:bg-primary/20 transition-all"
      >
        <Papicon icon="check" size={14} />
        Tout marquer lu
      </button>
    {/if}
  </div>

  <div class="bg-surface-container-lowest border border-outline-variant/30 rounded-3xl overflow-hidden shadow-sm">
    {#if notificationsStore.loading && notificationsStore.items.length === 0}
      <div class="p-12 flex flex-col items-center justify-center text-on-surface-variant/50">
        <Papicon icon="refresh-cw" size={40} class="animate-spin mb-4" />
        <span class="font-bold">Chargement de votre inbox...</span>
      </div>
    {:else if notificationsStore.items.length === 0}
      <div class="p-16 flex flex-col items-center justify-center text-on-surface-variant/40">
        <div class="w-20 h-20 bg-surface-container-high rounded-full flex items-center justify-center mb-6 border border-outline-variant/20">
          <Papicon icon="inbox" size={40} />
        </div>
        <span class="text-lg font-black text-on-surface-variant">Votre inbox est vide</span>
        <p class="text-sm mt-2 max-w-sm text-center">Vous n'avez reçu aucune notification pour le moment.</p>
      </div>
    {:else}
      <div class="divide-y divide-outline-variant/10">
        {#each notificationsStore.items as notif}
          <div 
            class="flex items-start gap-4 p-5 hover:bg-surface-container-low transition-colors {notif.isRead ? 'opacity-70' : 'bg-primary/5'}"
          >
            <div class="shrink-0 w-10 h-10 rounded-full flex items-center justify-center mt-1 {getColorForType(notif.type)}">
              <Papicon icon={getIconForType(notif.type)} size={20} />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-4 mb-1">
                <h3 class="text-base font-black text-on-surface {notif.isRead ? 'font-bold' : 'font-black'}">
                  {notif.title}
                </h3>
                <span class="text-xs font-bold text-on-surface-variant/60 whitespace-nowrap shrink-0">
                  {new Date(notif.createdAt).toLocaleString('fr-FR', {
                    day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit'
                  })}
                </span>
              </div>
              <p class="text-sm text-on-surface-variant mb-3 max-w-2xl">
                {notif.message}
              </p>
              
              <div class="flex gap-3">
                {#if notif.link}
                  <a 
                    href={notif.link}
                    class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-xs font-bold rounded-lg transition-colors border border-outline-variant/20 shadow-sm"
                  >
                    Voir les détails
                    <Papicon icon="arrow-right" size={14} />
                  </a>
                {/if}
                {#if !notif.isRead}
                  <button 
                    onclick={() => notificationsStore.markAsRead(notif.id)}
                    class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-transparent hover:bg-surface-container-high text-on-surface-variant text-xs font-bold rounded-lg transition-colors"
                  >
                    Marquer lu
                  </button>
                {/if}
              </div>
            </div>
            {#if !notif.isRead}
              <div class="shrink-0 w-2.5 h-2.5 rounded-full bg-primary mt-3 shadow-[0_0_10px_rgba(var(--color-primary),0.6)]"></div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
