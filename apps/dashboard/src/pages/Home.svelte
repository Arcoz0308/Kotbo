<script lang="ts">
  import { authStore } from '../lib/stores/auth.svelte';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { notificationsStore } from '../lib/stores/notifications.svelte';
  import { staffStore } from '../lib/stores/staff.svelte';
  import { fetchAnalytics } from '../lib/api';
  import RefreshButton from '../lib/components/RefreshButton.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import LineChart from '../lib/components/LineChart.svelte';
  import MetricCard from '../lib/components/MetricCard.svelte';

  // ── Données ──────────────────────────────────────────────

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

  const handleRefresh = () => {
    dashboardStore.refresh();
    notificationsStore.fetchNotifications();
    staffStore.fetchAll();
    loadAnalytics();
  };

  // ── Accès ────────────────────────────────────────────────

  const currentGuild = $derived(
    authStore.guilds.find((g) => g.id === authStore.selectedGuildId),
  );
  const isAdmin = $derived(currentGuild?.accessLevel === 'admin');
  const isStaff = $derived(!!authStore.member);
  const featureAccess = $derived(dashboardStore.state.featureAccess ?? {});

  const canViewFeature = (featureKey?: string): boolean => {
    if (!featureKey) return true;
    const feature = (featureAccess as Record<string, any>)[featureKey];
    if (feature?.canView !== undefined) return feature.canView;
    return currentGuild?.accessLevel !== 'none';
  };

  // ── Statut & salutation ──────────────────────────────────

  const errorModules = $derived(dashboardStore.state.modules.filter((m: any) => m.status === 'error'));

  const greeting = $derived.by(() => {
    const user = authStore.user?.username || 'Gérant';
    const hour = new Date().getHours();
    if (hour >= 18) return `Bonsoir, ${user}`;
    if (hour >= 12) return `Bon après-midi, ${user}`;
    return `Bonjour, ${user}`;
  });

  const allClear = $derived(
    errorModules.length === 0 &&
    notificationsStore.unreadCount === 0 &&
    staffStore.pendingAbsences.length === 0,
  );

  // ── File d'attention « À traiter » ───────────────────────

  interface AttentionItem {
    id: string;
    icon: string;
    label: string;
    detail: string;
    href: string;
    tone: 'danger' | 'warning' | 'info';
  }

  const nextMeeting = $derived(staffStore.upcomingMeetings[0]);

  const meetingSoon = $derived.by(() => {
    if (!nextMeeting) return false;
    const delta = new Date(nextMeeting.scheduledAt).getTime() - Date.now();
    return delta > 0 && delta < 48 * 3600 * 1000;
  });

  function formatMeetingTime(iso: string): string {
    const d = new Date(iso);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (isToday) return `aujourd'hui à ${time}`;
    return d.toLocaleDateString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' });
  }

  const attentionItems = $derived.by((): AttentionItem[] => {
    const items: AttentionItem[] = [];

    if (errorModules.length > 0) {
      items.push({
        id: 'modules',
        icon: 'alert-octagon',
        label: `${errorModules.length} module${errorModules.length > 1 ? 's' : ''} en erreur`,
        detail: errorModules.map((m: any) => m.name).slice(0, 3).join(', '),
        href: '/modules',
        tone: 'danger',
      });
    }

    if (notificationsStore.unreadCount > 0) {
      items.push({
        id: 'inbox',
        icon: 'inbox',
        label: `${notificationsStore.unreadCount} notification${notificationsStore.unreadCount > 1 ? 's' : ''}`,
        detail: 'Non lues dans votre boîte de réception',
        href: '/inbox',
        tone: 'info',
      });
    }

    if ((isAdmin || isStaff) && staffStore.pendingAbsences.length > 0) {
      items.push({
        id: 'absences',
        icon: 'calendar',
        label: `${staffStore.pendingAbsences.length} absence${staffStore.pendingAbsences.length > 1 ? 's' : ''} à valider`,
        detail: 'Demandes en attente de décision',
        href: '/planning',
        tone: 'warning',
      });
    }

    if ((isAdmin || isStaff) && meetingSoon && nextMeeting) {
      items.push({
        id: 'meeting',
        icon: 'users',
        label: 'Réunion à venir',
        detail: `${nextMeeting.title || 'Réunion staff'} — ${formatMeetingTime(nextMeeting.scheduledAt)}`,
        href: '/meetings',
        tone: 'info',
      });
    }

    return items;
  });

  const TONE_STYLES: Record<AttentionItem['tone'], { chip: string; ring: string }> = {
    danger:  { chip: 'bg-red-500/10 text-red-500 dark:text-red-400',       ring: 'hover:border-red-300 dark:hover:border-red-500/40' },
    warning: { chip: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', ring: 'hover:border-amber-300 dark:hover:border-amber-500/40' },
    info:    { chip: 'bg-primary/10 text-primary',                          ring: 'hover:border-primary/40' },
  };

  // ── KPIs & graphique ─────────────────────────────────────

  const liveStats = $derived(analyticsData?.live || null);
  const totals = $derived(analyticsData?.totals || null);
  const topChannels = $derived((analyticsData?.topChannels || []).slice(0, 5));
  const maxChannelMessages = $derived(
    Math.max(1, ...topChannels.map((c: any) => c.messagesCount || 0)),
  );

  const STAT_OPTIONS = [
    { id: 'messages',  label: 'Messages'  },
    { id: 'voice',     label: 'Vocal'     },
    { id: 'joins',     label: 'Arrivées'  },
    { id: 'leaves',    label: 'Départs'   },
    { id: 'sanctions', label: 'Sanctions' },
  ];

  let selectedStat = $state('messages');

  $effect(() => {
    if (authStore.selectedGuildId && authStore.user?.id) {
      const saved = localStorage.getItem(`fav_stat_${authStore.selectedGuildId}_${authStore.user.id}`);
      if (saved && STAT_OPTIONS.some((s) => s.id === saved)) selectedStat = saved;
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
        return { color: 'var(--color-secondary)', values: trend.map((d: any) => d.voiceMinutes || 0), unit: ' min' };
      case 'joins':
        return { color: 'var(--color-primary)', values: trend.map((d: any) => d.membersJoined || 0), unit: '' };
      case 'leaves':
        return { color: 'rgb(239, 68, 68)', values: trend.map((d: any) => d.membersLeft || 0), unit: '' };
      case 'sanctions':
        return { color: 'rgb(245, 158, 11)', values: trend.map((d: any) => d.sanctions || 0), unit: '' };
      default:
        return { color: 'var(--color-tertiary)', values: trend.map((d: any) => d.messages || 0), unit: '' };
    }
  });

  function formatDateLabel(dateKey: string): string {
    try {
      const d = new Date(dateKey + 'T12:00:00Z');
      return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
    } catch {
      return dateKey;
    }
  }

  const activityData = $derived(
    (analyticsData?.dailyTrend || []).map((d: any, i: number) => ({
      name: formatDateLabel(d.dateKey),
      value: statConfig.values[i] || 0,
    })),
  );

  const statTotal = $derived(statConfig.values.reduce((a: number, b: number) => a + b, 0));

  function formatNumber(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
    return String(n);
  }

  // ── Actions rapides ──────────────────────────────────────

  interface QuickAction {
    icon: string;
    label: string;
    href: string;
    featureKey?: string;
    adminOnly?: boolean;
  }

  const QUICK_ACTIONS: QuickAction[] = [
    { icon: 'megaphone',      label: 'Annonce',    href: '/announcement', featureKey: 'welcome_goodbye' },
    { icon: 'sparkles',       label: 'Giveaway',   href: '/giveaways',    featureKey: 'giveaways' },
    { icon: 'users',          label: 'Membres',    href: '/members',      featureKey: 'members' },
    { icon: 'alert-triangle', label: 'Sanctions',  href: '/sanctions',    featureKey: 'sanctions' },
    { icon: 'package',        label: 'Modules',    href: '/modules',      featureKey: 'modules', adminOnly: true },
    { icon: 'settings',       label: 'Paramètres', href: '/settings',     featureKey: 'settings', adminOnly: true },
  ];

  const visibleActions = $derived(
    QUICK_ACTIONS.filter((a) => (!a.adminOnly || isAdmin) && canViewFeature(a.featureKey)),
  );
</script>

<div class="space-y-8 pb-10">

  <!-- ── En-tête : salutation + statut ─────────────────── -->
  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
    <div class="min-w-0">
      <h1 class="text-2xl font-semibold tracking-tight text-on-surface">{greeting}</h1>
      <div class="flex items-center gap-2 mt-1.5">
        {#if dashboardStore.state.error === 'api_unreachable'}
          <span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse" aria-hidden="true"></span>
          <p class="text-sm text-on-surface-variant">Reconnexion à l'API en cours…</p>
        {:else if allClear}
          <span class="w-2 h-2 rounded-full bg-emerald-500" aria-hidden="true"></span>
          <p class="text-sm text-on-surface-variant">
            Tout fonctionne sur <span class="font-medium text-on-surface">{dashboardStore.state.guildName}</span>.
          </p>
        {:else}
          <span class="w-2 h-2 rounded-full bg-amber-500" aria-hidden="true"></span>
          <p class="text-sm text-on-surface-variant">
            {attentionItems.length} élément{attentionItems.length > 1 ? 's' : ''} demande{attentionItems.length > 1 ? 'nt' : ''} votre attention.
          </p>
        {/if}
      </div>
    </div>

    <div class="flex items-center gap-2 shrink-0">
      <a
        href="/overview"
        title="Vue personnalisée (widgets)"
        class="pressable flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium text-on-surface-variant bg-surface-container-lowest border border-outline-variant hover:text-on-surface hover:bg-surface-container transition-colors"
      >
        <Papicon icon="layout" size={15} />
        <span class="hidden md:inline">Personnaliser</span>
      </a>
      <RefreshButton
        onClick={handleRefresh}
        ariaLabel="Rafraîchir"
        className="rounded-lg! px-3.5! py-2! bg-primary text-white text-sm"
      />
    </div>
  </div>

  <!-- ── À traiter ──────────────────────────────────────── -->
  <section aria-label="À traiter">
    <h2 class="section-label mb-3">À traiter</h2>

    {#if attentionItems.length === 0}
      <div class="flex items-center gap-3 px-4 py-3.5 rounded-xl border border-outline-variant bg-surface-container-lowest">
        <div class="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
          <Papicon icon="check" size={16} />
        </div>
        <p class="text-sm text-on-surface-variant">Tout est à jour. Rien ne demande votre attention.</p>
      </div>
    {:else}
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {#each attentionItems as item (item.id)}
          <a
            href={item.href}
            class="pressable group flex items-center gap-3.5 px-4 py-3.5 rounded-xl border border-outline-variant bg-surface-container-lowest transition-colors {TONE_STYLES[item.tone].ring}"
          >
            <div class="w-9 h-9 rounded-lg {TONE_STYLES[item.tone].chip} flex items-center justify-center shrink-0">
              <Papicon icon={item.icon} size={17} />
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-on-surface truncate">{item.label}</p>
              <p class="text-xs text-on-surface-variant truncate mt-0.5">{item.detail}</p>
            </div>
            <div class="text-on-surface-variant/40 group-hover:text-on-surface-variant group-hover:translate-x-0.5 transition-all shrink-0">
              <Papicon icon="chevron-right" size={15} />
            </div>
          </a>
        {/each}
      </div>
    {/if}
  </section>

  <!-- ── Métriques clés ─────────────────────────────────── -->
  <section aria-label="Métriques clés">
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
        toneClass="bg-emerald-500/10 text-emerald-500"
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
        toneClass={totals && totals.netGrowth >= 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-400'}
        loading={analyticsLoading}
      />
    </div>
  </section>

  <!-- ── Activité + Salons actifs ───────────────────────── -->
  <section aria-label="Activité du serveur" class="grid grid-cols-1 lg:grid-cols-3 gap-4">

    {#if canViewFeature('analytics')}
      <div class="section-card p-5 lg:col-span-2 flex flex-col">
        <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div class="tab-group" role="tablist" aria-label="Type de statistique">
            {#each STAT_OPTIONS as option (option.id)}
              <button
                type="button"
                role="tab"
                aria-selected={selectedStat === option.id}
                class="tab-button {selectedStat === option.id ? 'active' : ''}"
                onclick={() => handleStatChange(option.id)}
              >
                {option.label}
              </button>
            {/each}
          </div>
          <div class="text-right">
            {#if analyticsLoading}
              <div class="h-7 w-16 animate-pulse bg-surface-container-high rounded"></div>
            {:else}
              <span class="text-xl font-semibold text-on-surface tracking-tight">{formatNumber(statTotal)}{statConfig.unit}</span>
              <p class="text-[11px] text-on-surface-variant">7 derniers jours</p>
            {/if}
          </div>
        </div>

        <div class="grow" style="min-height: 200px">
          {#if activityData.length > 0}
            <LineChart data={activityData} height={200} labelKey="name" valueKey="value" color={statConfig.color} />
          {:else}
            <div class="h-full flex items-center justify-center text-on-surface-variant/40 text-xs">
              {analyticsLoading ? 'Chargement…' : 'Aucune donnée'}
            </div>
          {/if}
        </div>
      </div>
    {/if}

    <div class="section-card p-5 flex flex-col {canViewFeature('analytics') ? '' : 'lg:col-span-3'}">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-medium text-on-surface">Salons actifs</h3>
        <a href="/analytics" class="text-xs font-medium text-primary hover:underline">Tout voir</a>
      </div>

      {#if topChannels.length > 0}
        <ul class="space-y-3.5">
          {#each topChannels as channel, i (channel.channelId || channel.channelName || i)}
            {@const count = channel.messagesCount || 0}
            <li>
              <div class="flex items-center justify-between gap-2 mb-1">
                <span class="text-[13px] text-on-surface truncate">#{channel.channelName || 'inconnu'}</span>
                <span class="text-xs text-on-surface-variant tabular-nums shrink-0">{formatNumber(count)}</span>
              </div>
              <div class="h-1.5 rounded-full bg-surface-container overflow-hidden">
                <div
                  class="h-full rounded-full bg-primary/70 transition-[width] duration-500"
                  style="width: {Math.max(4, Math.round((count / maxChannelMessages) * 100))}%"
                ></div>
              </div>
            </li>
          {/each}
        </ul>
      {:else}
        <div class="grow flex items-center justify-center text-on-surface-variant/40 text-xs py-8">
          {analyticsLoading ? 'Chargement…' : 'Aucune activité sur 7 jours'}
        </div>
      {/if}
    </div>
  </section>

  <!-- ── Actions rapides ────────────────────────────────── -->
  {#if visibleActions.length > 0}
    <section aria-label="Actions rapides">
      <h2 class="section-label mb-3">Actions rapides</h2>
      <div class="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {#each visibleActions as action (action.href)}
          <a
            href={action.href}
            class="pressable group flex flex-col items-center justify-center gap-2 py-4 rounded-xl border border-outline-variant bg-surface-container-lowest hover:border-primary/40 transition-colors"
          >
            <div class="w-9 h-9 rounded-lg bg-surface-container text-on-surface-variant group-hover:bg-primary/10 group-hover:text-primary flex items-center justify-center transition-colors">
              <Papicon icon={action.icon} size={17} />
            </div>
            <span class="text-xs font-medium text-on-surface-variant group-hover:text-on-surface transition-colors">{action.label}</span>
          </a>
        {/each}
      </div>
    </section>
  {/if}

</div>
