<script lang="ts">
  import { onMount } from 'svelte';
  import { notificationsStore } from '../lib/stores/notifications.svelte';
  import { fade, slide, fly } from 'svelte/transition';
  import Papicon from '../lib/components/Papicon.svelte';

  let currentTab = $state('tous');

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
      case 'SUCCESS': return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
      case 'WARNING': return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
      case 'ERROR': return 'text-rose-500 bg-rose-500/10 border-rose-500/20';
      default: return 'text-primary bg-primary/10 border-primary/20';
    }
  };

  const getCategory = (notif: any) => {
    const title = notif.title.toLowerCase();
    const msg = notif.message.toLowerCase();
    const link = (notif.link || '').toLowerCase();

    if (title.includes('sanction') || title.includes('bannissement') || title.includes('exclusion') || title.includes('timeout') || title.includes('avertissement')) return 'modération';
    if (title.includes('candidature') || link.includes('recruitment')) return 'recrutement';
    if (title.includes('staff') || title.includes('management') || title.includes('note') || link.includes('absences') || link.includes('meeting')) return 'staff';
    if (title.includes('bot') || title.includes('système') || title.includes('erreur')) return 'système';
    return 'tous';
  };

  const filteredNotifications = $derived(
    currentTab === 'tous' 
      ? notificationsStore.items 
      : notificationsStore.items.filter(n => getCategory(n) === currentTab)
  );

  const tabs = [
    { id: 'tous', label: 'Tous', icon: 'layers' },
    { id: 'modération', label: 'Modération', icon: 'shield' },
    { id: 'recrutement', label: 'Recrutement', icon: 'users' },
    { id: 'staff', label: 'Staff', icon: 'user-check' },
    { id: 'système', label: 'Système', icon: 'cpu' },
  ];
</script>

<div class="max-w-5xl mx-auto space-y-8" in:fade={{ duration: 300, delay: 150 }}>
  <!-- Header -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface-container-low/40 p-5 rounded-xl border border-outline-variant/30">
    <div class="flex items-center gap-4">
      <div class="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
        <Papicon icon="inbox" size={20} />
      </div>
      <div>
        <h1 class="text-lg font-semibold text-on-surface font-headline tracking-tight">Inbox</h1>
        <p class="text-sm text-on-surface-variant/70 font-medium max-w-md">
          Votre centre de communication centralisé pour toutes les activités du serveur.
        </p>
      </div>
    </div>

    <div class="flex items-center gap-3">
      {#if notificationsStore.unreadCount > 0}
        <button
          onclick={() => notificationsStore.markAllAsRead()}
          class="group flex items-center gap-2 px-4 py-2 bg-primary text-white font-semibold text-sm rounded-lg hover:scale-105 active:scale-95 transition-all"
        >
          <Papicon icon="check" size={16} />
          Tout marquer lu
        </button>
      {/if}
      <button
        onclick={() => notificationsStore.fetchNotifications()}
        class="p-2 bg-surface-container-high text-on-surface-variant rounded-lg hover:bg-surface-container-highest transition-all border border-outline-variant/30"
        title="Rafraîchir"
      >
        <Papicon icon="refresh-cw" size={18} class={notificationsStore.loading ? 'animate-spin' : ''} />
      </button>
    </div>
  </div>

  <!-- Tabs -->
  <div class="flex items-center gap-2 p-1.5 bg-surface-container-lowest border border-outline-variant/20 rounded-[22px] overflow-x-auto no-scrollbar shadow-sm">
    {#each tabs as tab}
      <button
        onclick={() => currentTab = tab.id}
        class="relative flex items-center gap-2.5 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300
          {currentTab === tab.id ? 'text-white' : 'text-on-surface-variant hover:bg-surface-container-high'}"
      >
        {#if currentTab === tab.id}
          <div 
            class="absolute inset-0 bg-primary rounded-lg shadow-[0_4px_12px_rgba(var(--color-primary),0.25)]"
            in:fade={{ duration: 200 }}
          ></div>
        {/if}
        <span class="relative z-10 flex items-center gap-2.5">
          <Papicon icon={tab.icon} size={18} />
          {tab.label}
          
          {#if tab.id === 'tous' && notificationsStore.unreadCount > 0}
            <span class="px-1.5 py-0.5 bg-white/20 text-white rounded-lg text-[10px] font-semibold">
              {notificationsStore.unreadCount}
            </span>
          {/if}
        </span>
      </button>
    {/each}
  </div>

  <!-- Content -->
  <div class="space-y-4">
    {#if notificationsStore.loading && notificationsStore.items.length === 0}
      <div class="grid gap-4">
        {#each Array(5) as _}
          <div class="h-32 bg-surface-container-lowest border border-outline-variant/20 rounded-xl animate-pulse"></div>
        {/each}
      </div>
    {:else if filteredNotifications.length === 0}
      <div class="py-24 flex flex-col items-center justify-center text-on-surface-variant/40 bg-surface-container-lowest border border-outline-variant/20 rounded-[40px] shadow-sm" in:fade>
        <div class="w-24 h-24 bg-surface-container-high rounded-[32px] flex items-center justify-center mb-8 border border-outline-variant/20 rotate-3">
          <Papicon icon="inbox" size={48} />
        </div>
        <h2 class="text-2xl font-semibold text-on-surface">Inbox impeccable</h2>
        <p class="text-sm mt-3 max-w-xs text-center font-medium opacity-60">
          Aucune notification dans la catégorie <b>{currentTab}</b> pour le moment. Reposez-vous bien !
        </p>
      </div>
    {:else}
      <div class="grid gap-4">
        {#each filteredNotifications as notif (notif.id)}
          <div 
            class="group relative flex items-start gap-5 p-6 bg-surface-container-lowest border border-outline-variant/20 rounded-[32px] hover:border-primary/30 transition-all duration-300 shadow-sm hover:shadow-xl hover:-translate-y-1 {notif.isRead ? 'opacity-80' : 'after:absolute after:left-0 after:top-8 after:bottom-8 after:w-1 after:bg-primary after:rounded-full'}"
            in:fly={{ y: 20, duration: 400 }}
          >
            <!-- Type Icon -->
            <div class="shrink-0 w-14 h-14 rounded-lg flex items-center justify-center border {getColorForType(notif.type)} shadow-sm transition-transform group-">
              <Papicon icon={getIconForType(notif.type)} size={28} />
            </div>

            <!-- Content -->
            <div class="flex-1 min-w-0">
              <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-4 mb-2">
                <div class="flex items-center gap-2">
                  <h3 class="text-lg font-semibold text-on-surface tracking-tight truncate">
                    {notif.title}
                  </h3>
                  {#if !notif.isRead}
                    <span class="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(var(--color-primary),0.8)]"></span>
                  {/if}
                </div>
                <span class="text-xs font-bold text-on-surface-variant/50 whitespace-nowrap bg-surface-container-high px-3 py-1.5 rounded-full border border-outline-variant/20">
                  {new Date(notif.createdAt).toLocaleString('fr-FR', {
                    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                  })}
                </span>
              </div>
              
              <p class="text-[15px] leading-relaxed text-on-surface-variant/80 mb-5 max-w-3xl font-medium">
                {notif.message}
              </p>
              
              <div class="flex items-center justify-between">
                <div class="flex gap-2">
                  {#if notif.link}
                    <a 
                      href={notif.link}
                      class="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-xs font-semibold rounded-xl hover:scale-105 active:scale-95 transition-all shadow-[0_4px_12px_rgba(var(--color-primary),0.2)]"
                    >
                      <Papicon icon="external-link" size={14} />
                      Consulter
                    </a>
                  {/if}
                  
                  {#if !notif.isRead}
                    <button 
                      onclick={() => notificationsStore.markAsRead(notif.id)}
                      class="inline-flex items-center gap-2 px-5 py-2.5 bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-xs font-semibold rounded-xl transition-all border border-outline-variant/30"
                    >
                      <Papicon icon="check" size={14} />
                      Marquer lu
                    </button>
                  {/if}
                </div>

                <div class="hidden sm:flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/30">
                  <span class="w-1.5 h-1.5 rounded-full bg-current opacity-30"></span>
                  {getCategory(notif)}
                </div>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }
  .no-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
</style>
