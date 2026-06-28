<script lang="ts">
  import { router } from 'tinro';
  import { authStore } from '../lib/stores/auth.svelte';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { notificationsStore } from '../lib/stores/notifications.svelte';
  import { staffStore } from '../lib/stores/staff.svelte';
  import { fetchAnalytics } from '../lib/api';
  import RefreshButton from '../lib/components/RefreshButton.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import LineChart from '../lib/components/LineChart.svelte';
  import BarChart from '../lib/components/BarChart.svelte';
  import MetricCard from '../lib/components/MetricCard.svelte';

  let analyticsData = $state<any>(null);
  let analyticsLoading = $state(false);

  async function loadAnalytics() {
    if (!authStore.selectedGuildId) return;
    analyticsLoading = true;
    try {
      analyticsData = await fetchAnalytics({ period: 7 });
    } catch {
      analyticsData = null;
    } finally {
      analyticsLoading = false;
    }
  }

  $effect(() => {
    if (authStore.selectedGuildId) {
      notificationsStore.fetchNotifications();
      staffStore.fetchAll();
      loadAnalytics();
    }
  });

  const activeModulesCount = $derived(dashboardStore.state.modules.filter(m => m.status === 'active').length);
  const totalModulesCount = $derived(dashboardStore.state.modules.length);
  const errorModulesCount = $derived(dashboardStore.state.modules.filter(m => m.status === 'error').length);
  const errorModules = $derived(dashboardStore.state.modules.filter(m => m.status === 'error'));

  const unreadNotifs = $derived(notificationsStore.items.filter(n => !n.isRead).slice(0, 5));
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
    const parts: string[] = [];
    if (errorModulesCount > 0) parts.push(`${errorModulesCount} module(s) en erreur`);
    if (notificationsStore.unreadCount > 0) parts.push(`${notificationsStore.unreadCount} notification(s)`);
    if (parts.length > 0) return `${parts.join(' · ')} sur ${guildName}.`;
    return `Tout fonctionne correctement sur ${guildName}.`;
  });

  // Chart data from analytics
  let selectedStat = $state('messages');

  $effect(() => {
    if (authStore.selectedGuildId && authStore.user?.id) {
      const saved = localStorage.getItem(`fav_stat_${authStore.selectedGuildId}_${authStore.user.id}`);
      if (saved) selectedStat = saved;
    }
  });

  const handleStatChange = (stat: string) => {
    selectedStat = stat;
    if (authStore.selectedGuildId && authStore.user?.id) {
      localStorage.setItem(`fav_stat_${authStore.selectedGuildId}_${authStore.user.id}`, stat);
    }
  };

  const statConfig = $derived.by(() => {
    const trend = analyticsData?.dailyTrend || [];
    switch (selectedStat) {
      case 'voice':
        return { title: 'Temps Vocal', subtitle: 'Minutes vocales', color: 'var(--color-secondary)', values: trend.map(d => d.voiceMinutes || 0), unit: ' min' };
      case 'joins':
        return { title: 'Arrivées', subtitle: 'Nouveaux membres', color: 'var(--color-primary)', values: trend.map(d => d.membersJoined || 0), unit: '' };
      case 'leaves':
        return { title: 'Départs', subtitle: 'Membres partis', color: 'rgb(239, 68, 68)', values: trend.map(d => d.membersLeft || 0), unit: '' };
      case 'sanctions':
        return { title: 'Sanctions', subtitle: 'Modérations', color: 'rgb(245, 158, 11)', values: trend.map(d => d.sanctions || 0), unit: '' };
      default:
        return { title: 'Messages', subtitle: 'Messages envoyés', color: 'var(--color-tertiary)', values: trend.map(d => d.messages || 0), unit: '' };
    }
  });

  const activityData = $derived(
    (analyticsData?.dailyTrend || []).map((d, i) => ({
      name: formatDateLabel(d.dateKey),
      value: statConfig.values[i] || 0
    }))
  );

  function formatDateLabel(dateKey: string): string {
    try {
      const d = new Date(dateKey + 'T12:00:00Z');
      return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
    } catch {
      return `J-${dateKey}`;
    }
  }

  const statTotal = $derived(statConfig.values.reduce((a, b) => a + b, 0));

  // Live stats from analytics
  const liveStats = $derived(analyticsData?.live || null);
  const totals = $derived(analyticsData?.totals || null);

  // Top channels
  const topChannels = $derived((analyticsData?.topChannels || []).slice(0, 5));

  // Top members
  const topMembers = $derived((analyticsData?.topMessageMembers || []).slice(0, 5));

  // Moderation
  const moderation = $derived(analyticsData?.moderation || null);

  // Health status
  const healthStatus = $derived(dashboardStore.state.analytics.healthStatus ?? 100);
  const healthLabel = $derived(
    healthStatus >= 90 ? 'Optimal' :
    healthStatus >= 70 ? 'Bon' :
    healthStatus >= 50 ? 'Dégradé' : 'Critique'
  );
  const healthColor = $derived(
    healthStatus >= 90 ? 'text-emerald-400' :
    healthStatus >= 70 ? 'text-blue-400' :
    healthStatus >= 50 ? 'text-amber-400' : 'text-red-400'
  );

  const handleMarkAsRead = async (id: string) => {
    await notificationsStore.markAsRead(id);
  };

  const handleRefresh = () => {
    dashboardStore.refresh();
    notificationsStore.fetchNotifications();
    staffStore.fetchAll();
    loadAnalytics();
  };

  function formatNumber(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
    return n.toString();
  }

  function relativeTime(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "à l'instant";
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}j`;
  }
</script>

<div class="space-y-5 pb-10">

  <!-- Header -->
  <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
    <div>
      <h1 class="text-xl font-semibold text-on-surface">{dynamicGreeting}</h1>
      <p class="text-sm text-on-surface-variant mt-0.5">{dynamicSubtitle}</p>
    </div>
    <RefreshButton
      onClick={handleRefresh}
      ariaLabel="Rafraîchir"
      className="rounded-lg! px-3.5! py-2! bg-primary text-white text-sm"
    />
  </div>

  <!-- Error modules alert -->
  {#if errorModulesCount > 0}
    <div class="bg-red-500/10 border border-red-500/20 px-4 py-3 rounded-lg text-red-400 flex items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-md bg-red-500/20 flex items-center justify-center">
          <Papicon icon="alert-octagon" size={16} />
        </div>
        <div>
          <p class="text-sm font-medium">Maintenance requise</p>
          <p class="text-xs opacity-70">{errorModules.map(m => m.name).join(', ')}</p>
        </div>
      </div>
      <button
        onclick={() => router.goto('/module-catalog')}
        class="px-3 py-1.5 text-xs font-medium bg-red-500/20 hover:bg-red-500/30 rounded-md transition-colors"
      >
        Réparer
      </button>
    </div>
  {/if}

  <!-- Live Stats Row -->
  <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
    <MetricCard
      label="Membres"
      value={liveStats ? formatNumber(liveStats.humansCount) : '—'}
      note={liveStats ? `${liveStats.botsCount} bot${liveStats.botsCount > 1 ? 's' : ''}` : ''}
      icon="users"
      toneClass="bg-primary/10 text-primary"
      loading={analyticsLoading}
    />
    <MetricCard
      label="En ligne"
      value={liveStats ? formatNumber(liveStats.onlineMembers + liveStats.idleMembers + liveStats.dndMembers) : '—'}
      note={liveStats ? `${liveStats.onlineMembers} actifs` : ''}
      icon="wifi"
      toneClass="bg-emerald-500/10 text-emerald-400"
      loading={analyticsLoading}
    />
    <MetricCard
      label="En vocal"
      value={liveStats ? String(liveStats.voiceConnected) : '—'}
      note="connectés maintenant"
      icon="headphones"
      toneClass="bg-secondary/10 text-secondary"
      loading={analyticsLoading}
    />
    <MetricCard
      label="Croissance 7j"
      value={totals ? `${totals.netGrowth >= 0 ? '+' : ''}${totals.netGrowth}` : '—'}
      note={totals ? `${totals.joins} arrivées · ${totals.leaves} départs` : ''}
      icon="trending-up"
      toneClass={totals && totals.netGrowth >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}
      loading={analyticsLoading}
    />
  </div>

  <!-- Main Grid: Chart + Health/Modules -->
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">

    <!-- Activity Chart (2 cols) -->
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
          {#if analyticsLoading}
            <div class="h-7 w-16 animate-pulse bg-surface-container-high rounded"></div>
          {:else}
            <span class="text-xl font-semibold text-on-surface">{formatNumber(statTotal)}{statConfig.unit}</span>
            <p class="text-[11px] text-emerald-400">7 derniers jours</p>
          {/if}
        </div>
      </div>
      <div class="h-32 w-full">
        {#if activityData.length > 0}
          <LineChart data={activityData} height={128} labelKey="name" valueKey="value" color={statConfig.color} />
        {:else}
          <div class="h-full flex items-center justify-center text-on-surface-variant/40 text-xs">
            {analyticsLoading ? 'Chargement...' : 'Aucune donnée'}
          </div>
        {/if}
      </div>
    </div>
    {/if}

    <!-- Health + Modules Status (1 col) -->
    <div class="section-card p-5 flex flex-col gap-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-on-surface-variant">
            <Papicon icon="cpu" size={16} />
          </div>
          <h3 class="font-medium text-on-surface">Système</h3>
        </div>
        <button onclick={() => router.goto('/module-catalog')} class="text-xs text-primary hover:underline">Modules</button>
      </div>

      <!-- Health ring -->
      <div class="flex items-center gap-4">
        <div class="relative w-16 h-16 shrink-0">
          <svg class="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" class="text-surface-container-high" stroke-width="4" />
            <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" class={healthColor} stroke-width="4" stroke-linecap="round"
              stroke-dasharray={`${healthStatus * 1.76} 176`} />
          </svg>
          <span class="absolute inset-0 flex items-center justify-center text-sm font-semibold text-on-surface">{healthStatus}%</span>
        </div>
        <div>
          <p class="text-sm font-medium {healthColor}">{healthLabel}</p>
          <p class="text-xs text-on-surface-variant mt-0.5">{activeModulesCount}/{totalModulesCount} modules actifs</p>
          {#if errorModulesCount > 0}
            <p class="text-xs text-red-400 mt-0.5">{errorModulesCount} en erreur</p>
          {/if}
        </div>
      </div>

      <!-- Module automations -->
      <div class="border-t border-outline-variant pt-3">
        <div class="flex items-center justify-between text-xs text-on-surface-variant mb-2">
          <span>Interactions totales</span>
          <span class="font-medium text-on-surface">{formatNumber(dashboardStore.state.analytics.totalAutomations)}</span>
        </div>
        <div class="h-1.5 w-full bg-surface-container-high rounded-full overflow-hidden">
          <div class="bg-secondary h-full rounded-full transition-all duration-500" style="width: {totalModulesCount > 0 ? (activeModulesCount / totalModulesCount) * 100 : 0}%"></div>
        </div>
      </div>
    </div>
  </div>

  <!-- Second Row: Top Channels + Moderation + Top Members -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

    <!-- Top Channels -->
    <div class="section-card p-5 flex flex-col">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2.5">
          <div class="w-7 h-7 rounded-lg bg-tertiary/10 flex items-center justify-center text-tertiary">
            <Papicon icon="hash" size={14} />
          </div>
          <h3 class="text-sm font-medium text-on-surface">Salons actifs</h3>
        </div>
        <span class="text-[10px] text-on-surface-variant">7 jours</span>
      </div>
      <div class="space-y-2 grow">
        {#if analyticsLoading}
          {#each Array(5) as _}
            <div class="h-7 animate-pulse bg-surface-container-high rounded"></div>
          {/each}
        {:else if topChannels.length > 0}
          {#each topChannels as channel, i}
            {@const maxMsgs = topChannels[0]?.messagesCount || 1}
            <div class="flex items-center gap-2.5">
              <span class="text-[10px] text-on-surface-variant w-4 text-right shrink-0">{i + 1}</span>
              <div class="grow min-w-0">
                <div class="flex items-center justify-between gap-2 mb-0.5">
                  <span class="text-xs text-on-surface truncate"># {channel.channelName}</span>
                  <span class="text-[10px] text-on-surface-variant shrink-0">{formatNumber(channel.messagesCount)}</span>
                </div>
                <div class="h-1 w-full bg-surface-container-high rounded-full overflow-hidden">
                  <div class="bg-tertiary/60 h-full rounded-full" style="width: {(channel.messagesCount / maxMsgs) * 100}%"></div>
                </div>
              </div>
            </div>
          {/each}
        {:else}
          <div class="flex items-center justify-center h-full text-xs text-on-surface-variant/40">Aucune donnée</div>
        {/if}
      </div>
    </div>

    <!-- Moderation -->
    <div class="section-card p-5 flex flex-col">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2.5">
          <div class="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
            <Papicon icon="shield" size={14} />
          </div>
          <h3 class="text-sm font-medium text-on-surface">Modération</h3>
        </div>
        <button onclick={() => router.goto('/analytics')} class="text-[10px] text-primary hover:underline">Détails</button>
      </div>
      <div class="space-y-2.5 grow">
        {#if analyticsLoading}
          {#each Array(4) as _}
            <div class="h-6 animate-pulse bg-surface-container-high rounded"></div>
          {/each}
        {:else if moderation}
          <div class="grid grid-cols-2 gap-2">
            <div class="px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/10">
              <p class="text-lg font-semibold text-on-surface">{moderation.totals.warns}</p>
              <p class="text-[10px] text-on-surface-variant">Warns</p>
            </div>
            <div class="px-3 py-2 rounded-lg bg-orange-500/5 border border-orange-500/10">
              <p class="text-lg font-semibold text-on-surface">{moderation.totals.timeouts}</p>
              <p class="text-[10px] text-on-surface-variant">Timeouts</p>
            </div>
            <div class="px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/10">
              <p class="text-lg font-semibold text-on-surface">{moderation.totals.kicks}</p>
              <p class="text-[10px] text-on-surface-variant">Kicks</p>
            </div>
            <div class="px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/10">
              <p class="text-lg font-semibold text-on-surface">{moderation.totals.bans}</p>
              <p class="text-[10px] text-on-surface-variant">Bans</p>
            </div>
          </div>
          {#if moderation.activeSanctions > 0}
            <p class="text-[11px] text-amber-400 mt-1">{moderation.activeSanctions} sanction(s) active(s)</p>
          {/if}
        {:else}
          <div class="flex items-center justify-center h-full text-xs text-on-surface-variant/40">Aucune donnée</div>
        {/if}
      </div>
    </div>

    <!-- Top Members -->
    <div class="section-card p-5 flex flex-col">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2.5">
          <div class="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Papicon icon="award" size={14} />
          </div>
          <h3 class="text-sm font-medium text-on-surface">Top Membres</h3>
        </div>
        <span class="text-[10px] text-on-surface-variant">7 jours</span>
      </div>
      <div class="space-y-2 grow">
        {#if analyticsLoading}
          {#each Array(5) as _}
            <div class="h-7 animate-pulse bg-surface-container-high rounded"></div>
          {/each}
        {:else if topMembers.length > 0}
          {#each topMembers as member, i}
            <div class="flex items-center gap-2.5">
              <span class="text-[10px] font-medium {i === 0 ? 'text-amber-400' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-400' : 'text-on-surface-variant'} w-4 text-right shrink-0">{i + 1}</span>
              {#if member.avatarUrl}
                <img src={member.avatarUrl} alt="" class="w-6 h-6 rounded-full shrink-0" />
              {:else}
                <div class="w-6 h-6 rounded-full bg-surface-container-high shrink-0 flex items-center justify-center">
                  <Papicon icon="user" size={12} class="text-on-surface-variant" />
                </div>
              {/if}
              <div class="grow min-w-0 flex items-center justify-between gap-2">
                <span class="text-xs text-on-surface truncate">{member.name}</span>
                <span class="text-[10px] text-on-surface-variant shrink-0">{formatNumber(member.messageCount)} msg</span>
              </div>
            </div>
          {/each}
        {:else}
          <div class="flex items-center justify-center h-full text-xs text-on-surface-variant/40">Aucune donnée</div>
        {/if}
      </div>
    </div>
  </div>

  <!-- Third Row: Notifications + Staff + Audit Trail -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

    <!-- Notifications -->
    <div class="section-card p-5 flex flex-col">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2.5">
          <div class="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Papicon icon="inbox" size={14} />
          </div>
          <div>
            <h3 class="text-sm font-medium text-on-surface">Notifications</h3>
            <span class="text-[10px] text-on-surface-variant">{notificationsStore.unreadCount} non lue(s)</span>
          </div>
        </div>
        <a href="/inbox" class="w-6 h-6 rounded-md bg-surface-container flex items-center justify-center hover:bg-surface-container-high transition-colors text-on-surface-variant">
          <Papicon icon="arrow-up-right" size={12} />
        </a>
      </div>
      <div class="space-y-1.5 grow">
        {#if unreadNotifs.length > 0}
          {#each unreadNotifs as notif}
            <div class="px-2.5 py-2 rounded-lg border border-outline-variant bg-surface-container-low flex items-center justify-between gap-2 hover:border-primary/30 transition-colors">
              <div class="flex items-center gap-2 min-w-0">
                <div class="w-1.5 h-1.5 rounded-full {notif.type === 'ERROR' ? 'bg-red-400' : notif.type === 'WARNING' ? 'bg-amber-400' : 'bg-primary'} shrink-0"></div>
                <div class="min-w-0">
                  <p class="text-xs font-medium leading-tight truncate">{notif.title}</p>
                  <p class="text-[10px] text-on-surface-variant mt-0.5 line-clamp-1">{notif.message}</p>
                </div>
              </div>
              <button
                onclick={() => handleMarkAsRead(notif.id)}
                class="w-5 h-5 rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors flex items-center justify-center shrink-0"
              >
                <Papicon icon="check" size={10} />
              </button>
            </div>
          {/each}
        {:else}
          <div class="flex flex-col items-center justify-center py-6 text-center text-on-surface-variant/40">
            <Papicon icon="check-circle" size={18} class="mb-1 text-emerald-500/50" />
            <p class="text-[11px]">Tout est à jour</p>
          </div>
        {/if}
      </div>
    </div>

    <!-- Staff -->
    <div class="section-card p-5 flex flex-col">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2.5">
          <div class="w-7 h-7 rounded-lg bg-secondary/10 flex items-center justify-center text-secondary">
            <Papicon icon="users" size={14} />
          </div>
          <h3 class="text-sm font-medium text-on-surface">Staff</h3>
        </div>
        <div class="flex gap-1.5">
          <span class="px-1.5 py-0.5 text-[10px] rounded bg-amber-500/10 text-amber-400">{pendingAbsences.length} abs.</span>
          <span class="px-1.5 py-0.5 text-[10px] rounded bg-surface-container text-on-surface-variant">{staffStore.upcomingMeetings.length} réu.</span>
        </div>
      </div>

      <div class="space-y-2.5 grow">
        <!-- Next absence -->
        <div class="p-2.5 rounded-lg border border-outline-variant bg-surface-container-low">
          <span class="text-[10px] text-primary block mb-1">Prochaine absence</span>
          {#if pendingAbsences.length > 0}
            <p class="text-xs font-medium truncate">{pendingAbsences[0].staffDisplayName || 'Membre Staff'}</p>
            <p class="text-[10px] text-on-surface-variant mt-0.5 truncate">{pendingAbsences[0].reason || 'N/A'}</p>
          {:else}
            <p class="text-[11px] text-on-surface-variant/50">Aucune</p>
          {/if}
        </div>

        <!-- Next meeting -->
        <div class="p-2.5 rounded-lg border border-outline-variant bg-surface-container-low">
          <span class="text-[10px] text-secondary block mb-1">Prochaine réunion</span>
          {#if nextMeeting}
            <p class="text-xs font-medium truncate">{nextMeeting.title}</p>
            <p class="text-[10px] text-on-surface-variant mt-0.5">
              {new Date(nextMeeting.scheduledAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} à {new Date(nextMeeting.scheduledAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </p>
          {:else}
            <p class="text-[11px] text-on-surface-variant/50">Aucune</p>
          {/if}
        </div>
      </div>

      <a href="/staff-management" class="mt-3 flex items-center justify-center gap-1.5 w-full py-2 rounded-lg bg-surface-container text-xs text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors border border-outline-variant">
        Gérer l'équipe <Papicon icon="arrow-right" size={12} />
      </a>
    </div>

    <!-- Audit Trail -->
    <div class="section-card p-5 flex flex-col">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2.5">
          <div class="w-7 h-7 rounded-lg bg-surface-container flex items-center justify-center text-on-surface-variant">
            <Papicon icon="activity" size={14} />
          </div>
          <h3 class="text-sm font-medium text-on-surface">Activité récente</h3>
        </div>
        <a href="/activity" class="text-[10px] text-primary hover:underline">Tout voir</a>
      </div>
      <div class="space-y-2 grow">
        {#each dashboardStore.state.auditTrail.slice(0, 5) as entry}
          <div class="flex gap-2 items-start">
            <div class="w-6 h-6 rounded bg-surface-container flex items-center justify-center shrink-0 mt-0.5">
              <Papicon icon={entry.source === 'discord' ? 'message-circle' : entry.user === 'Automatique' ? 'cpu' : 'user'} size={11} class="text-on-surface-variant" />
            </div>
            <div class="grow min-w-0">
              <div class="flex items-center justify-between gap-2">
                <span class="text-[10px] text-primary truncate">{entry.module}</span>
                <span class="text-[9px] text-on-surface-variant shrink-0">{entry.dateIso ? relativeTime(entry.dateIso) : entry.time || ''}</span>
              </div>
              <p class="text-[11px] text-on-surface truncate">{@html entry.action}</p>
            </div>
          </div>
        {:else}
          <div class="flex items-center justify-center h-full text-xs text-on-surface-variant/40">Aucune activité</div>
        {/each}
      </div>
    </div>
  </div>

  <!-- Quick Actions -->
  <div class="flex flex-wrap gap-2 items-center">
    <span class="text-[10px] text-on-surface-variant mr-1">Raccourcis :</span>
    <button onclick={() => router.goto('/planning')} class="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-surface-container border border-outline-variant rounded-md text-xs text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors">
      <Papicon icon="calendar-plus" size={12} class="text-primary" /> Absence
    </button>
    <button onclick={() => router.goto('/planning')} class="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-surface-container border border-outline-variant rounded-md text-xs text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors">
      <Papicon icon="video" size={12} class="text-secondary" /> Réunion
    </button>
    <button onclick={() => router.goto('/module-catalog')} class="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-surface-container border border-outline-variant rounded-md text-xs text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors">
      <Papicon icon="plus-circle" size={12} class="text-tertiary" /> Module
    </button>
    <button onclick={() => router.goto('/analytics')} class="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-surface-container border border-outline-variant rounded-md text-xs text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors">
      <Papicon icon="bar-chart-2" size={12} class="text-amber-400" /> Analytics
    </button>
    <button onclick={() => router.goto('/staff-management')} class="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-surface-container border border-outline-variant rounded-md text-xs text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors">
      <Papicon icon="users" size={12} class="text-emerald-400" /> Staff
    </button>
  </div>
</div>
