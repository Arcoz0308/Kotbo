<script lang="ts">
import { onMount } from 'svelte';
import { authStore } from '../lib/stores/auth.svelte';
import Papicon from '../lib/components/Papicon.svelte';
import MemberCaseModal from '../lib/components/MemberCaseModal.svelte';
import { fetchAnalytics, fetchMemberCase, fetchInviteAnalytics, fetchHourlyHeatmap, fetchWeeklyComparison, fetchDailyAlgoAnalytics } from '../lib/api';
import AnalyticsSkeleton from '../lib/components/analytics/AnalyticsSkeleton.svelte';
import StatsOverview from '../lib/components/analytics/StatsOverview.svelte';
import EngagementMetrics from '../lib/components/analytics/EngagementMetrics.svelte';
import MembersStats from '../lib/components/analytics/MembersStats.svelte';
import InvitationsStats from '../lib/components/analytics/InvitationsStats.svelte';
import ModerationAudit from '../lib/components/analytics/ModerationAudit.svelte';
import StaffAudit from '../lib/components/analytics/StaffAudit.svelte';
import HourlyHeatmap from '../lib/components/analytics/HourlyHeatmap.svelte';
import WeeklyComparison from '../lib/components/analytics/WeeklyComparison.svelte';
import DailyAlgoAnalyticsCard from '../lib/components/analytics/DailyAlgoAnalyticsCard.svelte';

  let data: any = $state(null);
  let heatmapData: any = $state(null);
  let weeklyData: any = $state(null);
  let algoData: any = $state(null);
  let loading = $state(true);
  let error = $state('');
  let period = $state(30);
  let activeCategory = $state('overview');
  let activeTab = $state('overview');

  const categories = [
    { id: 'overview', label: 'Aperçu', icon: 'Grid', description: 'Vue générale' },
    { id: 'engagement', label: 'Engagement', icon: 'ChatBubbles', description: 'Messages, Vocal, Membres' },
    { id: 'moderation', label: 'Modération', icon: 'Gavel', description: 'Modération et Staff' },
    { id: 'invitations', label: 'Invitations', icon: 'MailOpen', description: 'Analyse des invites' },
    { id: 'growth', label: 'Croissance', icon: 'TrendingUp', description: 'Croissance & Rétention' },
  ];

  const tabsByCategory: Record<string, Array<{ id: string; label: string; icon: string }>> = {
    overview: [
      { id: 'overview', label: 'Aperçu Global', icon: 'Grid' },
    ],
    engagement: [
      { id: 'messages', label: 'Messages', icon: 'ChatCircleDots' },
      { id: 'voice', label: 'Vocal', icon: 'Microphone' },
      { id: 'members', label: 'Membres', icon: 'UsersFour' },
    ],
    moderation: [
      { id: 'moderation', label: 'Modération', icon: 'Gavel' },
      { id: 'staff', label: 'Staff', icon: 'Users' },
    ],
    invitations: [
      { id: 'invitations', label: 'Invitations', icon: 'MailOpen' },
    ],
    growth: [
      { id: 'heatmap', label: 'Heatmap Horaire', icon: 'Fire' },
      { id: 'weekly', label: 'Semaine vs Semaine', icon: 'Calendar' },
      { id: 'algo', label: 'Daily Algo', icon: 'Code' },
    ],
  };

  const currentTabs = $derived(tabsByCategory[activeCategory] || []);

  let invitesData: any = $state(null);
  
  // Member Case Modal state
  let modalOpen = $state(false);
  let selectedUserId = $state<string | null>(null);
  let selectedUserName = $state('');
  let caseData = $state<any>(null);
  let loadingCase = $state(false);
  let caseError = $state('');

  async function openMemberDetails(memberId: string, memberName: string) {
    selectedUserId = memberId;
    selectedUserName = memberName || 'Membre';
    modalOpen = true;
    loadingCase = true;
    caseError = '';
    caseData = null;

    try {
      caseData = await fetchMemberCase(memberId, authStore.selectedGuildId);
    } catch (e: any) {
      console.error(e);
      caseError = e.message || 'Impossible de charger le dossier';
    } finally {
      loadingCase = false;
    }
  }

  async function load() {
    loading = true; error = '';
    try { 
      const [mainData, invites, heatmap, weekly, algo] = await Promise.all([
        fetchAnalytics(period),
        fetchInviteAnalytics(),
        fetchHourlyHeatmap(period),
        fetchWeeklyComparison(),
        fetchDailyAlgoAnalytics(period)
      ]);
      data = mainData;
      invitesData = invites;
      heatmapData = heatmap;
      weeklyData = weekly;
      algoData = algo;
    }
    catch (e: any) { error = e.message || 'Erreur'; }
    finally { loading = false; }
  }

  onMount(load);

  function changePeriod(p: number) { period = p; load(); }

  function exportToCSV() {
    if (!data) return;
    
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Metric,Date,Value\n";
    
    data.dailyTrend?.forEach((row: any) => {
      csvContent += `Messages,${row.dateKey},${row.messages}\n`;
      csvContent += `VoiceMinutes,${row.dateKey},${row.voiceMinutes}\n`;
      csvContent += `MembersJoined,${row.dateKey},${row.membersJoined}\n`;
      csvContent += `MembersLeft,${row.dateKey},${row.membersLeft}\n`;
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `analytics_kotbo_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const fmt = (n: number) => n?.toLocaleString('fr-FR') ?? '0';
  const fmtH = (mins: number) => { 
    const h = Math.floor((mins || 0) / 60); 
    const m = Math.round((mins || 0) % 60); 
    if (h > 0) return `${h}h${m > 0 ? String(m).padStart(2, '0') : ''}`;
    return `${m}min`;
  };
  const chartLabels = $derived(data?.dailyTrend?.map((d: any) => ({ ...d, label: d.dateKey?.slice(5) })) ?? []);
</script>

<div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20 max-w-7xl mx-auto px-4 md:px-8">
  <!-- Header -->
  <div class="relative overflow-hidden bg-surface-container-low/30 p-8 md:p-12 rounded-[3rem] border border-outline-variant/10 group">
    <div class="absolute top-0 right-0 -translate-y-1/2 translate-x-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-colors duration-1000"></div>
    <div class="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/4 w-64 h-64 bg-secondary/5 rounded-full blur-2xl group-hover:bg-secondary/10 transition-colors duration-1000"></div>
    
    <div class="relative flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
      <div class="space-y-2">
        <div class="flex items-center gap-3">
           <div class="bg-primary/10 p-2 rounded-xl text-primary">
              <Papicon icon="ChartLineUp" size={20} />
           </div>
           <span class="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Intelligence & Analytics</span>
        </div>
        <h2 class="text-3xl md:text-5xl font-black tracking-tight text-on-surface font-headline leading-tight">
          Performance <span class="text-primary">Serveur</span>
        </h2>
        <p class="text-on-surface-variant/60 text-base max-w-md">Analysez la croissance, l'engagement et l'activité de votre communauté en temps réel.</p>
      </div>

      <div class="flex flex-col items-end gap-4 w-full md:w-auto">
        <div class="flex items-center gap-3">
          <button 
            onclick={exportToCSV}
            class="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-surface-container-high/40 border border-outline-variant/10 hover:bg-surface-container-high transition-colors"
          >
            <Papicon icon="DownloadSimple" size={14} /> Export CSV
          </button>
          <div class="flex gap-1.5 bg-surface-container-high/40 p-2 rounded-2xl border border-outline-variant/10 backdrop-blur-sm">
            {#each [7, 30, 90] as p}
              <button 
                onclick={() => changePeriod(p)} 
                class="px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 {period === p ? 'bg-on-surface text-surface shadow-xl' : 'text-on-surface-variant/60 hover:text-on-surface hover:bg-surface-container-high'}"
              >
                {p} jours
              </button>
            {/each}
          </div>
        </div>
        {#if data?.totals}
          <div class="flex items-center gap-4 text-xs font-bold text-on-surface-variant/40 bg-surface-container-low/40 px-4 py-2 rounded-xl border border-outline-variant/5">
             <div class="flex items-center gap-2">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Live Feed</span>
             </div>
             <span class="w-px h-3 bg-outline-variant/20"></span>
             <span>Dernière mise à jour: {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- Navigation Catégories -->
  <div class="sticky top-4 z-40 flex justify-center">
    <div class="flex gap-1 bg-surface-container-low/60 backdrop-blur-2xl p-1.5 rounded-[2rem] border border-outline-variant/10 shadow-2xl shadow-surface/20 overflow-x-auto no-scrollbar max-w-full">
      {#each categories as cat}
        <button 
          onclick={() => { activeCategory = cat.id; activeTab = tabsByCategory[cat.id]?.[0]?.id || cat.id; }} 
          class="flex items-center gap-2.5 px-6 py-3.5 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-all duration-400 whitespace-nowrap group {activeCategory === cat.id ? 'bg-primary text-on-primary shadow-lg shadow-primary/25 scale-[1.02]' : 'text-on-surface-variant/60 hover:text-on-surface hover:bg-surface-container-high'}"
          title={cat.description}
        >
          <div class="transition-transform group-hover:scale-110 {activeCategory === cat.id ? 'text-on-primary' : 'text-primary'}">
            <Papicon icon={cat.icon} size={16} />
          </div>
          {cat.label}
        </button>
      {/each}
    </div>
  </div>

  <!-- Navigation Onglets (sous-catégories) -->
  {#if currentTabs.length > 1}
    <div class="flex justify-center">
      <div class="flex gap-1 bg-surface-container-low/40 backdrop-blur-lg p-1.5 rounded-[1.5rem] border border-outline-variant/5">
        {#each currentTabs as tab}
          <button 
            onclick={() => activeTab = tab.id} 
            class="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all duration-300 whitespace-nowrap {activeTab === tab.id ? 'bg-primary text-on-primary shadow-lg' : 'text-on-surface-variant/60 hover:text-on-surface hover:bg-surface-container-high'}"
          >
            <div class="transition-transform {activeTab === tab.id ? 'text-on-primary' : 'text-primary'}">
              <Papicon icon={tab.icon} size={14} />
            </div>
            {tab.label}
          </button>
        {/each}
      </div>
    </div>
  {/if}


  {#if loading}
    <AnalyticsSkeleton />
  {:else if error}

    <div class="bg-error-container/10 border border-error/20 p-5 rounded-[2rem] text-error text-sm font-bold flex items-center gap-3">
      <Papicon icon="alert-octagon" size={20} />{error}
    </div>
  {:else if data}

    {#if activeTab === 'overview'}
      <StatsOverview {data} {chartLabels} />
    {:else if activeTab === 'messages' || activeTab === 'voice'}
      <EngagementMetrics {data} mode={activeTab} onOpenMember={openMemberDetails} />
    {:else if activeTab === 'members'}
      <MembersStats {data} {chartLabels} onOpenMember={openMemberDetails} />
    {:else if activeTab === 'invitations'}
      <InvitationsStats {invitesData} />
    {:else if activeTab === 'moderation'}
      <ModerationAudit {data} onOpenMember={openMemberDetails} />
    {:else if activeTab === 'staff'}
      <StaffAudit {data} onOpenMember={openMemberDetails} {fmt} {fmtH} />
    {:else if activeTab === 'heatmap' && heatmapData}
      <HourlyHeatmap data={heatmapData} />
    {:else if activeTab === 'weekly' && weeklyData}
      <WeeklyComparison data={weeklyData} />
    {:else if activeTab === 'algo' && algoData}
      <DailyAlgoAnalyticsCard data={algoData} />
    {/if}
  {/if}

  <!-- Member Case Modal -->
  <MemberCaseModal
    open={modalOpen}
    userId={selectedUserId}
    userName={selectedUserName}
    {caseData}
    loading={loadingCase}
    error={caseError}
    onClose={() => {
      modalOpen = false;
    }}
  />
</div>
