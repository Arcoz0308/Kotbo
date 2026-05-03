<script lang="ts">
  import { router } from 'tinro';
  import { authStore } from '../lib/stores/auth.svelte';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { notificationsStore } from '../lib/stores/notifications.svelte';
  import { staffStore } from '../lib/stores/staff.svelte';
  import { refreshDashboardOnMount } from '../lib/dashboardLifecycle';
  import RefreshButton from '../lib/components/RefreshButton.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import LineChart from '../lib/components/LineChart.svelte';
  import MetricCard from '../lib/components/MetricCard.svelte';
  import ActionButton from '../lib/components/ActionButton.svelte';

  refreshDashboardOnMount();

  // Trigger notifications and staff fetch
  $effect(() => {
    if (authStore.selectedGuildId) {
      notificationsStore.fetchNotifications();
      staffStore.fetchAll();
    }
  });

  const activeModulesCount = $derived(dashboardStore.state.modules.filter(m => m.status === 'active').length);
  const totalModulesCount = $derived(dashboardStore.state.modules.length);
  const errorModulesCount = $derived(dashboardStore.state.modules.filter(m => m.status === 'error').length);
  
  const unreadNotifs = $derived(notificationsStore.items.filter(n => !n.isRead).slice(0, 3));
  const pendingAbsences = $derived(staffStore.pendingAbsences);
  const nextMeeting = $derived(staffStore.upcomingMeetings[0]);
  
  const activityData = $derived(dashboardStore.state.analytics.activityTrend.map((v, i) => ({
    name: `J-${6-i}`,
    value: v
  })));

  const handleMarkAsRead = async (id: string) => {
    await notificationsStore.markAsRead(id);
  };

  const LOGO_URL_SERVEUR = "/favicon.svg";
</script>

<div class="space-y-6 animate-in fade-in duration-500 pb-10">
  
  <!-- Header Premium -->
  <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-surface-container-low/40 p-6 md:p-8 rounded-[2.5rem] border border-outline-variant/10 backdrop-blur-md">
    <div class="flex items-center gap-6">
      <div class="relative">
        <img src={LOGO_URL_SERVEUR} alt="Bot Logo" class="w-16 h-16 md:w-20 md:h-20 rounded-3xl shadow-xl shadow-primary/10 overflow-hidden shrink-0 border border-white/10"/>
        <div class="absolute -bottom-1 -right-1 bg-emerald-500 w-5 h-5 rounded-full border-4 border-surface shadow-md flex items-center justify-center">
           <div class="w-1.5 h-1.5 rounded-full bg-white opacity-80"></div>
        </div>
      </div>
      <div>
        <h2 class="text-2xl md:text-3xl font-black tracking-tight text-on-surface font-headline leading-tight">
          {authStore.user?.username ? `Ravi de vous revoir, ${authStore.user.username} !` : 'Bonjour !'}
        </h2>
        <p class="text-on-surface-variant/60 mt-1 font-medium text-sm md:text-base">
          Voici l'état actuel de <span class="text-primary font-bold">{dashboardStore.state.guildName || 'votre serveur'}</span>.
        </p>
      </div>
    </div>
    
    <div class="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
      <div class="flex flex-col items-start md:items-end mr-2">
        <span class="text-[9px] font-black text-on-surface-variant/30 uppercase tracking-[0.2em]">Dernière synchro</span>
        <span class="text-[11px] font-bold text-on-surface-variant/70">Instantané</span>
      </div>
      <RefreshButton
        onClick={() => {
          dashboardStore.refresh();
          notificationsStore.fetchNotifications();
        }}
        loading={dashboardStore.state.loading}
        iconOnly={false}
        ariaLabel="Rafraîchir"
        className="!rounded-2xl !px-5 !py-2.5 shadow-md shadow-primary/5 hover:shadow-primary/10 transition-all"
      >
        <span class="ml-2 font-black uppercase tracking-widest text-[10px]">Actualiser</span>
      </RefreshButton>
    </div>
  </div>

  <!-- Intelligence UI: Alertes épurées -->
  {#if errorModulesCount > 0}
    <div class="bg-error-container/10 border border-error/20 p-5 rounded-[2rem] text-error flex items-center justify-between gap-6">
      <div class="flex items-center gap-4">
        <div class="w-10 h-10 rounded-xl bg-error/10 flex items-center justify-center text-error">
          <Papicon icon="alert-octagon" size={22} />
        </div>
        <div>
          <h4 class="text-base font-black tracking-tight">Maintenance requise</h4>
          <p class="text-[13px] font-medium opacity-70">{errorModulesCount} module(s) nécessitent votre attention.</p>
        </div>
      </div>
      <ActionButton 
        label="Réparer" 
        onClick={() => router.goto('/module-catalog')}
        className="!bg-error !text-on-error !rounded-xl !px-4 !py-2 !text-[11px]"
      />
    </div>
  {/if}

  <!-- Barre d'Actions Rapides -->
  <div class="flex flex-wrap gap-3 items-center">
    <span class="text-[9px] font-black text-on-surface-variant/30 uppercase tracking-[0.2em] mr-2">Raccourcis :</span>
    <button onclick={() => router.goto('/absences')} class="quick-action-btn group">
       <Papicon icon="calendar-plus" size={14} class="text-primary" />
       <span>Absence</span>
    </button>
    <button onclick={() => router.goto('/meetings')} class="quick-action-btn group">
       <Papicon icon="video" size={14} class="text-secondary" />
       <span>Réunion</span>
    </button>
    <button onclick={() => router.goto('/module-catalog')} class="quick-action-btn group">
       <Papicon icon="plus-circle" size={14} class="text-tertiary" />
       <span>Module</span>
    </button>
  </div>

  <!-- Bento Grid -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 auto-rows-[minmax(160px,auto)]">
    
    <!-- Widget Inbox -->
    <div class="lg:col-span-2 lg:row-span-2 premium-card p-6 md:p-8 rounded-[2.5rem] flex flex-col relative overflow-hidden group">
      <div class="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-full blur-[60px] -mr-24 -mt-24"></div>
      
      <div class="flex items-center justify-between mb-6 md:mb-8 relative z-10">
        <div class="flex items-center gap-3">
          <div class="w-11 h-11 rounded-2xl bg-primary/5 flex items-center justify-center text-primary transition-transform group-hover:scale-105">
            <Papicon icon="inbox" size={22} />
          </div>
          <div>
            <h3 class="font-black text-xl md:text-2xl tracking-tight">Inbox</h3>
            <span class="text-[9px] font-black {notificationsStore.unreadCount > 0 ? 'text-primary' : 'text-on-surface-variant/30'} uppercase tracking-widest">{notificationsStore.unreadCount} en attente</span>
          </div>
        </div>
        <a href="/inbox" class="w-9 h-9 rounded-full bg-surface-container-highest/50 flex items-center justify-center hover:bg-primary hover:text-white transition-all">
           <Papicon icon="arrow-up-right" size={16} />
        </a>
      </div>

      <div class="space-y-3 flex-grow relative z-10">
        {#if unreadNotifs.length > 0}
          {#each unreadNotifs as notif}
            <div class="p-4 rounded-2xl bg-white/30 dark:bg-slate-900/30 border border-outline-variant/10 flex items-center justify-between hover:border-primary/30 hover:bg-white/50 dark:hover:bg-slate-800/50 transition-all">
              <div class="flex items-center gap-4">
                <div class="w-1.5 h-1.5 rounded-full bg-primary"></div>
                <div>
                  <p class="font-bold text-sm leading-tight">{notif.title}</p>
                  <p class="text-[11px] text-on-surface-variant/50 mt-0.5 line-clamp-1">{notif.message}</p>
                </div>
              </div>
              <button 
                onclick={() => handleMarkAsRead(notif.id)}
                class="w-7 h-7 rounded-lg bg-emerald-500/5 text-emerald-600 hover:bg-emerald-500 hover:text-white transition-all flex items-center justify-center"
              >
                <Papicon icon="check" size={12} />
              </button>
            </div>
          {/each}
        {:else}
          <div class="flex flex-col items-center justify-center py-10 text-center opacity-30 group-hover:opacity-60 transition-opacity">
            <div class="w-16 h-16 rounded-full bg-emerald-500/5 flex items-center justify-center text-emerald-500 mb-4">
              <Papicon icon="sparkles" size={32} />
            </div>
            <h4 class="font-black text-sm">Tout est à jour</h4>
          </div>
        {/if}
      </div>

      <div class="mt-6 pt-6 border-t border-outline-variant/5 flex items-center justify-between relative z-10">
        <span class="text-[9px] font-black text-primary/60 uppercase tracking-widest">Activité Récente</span>
        <div class="flex -space-x-1.5">
           {#each Array(3) as _}
             <div class="w-6 h-6 rounded-full border-2 border-surface bg-surface-container-highest shadow-sm"></div>
           {/each}
        </div>
      </div>
    </div>

    <!-- Widget Activité -->
    <div class="lg:col-span-2 lg:row-span-1 premium-card p-6 md:p-8 rounded-[2.5rem] flex flex-col justify-between group">
       <div class="flex items-center justify-between mb-4 relative z-10">
          <div class="flex items-center gap-3">
            <div class="w-11 h-11 rounded-2xl bg-tertiary/5 flex items-center justify-center text-tertiary">
              <Papicon icon="trending-up" size={22} />
            </div>
            <div>
              <h3 class="font-black text-xl tracking-tight">Activité</h3>
              <p class="text-[9px] font-black text-on-surface-variant/30 uppercase tracking-widest">7 derniers jours</p>
            </div>
          </div>
          <div class="text-right">
             <span class="text-2xl font-black tracking-tighter">+{dashboardStore.state.analytics.activityTrend.reduce((a,b)=>a+b, 0)}</span>
             <p class="text-[9px] font-black text-emerald-500 uppercase tracking-widest">+12%</p>
          </div>
       </div>
       
       <div class="h-28 w-full relative z-10">
          <LineChart data={activityData} height={110} labelKey="name" valueKey="value" color="var(--color-tertiary)" />
       </div>
    </div>

    <!-- Bot Status -->
    <div class="premium-card p-7 rounded-[2.5rem] flex flex-col justify-between group bg-surface-container-low/20">
       <div class="flex items-start justify-between">
          <div class="w-9 h-9 rounded-xl bg-secondary/10 flex items-center justify-center text-secondary">
            <Papicon icon="cpu" size={18} />
          </div>
          <span class="text-[9px] font-black text-on-surface-variant/30 uppercase tracking-widest">Status</span>
       </div>
       <div class="mt-6">
          <div class="flex items-baseline gap-1">
            <span class="text-4xl font-black text-on-surface">{activeModulesCount}</span>
            <span class="text-base text-on-surface-variant/30 font-bold">actifs</span>
          </div>
          <div class="mt-4 h-1.5 w-full bg-surface-container-highest/50 rounded-full overflow-hidden">
            <div class="bg-secondary h-full rounded-full transition-all duration-700" style="width: {(activeModulesCount / totalModulesCount) * 100}%"></div>
          </div>
       </div>
    </div>

    <!-- Uptime -->
    <div class="premium-card p-7 rounded-[2.5rem] flex flex-col justify-between group">
       <div class="flex items-start justify-between">
          <div class="w-9 h-9 rounded-xl bg-on-surface/5 flex items-center justify-center text-on-surface">
            <Papicon icon="zap" size={18} />
          </div>
          <span class="text-[9px] font-black text-on-surface-variant/30 uppercase tracking-widest">Santé</span>
       </div>
       <div class="mt-6">
          <span class="text-4xl font-black text-on-surface">99%</span>
          <p class="text-[9px] font-black uppercase tracking-widest mt-1 text-emerald-500">Optimal</p>
       </div>
    </div>

    <!-- Flux Récents -->
    <div class="md:col-span-2 lg:col-span-2 premium-card p-6 md:p-8 rounded-[2.5rem] flex flex-col">
       <div class="flex items-center justify-between mb-6 md:mb-8">
          <div class="flex items-center gap-3">
            <div class="w-11 h-11 rounded-2xl bg-on-surface/5 flex items-center justify-center text-on-surface transition-transform group-hover:rotate-6">
              <Papicon icon="activity" size={22} />
            </div>
            <div>
              <h3 class="font-black text-xl md:text-2xl tracking-tight">Flux Récents</h3>
              <p class="text-[9px] font-black text-on-surface-variant/30 uppercase tracking-widest">Audit</p>
            </div>
          </div>
          <a href="/activity" class="text-[9px] font-black text-primary hover:bg-primary/5 px-3 py-1.5 rounded-xl transition-all uppercase tracking-widest border border-primary/10">Voir tout</a>
       </div>
       
       <div class="space-y-4">
          {#each dashboardStore.state.auditTrail.slice(0, 3) as entry}
            <div class="flex gap-4 items-center">
               <div class="w-9 h-9 rounded-xl bg-surface-container-highest/40 flex items-center justify-center shrink-0">
                  <Papicon icon={entry.module === 'Automatique' ? 'cpu' : 'user'} size={16} />
               </div>
               <div class="flex-grow min-w-0">
                  <div class="flex items-center justify-between">
                     <span class="text-[8px] font-black text-primary/70 uppercase tracking-widest truncate">{entry.module}</span>
                     <span class="text-[8px] font-medium text-on-surface-variant/30 italic">{entry.time || '10m'}</span>
                  </div>
                  <p class="text-[13px] font-bold text-on-surface truncate">{entry.action}</p>
               </div>
            </div>
          {/each}
       </div>
    </div>

    <!-- Snapshot Staff -->
    <div class="md:col-span-2 lg:col-span-2 premium-card p-6 md:p-8 rounded-[2.5rem] flex flex-col relative overflow-hidden">
       <div class="absolute bottom-0 left-0 w-32 h-32 bg-secondary/5 rounded-full blur-[40px] -ml-16 -mb-16"></div>
       
       <div class="flex items-center justify-between mb-6 md:mb-8 relative z-10">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center text-primary">
              <Papicon icon="users" size={18} />
            </div>
            <h3 class="font-black text-xl tracking-tight text-on-surface">Staff</h3>
          </div>
          <div class="flex gap-1.5">
             <div class="px-2.5 py-1 rounded-full bg-primary/5 text-primary text-[8px] font-black uppercase tracking-widest border border-primary/10">{pendingAbsences.length} Abs.</div>
             <div class="px-2.5 py-1 rounded-full bg-secondary/5 text-secondary text-[8px] font-black uppercase tracking-widest border border-secondary/10">{staffStore.upcomingMeetings.length} Réu.</div>
          </div>
       </div>

       <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 relative z-10 mb-6">
          <div class="p-4 rounded-2xl bg-white/20 dark:bg-slate-900/20 border border-outline-variant/10 hover:border-primary/20 transition-all cursor-pointer">
             <span class="text-[8px] font-black text-primary/60 uppercase tracking-widest block mb-2">Absence</span>
             {#if pendingAbsences.length > 0}
               <p class="font-bold text-[13px] truncate">{pendingAbsences[0].staffDisplayName || 'Membre Staff'}</p>
               <p class="text-[10px] text-on-surface-variant/50 mt-0.5 truncate italic">"{pendingAbsences[0].reason || 'N/A'}"</p>
             {:else}
               <p class="text-[11px] text-on-surface-variant/30 italic">Aucune</p>
             {/if}
          </div>
          
          <div class="p-4 rounded-2xl bg-white/20 dark:bg-slate-900/20 border border-outline-variant/10 hover:border-secondary/20 transition-all cursor-pointer">
             <span class="text-[8px] font-black text-secondary/60 uppercase tracking-widest block mb-2">Réunion</span>
             {#if nextMeeting}
               <p class="font-bold text-[13px] truncate">{nextMeeting.title}</p>
               <p class="text-[10px] text-on-surface-variant/50 mt-0.5">
                 {new Date(nextMeeting.scheduledAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} à {new Date(nextMeeting.scheduledAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
               </p>
             {:else}
               <p class="text-[11px] text-on-surface-variant/30 italic">Aucune</p>
             {/if}
          </div>
       </div>

       <a href="/staff-management" class="mt-auto flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-on-surface/5 font-black text-[9px] uppercase tracking-[0.15em] hover:bg-on-surface hover:text-surface transition-all border border-on-surface/5 relative z-10">
          Gérer l'équipe
          <Papicon icon="arrow-right" size={12} />
       </a>
    </div>

  </div>
</div>

<style>
  .premium-card {
    background: rgba(var(--color-surface-container-low), 0.4);
    backdrop-filter: blur(24px);
    border: 1px solid rgba(var(--color-outline-variant), 0.1);
    box-shadow: 0 4px 20px -5px rgba(0, 0, 0, 0.03);
    transition: all 0.4s cubic-bezier(0.2, 1, 0.3, 1);
  }

  .premium-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.1);
    background: rgba(var(--color-surface-container-low), 0.6);
    border-color: rgba(var(--color-primary), 0.15);
  }

  .quick-action-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: rgba(var(--color-surface-container-low), 0.3);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(var(--color-outline-variant), 0.1);
    border-radius: 1rem;
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    transition: all 0.25s ease-out;
  }

  .quick-action-btn:hover {
    background: rgba(var(--color-on-surface), 0.04);
    transform: translateY(-1px);
    border-color: rgba(var(--color-primary), 0.2);
    box-shadow: 0 4px 12px -4px rgba(0,0,0,0.05);
  }

  :global(.dark) .premium-card {
    background: rgba(var(--color-surface-container-low), 0.15);
    border: 1px solid rgba(255, 255, 255, 0.03);
  }

  :global(.dark) .premium-card:hover {
    background: rgba(var(--color-surface-container-low), 0.25);
    border-color: rgba(var(--color-primary), 0.2);
  }
</style>

