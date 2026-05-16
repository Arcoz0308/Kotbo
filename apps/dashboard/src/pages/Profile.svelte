<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import { API_BASE_URL, fetchMemberDetailedAnalytics, fetchMyApiKeys, deleteMyApiKey } from '../lib/api';
  import type { APIKey, StaffMember } from '../lib/types';
  import MetricCard from '../lib/components/MetricCard.svelte';
  import FormInput from '../lib/components/FormInput.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import Chart from '../lib/components/charts/Chart.svelte';

  let user: any = $state(null);
  let staffMember: StaffMember | null = $state(null);
  let apiKeys: APIKey[] = $state([]);
  let isBlacklisted = $state(false);
  let blacklistReason = $state('');
  let blacklistEndDate: string | null = $state(null);
  let accessibleTools: string[] = $state([]);
  let stats: any = $state(null);
  let analyticsData: any = $state(null);
  let loading = $state(true);
  let error = $state('');
  let activeTab = $state('overview');
  let showNewKeyForm = $state(false);
  let newKeyName = $state('Ma clé API');
  let copiedKeyId = $state('');

  const tabs = [
    { id: 'overview', label: 'Vue d\'ensemble', icon: 'Grid' },
    { id: 'activity', label: 'Activité', icon: 'TrendingUp' },
    { id: 'security', label: 'Sécurité', icon: 'Lock' },
    { id: 'events', label: 'Événements', icon: 'Zap' },
    { id: 'tools', label: 'Outils', icon: 'Gears' },
  ];

  const getUserAvatar = () => {
    if (staffMember?.avatarUrl) return staffMember.avatarUrl;
    if (!user?.id || !user?.avatar) return 'https://cdn.discordapp.com/embed/avatars/0.png';
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`;
  };

  const gradeIcon = (grade: string) => {
    const g = grade?.toLowerCase();
    if (g?.includes('fondateur') || g?.includes('direction')) return 'Crown';
    if (g?.includes('admin')) return 'Shield';
    if (g?.includes('manager') || g?.includes('responsable')) return 'ShieldCheck';
    if (g?.includes('mod')) return 'ShieldHalf';
    if (g?.includes('dev')) return 'Code';
    if (g?.includes('helper') || g?.includes('test')) return 'LifeBuoy';
    return 'Badge';
  };

  const gradeColor = (grade: string) => {
    const g = grade?.toLowerCase();
    if (g?.includes('fondateur') || g?.includes('direction')) return 'from-amber-400 via-orange-500 to-rose-600';
    if (g?.includes('admin')) return 'from-rose-500 to-orange-500';
    if (g?.includes('manager') || g?.includes('responsable')) return 'from-purple-500 to-indigo-600';
    if (g?.includes('mod')) return 'from-blue-500 to-cyan-500';
    if (g?.includes('dev')) return 'from-emerald-500 to-teal-500';
    return 'from-primary to-primary-container';
  };

  const gradeBorderColor = (grade: string) => {
    const g = grade?.toLowerCase();
    if (g?.includes('fondateur') || g?.includes('direction')) return 'border-amber-500/20';
    if (g?.includes('admin')) return 'border-rose-500/20';
    if (g?.includes('manager') || g?.includes('responsable')) return 'border-purple-500/20';
    if (g?.includes('mod')) return 'border-blue-500/20';
    if (g?.includes('dev')) return 'border-emerald-500/20';
    return 'border-primary/20';
  };

  onMount(async () => {
    if (!authStore.token) {
      error = 'Non authentifié';
      loading = false;
      return;
    }

    try {
      // Récupérer l'utilisateur actuel
      const meRes = await fetch(`${API_BASE_URL}/api/user/me`, {
        headers: { Authorization: `Bearer ${authStore.token}` }
      });
      if (!meRes.ok) throw new Error('Impossible de récupérer le profil utilisateur');
      user = await meRes.json();

      // Récupérer le profil staff et les clés API
      const guildId = authStore.selectedGuildId;
      const profileRes = await fetch(`${API_BASE_URL}/api/dashboard/users/${user.id}/profile${guildId ? `?guildId=${guildId}` : ''}`, {
        headers: { Authorization: `Bearer ${authStore.token}` }
      });
      if (!profileRes.ok) throw new Error('Impossible de récupérer le profil staff');
      
      const profileData = await profileRes.json();
      staffMember = profileData.staffMember;
      apiKeys = profileData.apiKeys || [];
      isBlacklisted = profileData.isBlacklisted;
      blacklistReason = profileData.blacklistReason;
      blacklistEndDate = profileData.blacklistEndDate;
      accessibleTools = profileData.accessibleTools || [];
      const eventParticipations = profileData.eventParticipations || [];
      user = { ...user, eventParticipations };

      // Récupérer les stats et analytics
      if (staffMember) {
        const [statsRes, analytics] = await Promise.all([
          fetch(`${API_BASE_URL}/api/dashboard/users/${user.id}/staff-stats`, {
            headers: { Authorization: `Bearer ${authStore.token}` }
          }),
          fetchMemberDetailedAnalytics(user.id, 30)
        ]);

        if (statsRes.ok) {
          const statsData = await statsRes.json();
          stats = statsData.stats;
        }
        analyticsData = analytics;
      }

      loading = false;
    } catch (err) {
      console.error('Erreur lors du chargement du profil:', err);
      error = 'Erreur lors du chargement du profil';
      loading = false;
    }
  });

  async function createNewAPIKey() {
    if (!user || !staffMember) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${staffMember.guildId}/api-keys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authStore.token}`
        },
        body: JSON.stringify({
          name: newKeyName,
          permissions: ['daily_algo:create_exercise']
        })
      });

      if (!res.ok) throw new Error('Erreur lors de la création de la clé API');

      const data = await res.json();
      alert(`Votre clé API a été créée:\n\n${data.fullKey}\n\nCopie-la maintenant, tu ne pourras pas la revoir!`);
      
      // Recharger les clés API
      const keysRes = await fetchMyApiKeys(staffMember.guildId);
      apiKeys = keysRes?.keys || [];
      showNewKeyForm = false;
      newKeyName = 'Ma clé API';
    } catch (err) {
      console.error('Erreur:', err);
      alert('Erreur lors de la création de la clé API');
    }
  }

  async function deleteKey(keyId: string) {
    if (!confirm('Tu es sûr de vouloir supprimer cette clé API?')) return;
    try {
      const success = await deleteMyApiKey(keyId, staffMember?.guildId);
      if (success) {
        const keysRes = await fetchMyApiKeys(staffMember?.guildId);
        apiKeys = keysRes?.keys || [];
      }
    } catch (err) {
      console.error('Erreur:', err);
      alert('Erreur lors de la suppression');
    }
  }

  function copyToClipboard(text: string, keyId: string) {
    navigator.clipboard.writeText(text);
    copiedKeyId = keyId;
    setTimeout(() => { copiedKeyId = ''; }, 2000);
  }

  function formatDate(date: string | Date | null | undefined) {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  function getDurationSince(value: string | null | undefined) {
    if (!value) return 'Inconnu';
    const start = new Date(value);
    const now = new Date();
    let years = now.getFullYear() - start.getFullYear();
    let months = now.getMonth() - start.getMonth();
    if (months < 0) { years--; months += 12; }

    const parts: string[] = [];
    if (years > 0) parts.push(`${years} an${years > 1 ? 's' : ''}`);
    if (months > 0) parts.push(`${months} mois`);
    if (parts.length === 0) {
       const days = Math.floor((now.getTime() - start.getTime()) / 86400000);
       return days <= 0 ? "Aujourd'hui" : `${days} j`;
    }
    return parts.join(', ');
  }
</script>

<div class="space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-1000 pb-24">
  {#if loading}
    <div class="flex flex-col gap-10 animate-pulse w-full">
      <div class="h-64 w-full bg-surface-variant/20 rounded-[3rem]"></div>
      <div class="flex justify-center h-16 w-full max-w-2xl mx-auto bg-surface-variant/20 rounded-full"></div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="h-80 bg-surface-variant/20 rounded-[2.5rem]"></div>
        <div class="h-80 bg-surface-variant/20 rounded-[2.5rem]"></div>
        <div class="h-80 bg-surface-variant/20 rounded-[2.5rem]"></div>
      </div>
    </div>
  {:else if error}
    <div class="rounded-[2.5rem] border-2 border-dashed border-rose-500/20 bg-rose-500/5 px-8 py-12 text-center max-w-2xl mx-auto">
      <div class="w-20 h-20 rounded-3xl bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto mb-6">
        <Papicon icon="AlertTriangle" size={40} />
      </div>
      <h3 class="text-2xl font-black text-rose-700 font-headline">Oups !</h3>
      <p class="mt-2 text-rose-600/70 font-bold">{error}</p>
    </div>
  {:else if user && staffMember}

    <!-- ── Hero Section (Immersive) ──────────────────────────────────────── -->
    <div class="relative overflow-hidden rounded-[3.5rem] border border-outline-variant/10 bg-surface-container-lowest shadow-2xl">
      <!-- Dynamic Banner -->
      <div class="relative h-48 md:h-64 overflow-hidden">
        <div class="absolute inset-0 bg-linear-to-br {gradeColor(staffMember.grade)} opacity-40 blur-3xl scale-150"></div>
        <div class="absolute inset-0 bg-linear-to-b from-transparent to-surface-container-lowest"></div>
        
        {#if isBlacklisted}
          <div class="absolute top-6 right-6 z-20">
            <span class="inline-flex items-center gap-2 rounded-full bg-rose-500 px-4 py-2 text-[10px] font-black text-white uppercase tracking-widest shadow-lg shadow-rose-500/40">
              <Papicon icon="Slash" size={14} />
              Compte Blacklisté
            </span>
          </div>
        {/if}
      </div>

      <!-- Identity & Stats Overlap -->
      <div class="relative px-8 pb-10 -mt-20 md:-mt-24">
        <div class="flex flex-col md:flex-row items-end justify-between gap-8">
          <div class="flex flex-col md:flex-row items-end gap-6">
            <!-- Avatar -->
            <div class="relative shrink-0">
              <div class="absolute -inset-2 bg-linear-to-br {gradeColor(staffMember.grade)} rounded-[2.5rem] blur-2xl opacity-30"></div>
              <div class="relative w-32 h-32 md:w-40 md:h-40 rounded-[2.5rem] border-[6px] border-surface-container-lowest shadow-2xl overflow-hidden group">
                <img src={getUserAvatar()} alt="Avatar" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
              </div>
            </div>

            <div class="space-y-2 pb-2">
              <div class="flex flex-wrap items-center gap-3">
                <h2 class="text-3xl md:text-5xl font-black text-on-surface tracking-tighter font-headline leading-none">
                  {staffMember.displayName || staffMember.username || user.username}
                </h2>
                <span class="inline-flex items-center gap-2 rounded-full border-2 {gradeBorderColor(staffMember.grade)} bg-surface-container-low/60 backdrop-blur-md px-4 py-2 text-[10px] font-black uppercase tracking-widest text-on-surface-variant shadow-sm">
                  <Papicon icon={gradeIcon(staffMember.grade)} size={14} class="text-primary" />
                  {staffMember.grade}
                </span>
              </div>
              <p class="text-base text-on-surface-variant/60 font-bold">
                @{user.username} • <span class="font-mono text-xs opacity-50">{user.id}</span>
              </p>
            </div>
          </div>

          <div class="flex items-center gap-3 pb-2">
            <a href="/profile/{user.id}" class="group relative inline-flex items-center gap-3 rounded-2xl bg-on-surface text-surface px-8 py-4 text-xs font-black uppercase tracking-widest transition-all hover:scale-[1.05] active:scale-[0.95] shadow-xl shadow-surface/20">
              <Papicon icon="Eye" size={18} class="transition-transform group-hover:rotate-12" />
              Aperçu Public
            </a>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Navigation ────────────────────────────────────── -->
    <div class="sticky top-6 z-40 flex justify-center">
      <div class="flex gap-1 bg-surface-container-lowest/80 backdrop-blur-2xl p-1.5 rounded-4xl border border-outline-variant/10 shadow-2xl shadow-surface/10 overflow-x-auto no-scrollbar">
        {#each tabs as tab}
          <button 
            onclick={() => activeTab = tab.id} 
            class="flex items-center gap-2.5 px-6 py-3.5 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-all duration-400 whitespace-nowrap group {activeTab === tab.id ? 'bg-primary text-on-primary shadow-lg shadow-primary/25 scale-[1.05]' : 'text-on-surface-variant/60 hover:text-on-surface hover:bg-surface-container-high'}"
          >
            <Papicon icon={tab.icon} size={16} class={activeTab === tab.id ? 'text-on-primary' : 'text-primary'} />
            {tab.label}
          </button>
        {/each}
      </div>
    </div>

    <!-- ── Content Area ──────────────────────────────────── -->
    <div class="animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {#if activeTab === 'overview'}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <!-- Summary Cards -->
          <div class="lg:col-span-2 grid grid-cols-2 gap-6">
            <MetricCard label="Messages" value={`${stats?.totalMessages ?? 0}`} note="Total envoyé" icon="MessageSquare" toneClass="bg-primary/10 text-primary" />
            <MetricCard label="Vocal" value={`${Math.round((stats?.totalVoiceMinutes ?? 0))}m`} note="Temps passé" icon="Mic" toneClass="bg-secondary/10 text-secondary" />
            <MetricCard label="Sanctions" value={`${stats?.sanctionsIssued ?? 0}`} note="Émises" icon="Hammer" toneClass="bg-rose-500/10 text-rose-500" />
            <MetricCard label="Avertissements" value={`${stats?.activeWarnings ?? 0}`} note="Reçus (actifs)" icon="ShieldAlert" toneClass="bg-amber-500/10 text-amber-500" />
          </div>

          <!-- Staff Identity Bento -->
          <div class="lg:col-span-2 rounded-[2.5rem] bg-surface-container-low/50 p-8 border border-outline-variant/10 shadow-sm relative overflow-hidden group">
            <div class="absolute -right-12 -bottom-12 opacity-[0.03] rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-1000">
              <Papicon icon="User" size={240} />
            </div>
            
            <div class="flex items-center gap-4 mb-8">
              <div class="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                <Papicon icon="Badge" size={24} />
              </div>
              <div>
                <p class="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Carrière Staff</p>
                <h4 class="text-xl font-black text-on-surface">Identité & Ancienneté</h4>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-8">
              <div class="space-y-1">
                <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Staff depuis</p>
                <p class="text-xl font-black text-on-surface">{getDurationSince(stats?.joinedStaffAt)}</p>
                <p class="text-[10px] font-bold text-on-surface-variant/60">{formatDate(stats?.joinedStaffAt)}</p>
              </div>
              <div class="space-y-1">
                <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Grade actuel</p>
                <p class="text-xl font-black text-on-surface">{getDurationSince(stats?.currentRoleStartedAt)}</p>
                <p class="text-[10px] font-bold text-on-surface-variant/60">Obtenu le {formatDate(stats?.currentRoleStartedAt)}</p>
              </div>
              <div class="space-y-1">
                <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Rapports</p>
                <div class="flex items-baseline gap-2">
                  <p class="text-xl font-black text-on-surface">{stats?.pendingReports ?? 0}</p>
                  <span class="text-[10px] font-bold text-on-surface-variant/40 uppercase">en attente</span>
                </div>
              </div>
              <div class="space-y-1">
                <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">ID Serveur</p>
                <p class="text-xs font-mono font-bold text-on-surface-variant truncate">{staffMember.guildId}</p>
              </div>
            </div>
          </div>

          <!-- Blacklist info if relevant -->
          {#if isBlacklisted}
            <div class="md:col-span-4 rounded-[2.5rem] border-2 border-rose-500/20 bg-rose-500/5 p-8 flex items-start gap-6">
              <div class="w-14 h-14 rounded-3xl bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
                <Papicon icon="AlertTriangle" size={28} />
              </div>
              <div class="space-y-1">
                <h4 class="text-lg font-black text-rose-700">Votre compte est restreint</h4>
                <p class="text-sm text-rose-600/80 font-bold leading-relaxed">{blacklistReason}</p>
                {#if blacklistEndDate}
                  <p class="text-[10px] font-black uppercase tracking-widest text-rose-500 mt-2">Fin de la restriction : {formatDate(blacklistEndDate)}</p>
                {:else}
                  <p class="text-[10px] font-black uppercase tracking-widest text-rose-500 mt-2">Restriction permanente</p>
                {/if}
              </div>
            </div>
          {/if}
        </div>

      {:else if activeTab === 'activity'}
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Activity Chart -->
          <div class="lg:col-span-2 rounded-[3rem] bg-surface-container-low/30 p-10 border border-outline-variant/10 shadow-sm">
            <div class="flex items-center justify-between mb-10">
              <div class="flex items-center gap-4">
                <div class="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                  <Papicon icon="TrendingUp" size={24} />
                </div>
                <div>
                  <p class="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Performances</p>
                  <h4 class="text-2xl font-black text-on-surface font-headline">Tendance d'activité (30j)</h4>
                </div>
              </div>
            </div>

            {#if analyticsData?.dailyTrend?.length > 0}
              <div class="h-[300px] w-full">
                <Chart 
                  data={{
                    labels: analyticsData.dailyTrend.map(d => d.dateKey.slice(5)),
                    datasets: [
                      {
                        label: 'Messages',
                        data: analyticsData.dailyTrend.map(d => d.messages),
                        borderColor: 'rgb(var(--color-primary))',
                        backgroundColor: 'rgba(var(--color-primary), 0.1)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 0
                      },
                      {
                        label: 'Vocal (min)',
                        data: analyticsData.dailyTrend.map(d => d.voiceMinutes || 0),
                        borderColor: 'rgb(var(--color-secondary))',
                        backgroundColor: 'rgba(var(--color-secondary), 0.1)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 0
                      }
                    ]
                  }} 
                  height={300} 
                />
              </div>
            {:else}
              <div class="h-[300px] flex flex-col items-center justify-center text-center">
                <Papicon icon="BarChart" size={48} class="text-on-surface-variant/20 mb-4" />
                <p class="text-sm font-bold text-on-surface-variant/40">Pas encore assez de données d'activité</p>
              </div>
            {/if}
          </div>

          <!-- Activity Stats -->
          <div class="space-y-6">
            <div class="rounded-[2.5rem] bg-surface-container-low/50 p-8 border border-outline-variant/10 shadow-sm">
              <h5 class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 mb-6">Récapitulatif</h5>
              <div class="space-y-6">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                      <Papicon icon="Calendar" size={16} />
                    </div>
                    <span class="text-sm font-bold text-on-surface-variant">Jours actifs</span>
                  </div>
                  <span class="text-lg font-black text-on-surface">{analyticsData?.activeDays ?? 0}j</span>
                </div>
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
                      <Papicon icon="MessageSquare" size={16} />
                    </div>
                    <span class="text-sm font-bold text-on-surface-variant">Messages totaux</span>
                  </div>
                  <span class="text-lg font-black text-on-surface">{analyticsData?.totalMessages?.toLocaleString() ?? 0}</span>
                </div>
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center">
                      <Papicon icon="Mic" size={16} />
                    </div>
                    <span class="text-sm font-bold text-on-surface-variant">Moyenne vocal / jour</span>
                  </div>
                  <span class="text-lg font-black text-on-surface">{Math.round((analyticsData?.totalVoiceMinutes ?? 0) / (analyticsData?.activeDays || 1))}m</span>
                </div>
              </div>
            </div>

            <div class="rounded-[2.5rem] bg-linear-to-br from-primary to-primary-container p-8 text-on-primary shadow-xl shadow-primary/20">
               <Papicon icon="Sparkles" size={32} class="mb-4 opacity-50" />
               <h5 class="text-lg font-black tracking-tight leading-tight mb-2">Continue comme ça !</h5>
               <p class="text-xs font-bold opacity-80 leading-relaxed">Ton activité régulière aide à maintenir la communauté dynamique et sécurisée.</p>
            </div>
          </div>
        </div>

      {:else if activeTab === 'security'}
        <div class="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-8">
          <!-- API Keys Section -->
          <div class="rounded-[3rem] bg-surface-container-low/30 p-10 border border-outline-variant/10 shadow-sm">
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
              <div class="flex items-center gap-4">
                <div class="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                  <Papicon icon="Lock" size={24} />
                </div>
                <div>
                  <p class="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Sécurité</p>
                  <h4 class="text-2xl font-black text-on-surface font-headline">Clés API</h4>
                </div>
              </div>
              <button 
                onclick={() => showNewKeyForm = !showNewKeyForm}
                class="inline-flex items-center gap-2 rounded-2xl px-6 py-3.5 text-[10px] font-black uppercase tracking-widest transition-all {showNewKeyForm ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' : 'bg-primary text-on-primary shadow-lg shadow-primary/20 hover:scale-[1.02]'}"
              >
                <Papicon icon={showNewKeyForm ? 'Cross' : 'Plus'} size={14} />
                {showNewKeyForm ? 'Annuler' : 'Créer une clé'}
              </button>
            </div>

            {#if showNewKeyForm}
              <div class="mb-10 p-6 rounded-3xl bg-surface-container-high/40 border border-outline-variant/10 animate-in zoom-in-95 duration-500">
                <div class="flex flex-col md:flex-row gap-4 items-end">
                  <div class="flex-1 w-full">
                    <label for="key-name" class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 mb-2 block px-1">Nom de la clé</label>
                    <FormInput id="key-name" bind:value={newKeyName} placeholder="Mon application..." className="w-full" />
                  </div>
                  <button 
                    onclick={createNewAPIKey}
                    class="w-full md:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-white px-8 py-4 text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 transition-all"
                  >
                    <Papicon icon="Check" size={14} /> Confirmer
                  </button>
                </div>
              </div>
            {/if}

            {#if apiKeys.length > 0}
              <div class="grid gap-4">
                {#each apiKeys as key (key.id)}
                  <div class="group flex items-center justify-between gap-4 rounded-3xl border border-outline-variant/10 bg-surface-container-low/60 p-6 transition-all hover:bg-surface-container-low hover:border-primary/20">
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-3 mb-2">
                        <span class="text-sm font-black text-on-surface">{key.name}</span>
                        <div class="flex gap-1">
                          {#each key.permissions as perm}
                            <span class="px-2 py-0.5 rounded-lg bg-primary/5 text-[9px] font-black text-primary uppercase tracking-tighter border border-primary/10">{perm}</span>
                          {/each}
                        </div>
                      </div>
                      <div class="flex items-center gap-3">
                        <code class="text-xs font-mono text-on-surface-variant/60 bg-surface-container-high px-3 py-1 rounded-xl">{key.displayKey}</code>
                        <button 
                          onclick={() => copyToClipboard(key.displayKey, key.id)}
                          class="p-2 rounded-lg hover:bg-surface-container-high transition-colors text-on-surface-variant/40 hover:text-primary"
                        >
                          <Papicon icon={copiedKeyId === key.id ? 'Check' : 'Paper'} size={14} />
                        </button>
                      </div>
                    </div>
                    <button 
                      onclick={() => deleteKey(key.id)}
                      class="opacity-0 group-hover:opacity-100 p-3 rounded-xl bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-all duration-300"
                    >
                      <Papicon icon="Trash" size={18} />
                    </button>
                  </div>
                {/each}
              </div>
            {:else}
              <div class="py-20 flex flex-col items-center justify-center text-center bg-surface-container-low/20 rounded-3xl border-2 border-dashed border-outline-variant/10">
                <div class="w-16 h-16 rounded-3xl bg-on-surface/5 flex items-center justify-center text-on-surface-variant/20 mb-6">
                  <Papicon icon="Lock" size={32} />
                </div>
                <h5 class="text-lg font-black text-on-surface-variant/60">Aucune clé API active</h5>
                <p class="mt-1 text-sm font-bold text-on-surface-variant/30">Créez-en une pour automatiser vos tâches Kotbo.</p>
              </div>
            {/if}
          </div>

          <!-- Security Sidebar -->
          <div class="space-y-6">
            <div class="rounded-[2.5rem] bg-surface-container-low/50 p-8 border border-outline-variant/10 shadow-sm">
               <div class="flex items-center gap-3 mb-6">
                  <div class="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                    <Papicon icon="ShieldAlert" size={20} />
                  </div>
                  <h5 class="text-sm font-black uppercase tracking-widest text-on-surface">Conseils de sécurité</h5>
               </div>
               <ul class="space-y-4">
                 <li class="flex gap-3 text-xs font-bold text-on-surface-variant/60 leading-relaxed">
                   <span class="text-amber-500">•</span>
                   Ne partagez jamais vos clés API avec des tiers.
                 </li>
                 <li class="flex gap-3 text-xs font-bold text-on-surface-variant/60 leading-relaxed">
                   <span class="text-amber-500">•</span>
                   Une clé compromise doit être supprimée immédiatement.
                 </li>
                 <li class="flex gap-3 text-xs font-bold text-on-surface-variant/60 leading-relaxed">
                   <span class="text-amber-500">•</span>
                   Utilisez des noms de clés explicites pour faciliter leur gestion.
                 </li>
               </ul>
            </div>
          </div>
        </div>
      {:else if activeTab === 'events'}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          {#each user.eventParticipations || [] as part}
            <div class="bg-surface-container-low/50 rounded-[2.5rem] p-8 border border-outline-variant/10 flex items-center justify-between">
              <div class="flex items-center gap-6">
                <div class="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                  <Papicon icon="Zap" size={24} />
                </div>
                <div>
                  <h5 class="text-lg font-black text-on-surface">{part.event.title}</h5>
                  <p class="text-[10px] text-on-surface-variant/40 mt-1 uppercase tracking-widest font-black">
                    {formatDate(part.event.createdAt)}
                  </p>
                </div>
              </div>
              <div class="text-right">
                <p class="text-2xl font-black text-primary">{part.score} pts</p>
                <p class="text-[10px] text-on-surface-variant/40 uppercase font-black">Score final</p>
              </div>
            </div>
          {:else}
             <div class="md:col-span-2 py-24 flex flex-col items-center justify-center text-center bg-surface-container-low/10 rounded-[3rem] border-2 border-dashed border-outline-variant/10">
               <Papicon icon="Zap" size={64} class="text-on-surface-variant/10 mb-6" />
               <h5 class="text-xl font-black text-on-surface-variant/40">Aucune participation</h5>
               <p class="mt-2 text-sm font-bold text-on-surface-variant/20">Vous n'avez pas encore participé à un événement.</p>
            </div>
          {/each}
        </div>
      {:else if activeTab === 'tools'}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          <!-- Tools Grid -->
          {#if accessibleTools.length > 0}
            {#each accessibleTools as tool}
              <div class="group relative rounded-[2.5rem] bg-surface-container-low/50 p-8 border border-outline-variant/10 shadow-sm transition-all hover:shadow-xl hover:-translate-y-1 hover:border-primary/20 overflow-hidden">
                <div class="absolute -right-6 -top-6 w-24 h-24 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-colors"></div>
                <div class="relative z-10">
                  <div class="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <Papicon icon="Gears" size={28} />
                  </div>
                  <h5 class="text-lg font-black text-on-surface mb-2">{tool}</h5>
                  <p class="text-xs font-bold text-on-surface-variant/60">Outil de gestion Kotbo activé pour votre grade.</p>
                </div>
              </div>
            {/each}
          {:else}
            <div class="md:col-span-4 py-24 flex flex-col items-center justify-center text-center bg-surface-container-low/10 rounded-[3rem] border-2 border-dashed border-outline-variant/10">
               <Papicon icon="Gears" size={64} class="text-on-surface-variant/10 mb-6" />
               <h5 class="text-xl font-black text-on-surface-variant/40">Aucun outil spécifique</h5>
               <p class="mt-2 text-sm font-bold text-on-surface-variant/20">Votre grade actuel ne vous donne pas accès à des outils externes.</p>
            </div>
          {/if}
        </div>
      {/if}
    </div>

  {:else}
    <!-- Empty / Unauthorized State -->
    <div class="flex flex-col items-center justify-center py-32 text-center">
      <div class="w-24 h-24 rounded-[2.5rem] bg-amber-500/10 text-amber-500 flex items-center justify-center shadow-inner mb-8">
        <Papicon icon="UserCross" size={48} />
      </div>
      <h3 class="text-3xl font-black tracking-tighter text-on-surface font-headline">Profil Non Trouvé</h3>
      <p class="mt-4 max-w-md text-base leading-relaxed text-on-surface-variant/60 font-bold">
        Vous ne semblez pas faire partie de l'équipe staff sur ce serveur. 
        Si c'est une erreur, contactez un administrateur.
      </p>
      <div class="mt-12">
        <a href="/" class="inline-flex items-center gap-3 rounded-2xl bg-primary px-10 py-5 text-sm font-black uppercase tracking-widest text-on-primary shadow-2xl shadow-primary/30 transition-all hover:scale-[1.05] active:scale-[0.95]">
          <Papicon icon="ArrowLeft" size={20} />
          Retour au Dashboard
        </a>
      </div>
    </div>
  {/if}
</div>


