<script lang="ts">
  import { router } from 'tinro';
  import { authStore } from '../lib/stores/auth.svelte';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { notificationsStore } from '../lib/stores/notifications.svelte';
  import { staffStore } from '../lib/stores/staff.svelte';
  import RefreshButton from '../lib/components/RefreshButton.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
    import LineChart from '../lib/components/LineChart.svelte';
    import MetricCard from '../lib/components/MetricCard.svelte';
    import ActionButton from '../lib/components/ActionButton.svelte';


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

  const dynamicGreeting = $derived.by(() => {
    const user = authStore.user?.username || 'Gérant';
    const hour = new Date().getHours();
    if (hour >= 18) return `Bonsoir, ${user}`;
    if (hour >= 12) return `Bon après-midi, ${user}`;
    return `Bonjour, ${user}`;
  });

  const dynamicSubtitle = $derived.by(() => {
    const guildName = dashboardStore.state.guildName || 'votre serveur';
    if (errorModulesCount > 0) {
      return `${errorModulesCount} module(s) requièrent votre intervention sur ${guildName}.`;
    }
    if (notificationsStore.unreadCount > 0) {
      return `${notificationsStore.unreadCount} notification(s) en attente sur ${guildName}.`;
    }
    return `Tout fonctionne correctement sur ${guildName}.`;
  });

  let selectedStat = $state('messages');

  $effect(() => {
    if (authStore.selectedGuildId && authStore.user?.id) {
      const saved = localStorage.getItem(`fav_stat_${authStore.selectedGuildId}_${authStore.user.id}`);
      if (saved) {
        selectedStat = saved;
      }
    }
  });

  const handleStatChange = (stat: string) => {
    selectedStat = stat;
    if (authStore.selectedGuildId && authStore.user?.id) {
      localStorage.setItem(`fav_stat_${authStore.selectedGuildId}_${authStore.user.id}`, stat);
    }
  };

  const statConfig = $derived.by(() => {
    switch (selectedStat) {
      case 'voice':
        return {
          title: 'Temps Vocal',
          subtitle: 'Minutes vocales cumulées',
          color: 'var(--color-secondary)',
          trend: dashboardStore.state.analytics.voiceTrend || [0, 0, 0, 0, 0, 0, 0],
          unit: ' min'
        };
      case 'joins':
        return {
          title: 'Arrivées',
          subtitle: 'Nouveaux membres',
          color: 'var(--color-primary)',
          trend: dashboardStore.state.analytics.joinsTrend || [0, 0, 0, 0, 0, 0, 0],
          unit: ''
        };
      case 'leaves':
        return {
          title: 'Départs',
          subtitle: 'Membres ayant quitté',
          color: 'rgb(239, 68, 68)',
          trend: dashboardStore.state.analytics.leavesTrend || [0, 0, 0, 0, 0, 0, 0],
          unit: ''
        };
      case 'sanctions':
        return {
          title: 'Sanctions',
          subtitle: 'Modérations appliquées',
          color: 'rgb(245, 158, 11)',
          trend: dashboardStore.state.analytics.sanctionsTrend || [0, 0, 0, 0, 0, 0, 0],
          unit: ''
        };
      case 'messages':
      default:
        return {
          title: 'Messages',
          subtitle: 'Messages envoyés',
          color: 'var(--color-tertiary)',
          trend: dashboardStore.state.analytics.messagesTrend || [0, 0, 0, 0, 0, 0, 0],
          unit: ''
        };
    }
  });

  const activityData = $derived(statConfig.trend.map((v, i) => ({
    name: `J-${6-i}`,
    value: v
  })));

  const handleMarkAsRead = async (id: string) => {
    await notificationsStore.markAsRead(id);
  };
</script>

<div class="space-y-6 pb-10">

  <!-- Header -->
  <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
    <div>
      <h1 class="text-xl font-semibold text-on-surface">{dynamicGreeting}</h1>
      <p class="text-sm text-on-surface-variant mt-0.5">{dynamicSubtitle}</p>
    </div>
    <RefreshButton
      onClick={() => {
        dashboardStore.refresh();
        notificationsStore.fetchNotifications();
      }}
      ariaLabel="Rafraîchir"
      className="rounded-lg! px-3.5! py-2! bg-primary text-white text-sm"
    />
  </div>

  <!-- Error alert -->
  {#if errorModulesCount > 0}
    <div class="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 rounded-lg text-red-700 dark:text-red-400 flex items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-md bg-red-100 dark:bg-red-500/20 flex items-center justify-center">
          <Papicon icon="alert-octagon" size={16} />
        </div>
        <div>
          <p class="text-sm font-medium">Maintenance requise</p>
          <p class="text-xs opacity-70">{errorModulesCount} module(s) nécessitent votre attention.</p>
        </div>
      </div>
      <ActionButton
        label="Réparer"
        variant="danger"
        size="sm"
        onClick={() => router.goto('/module-catalog')}
      />
    </div>
  {/if}

  <!-- Quick actions -->
  <div class="flex flex-wrap gap-2 items-center">
    <span class="text-xs text-on-surface-variant mr-1">Raccourcis :</span>
    <button onclick={() => router.goto('/planning')} class="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-surface-container border border-outline-variant rounded-md text-xs text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors">
       <Papicon icon="calendar-plus" size={13} class="text-primary" />
       Absence
    </button>
    <button onclick={() => router.goto('/planning')} class="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-surface-container border border-outline-variant rounded-md text-xs text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors">
       <Papicon icon="video" size={13} class="text-secondary" />
       Réunion
    </button>
    <button onclick={() => router.goto('/module-catalog')} class="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-surface-container border border-outline-variant rounded-md text-xs text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors">
       <Papicon icon="plus-circle" size={13} class="text-tertiary" />
       Module
    </button>
  </div>

  <!-- Grid -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

    <!-- Inbox widget -->
    <div class="{unreadNotifs.length > 0 ? 'lg:col-span-2 lg:row-span-2' : 'lg:col-span-1'} section-card p-5 flex flex-col">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Papicon icon="inbox" size={16} />
          </div>
          <div>
            <h3 class="font-medium text-on-surface">Inbox</h3>
            <span class="text-[11px] text-on-surface-variant">{notificationsStore.unreadCount} en attente</span>
          </div>
        </div>
        <a href="/inbox" class="w-7 h-7 rounded-md bg-surface-container flex items-center justify-center hover:bg-surface-container-high transition-colors text-on-surface-variant">
           <Papicon icon="arrow-up-right" size={14} />
        </a>
      </div>

      <div class="space-y-2 grow">
        {#if unreadNotifs.length > 0}
          {#each unreadNotifs as notif}
            <div class="px-3 py-2.5 rounded-lg border border-outline-variant bg-surface-container-low flex items-center justify-between hover:border-primary/30 transition-colors">
              <div class="flex items-center gap-3 min-w-0">
                <div class="w-1.5 h-1.5 rounded-full bg-primary shrink-0"></div>
                <div class="min-w-0">
                  <p class="text-sm font-medium leading-tight truncate">{notif.title}</p>
                  <p class="text-[11px] text-on-surface-variant mt-0.5 line-clamp-1">{notif.message}</p>
                </div>
              </div>
              <button
                onclick={() => handleMarkAsRead(notif.id)}
                class="w-6 h-6 rounded-md bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors flex items-center justify-center shrink-0 ml-2"
              >
                <Papicon icon="check" size={12} />
              </button>
            </div>
          {/each}
        {:else}
          <div class="flex flex-col items-center justify-center py-4 text-center text-on-surface-variant/40">
            <Papicon icon="check-circle" size={20} class="mb-1.5 text-emerald-500/50" />
            <p class="text-xs">Tout est à jour</p>
          </div>
        {/if}
      </div>
    </div>

    <!-- Activity chart widget -->
    {#if dashboardStore.state.featureAccess.analytics?.canView}
    <div class="lg:col-span-2 section-card p-5 flex flex-col">
       <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-tertiary/10 flex items-center justify-center text-tertiary">
              <Papicon icon="trending-up" size={16} />
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h3 class="font-medium text-on-surface">{statConfig.title}</h3>
                <select
                  value={selectedStat}
                  onchange={(e) => handleStatChange(e.currentTarget.value)}
                  class="bg-surface-container text-[11px] text-on-surface-variant border border-outline-variant rounded-md px-1.5 py-0.5 outline-none cursor-pointer"
                >
                  <option value="messages">Messages</option>
                  <option value="voice">Vocal</option>
                  <option value="joins">Arrivées</option>
                  <option value="leaves">Départs</option>
                  <option value="sanctions">Sanctions</option>
                </select>
              </div>
              <p class="text-[11px] text-on-surface-variant">{statConfig.subtitle}</p>
            </div>
          </div>
          <div class="text-right">
             <span class="text-xl font-semibold text-on-surface">+{statConfig.trend.reduce((a,b)=>a+b, 0)}{statConfig.unit}</span>
             <p class="text-[11px] text-emerald-600 dark:text-emerald-400">7 derniers jours</p>
          </div>
       </div>

       <div class="h-28 w-full">
          <LineChart data={activityData} height={110} labelKey="name" valueKey="value" color={statConfig.color} />
       </div>
    </div>
    {/if}

    <!-- Bot status -->
    <div class="section-card p-5 flex flex-col justify-between">
       <div class="flex items-start justify-between">
          <div class="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center text-secondary">
            <Papicon icon="cpu" size={16} />
          </div>
          <span class="text-[11px] text-on-surface-variant">Status</span>
       </div>
       <div class="mt-4">
          <div class="flex items-baseline gap-1">
            <span class="text-3xl font-semibold text-on-surface">{activeModulesCount}</span>
            <span class="text-sm text-on-surface-variant">actifs</span>
          </div>
          <div class="mt-3 h-1.5 w-full bg-surface-container-high rounded-full overflow-hidden">
            <div class="bg-secondary h-full rounded-full transition-all duration-500" style="width: {totalModulesCount > 0 ? (activeModulesCount / totalModulesCount) * 100 : 0}%"></div>
          </div>
       </div>
    </div>

    <!-- Uptime -->
    <div class="section-card p-5 flex flex-col justify-between">
       <div class="flex items-start justify-between">
          <div class="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-on-surface-variant">
            <Papicon icon="zap" size={16} />
          </div>
          <span class="text-[11px] text-on-surface-variant">Santé</span>
       </div>
       <div class="mt-4">
          <span class="text-3xl font-semibold text-on-surface">99%</span>
          <p class="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">Optimal</p>
       </div>
    </div>

    <!-- Recent activity -->
    <div class="md:col-span-2 section-card p-5 flex flex-col">
       <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-on-surface-variant">
              <Papicon icon="activity" size={16} />
            </div>
            <div>
              <h3 class="font-medium text-on-surface">Flux Récents</h3>
              <p class="text-[11px] text-on-surface-variant">Audit</p>
            </div>
          </div>
          <a href="/activity" class="text-xs text-primary hover:underline">Voir tout</a>
       </div>

       <div class="space-y-3">
          {#each dashboardStore.state.auditTrail.slice(0, 3) as entry}
            <div class="flex gap-3 items-center">
               <div class="w-7 h-7 rounded-md bg-surface-container flex items-center justify-center shrink-0">
                  <Papicon icon={entry.module === 'Automatique' ? 'cpu' : 'user'} size={14} class="text-on-surface-variant" />
               </div>
               <div class="grow min-w-0">
                  <div class="flex items-center justify-between gap-2">
                     <span class="text-[11px] text-primary truncate">{entry.module}</span>
                     <span class="text-[10px] text-on-surface-variant shrink-0">{entry.time || '10m'}</span>
                  </div>
                  <p class="text-sm text-on-surface truncate">{@html entry.action}</p>
               </div>
            </div>
          {/each}
       </div>
    </div>

    <!-- Staff snapshot -->
    <div class="md:col-span-2 section-card p-5 flex flex-col">
       <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Papicon icon="users" size={16} />
            </div>
            <h3 class="font-medium text-on-surface">Staff</h3>
          </div>
          <div class="flex gap-1.5">
             <span class="badge badge-info">{pendingAbsences.length} Abs.</span>
             <span class="badge badge-neutral">{staffStore.upcomingMeetings.length} Réu.</span>
          </div>
       </div>

       <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div class="p-3 rounded-lg border border-outline-variant bg-surface-container-low">
             <span class="text-[11px] text-primary block mb-1.5">Prochaine absence</span>
             {#if pendingAbsences.length > 0}
               <p class="text-sm font-medium truncate">{pendingAbsences[0].staffDisplayName || 'Membre Staff'}</p>
               <p class="text-[11px] text-on-surface-variant mt-0.5 truncate">{pendingAbsences[0].reason || 'N/A'}</p>
             {:else}
               <p class="text-xs text-on-surface-variant/50">Aucune</p>
             {/if}
          </div>

          <div class="p-3 rounded-lg border border-outline-variant bg-surface-container-low">
             <span class="text-[11px] text-secondary block mb-1.5">Prochaine réunion</span>
             {#if nextMeeting}
               <p class="text-sm font-medium truncate">{nextMeeting.title}</p>
               <p class="text-[11px] text-on-surface-variant mt-0.5">
                 {new Date(nextMeeting.scheduledAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} à {new Date(nextMeeting.scheduledAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
               </p>
             {:else}
               <p class="text-xs text-on-surface-variant/50">Aucune</p>
             {/if}
          </div>
       </div>

       <a href="/staff-management" class="mt-auto flex items-center justify-center gap-1.5 w-full py-2 rounded-lg bg-surface-container text-sm text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors border border-outline-variant">
          Gérer l'équipe
          <Papicon icon="arrow-right" size={13} />
       </a>
    </div>

  </div>
</div>
