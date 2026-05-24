<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import { 
    API_BASE_URL, 
    fetchStaffProfile, 
    fetchPublicProfile, 
    fetchMyApiKeys, 
    deleteMyApiKey, 
    createOrResetDailyAlgoApiKey,
    fetchManagerNotes,
    addManagerNote,
    deleteManagerNote
  } from '../lib/api';
  import type { APIKey, StaffMember, TestingPeriod, StaffManagerNote } from '../lib/types';
  import MetricCard from '../lib/components/MetricCard.svelte';
  import FormInput from '../lib/components/FormInput.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import Chart from '../lib/components/charts/Chart.svelte';
  import { toast } from '../lib/stores/toast.svelte';

  interface Props {
    userId?: string;
  }
  let { userId }: Props = $props();

  let targetUserId = $derived(userId || authStore.user?.id || '');

  let staffMember: StaffMember | null = $state(null);
  let publicProfile: any = $state(null);
  let apiKeys: APIKey[] = $state([]);
  let isBlacklisted = $state(false);
  let blacklistReason = $state('');
  let blacklistEndDate: string | null = $state(null);
  let blacklistHistory: any[] = $state([]);
  let warnings: any[] = $state([]);
  let absences: any[] = $state([]);
  let testingPeriods: TestingPeriod[] = $state([]);
  let activities: any[] = $state([]);
  let notesAbout: StaffManagerNote[] = $state([]);
  let gradeHistory: any[] = $state([]);
  let stats: any = $state(null);
  let accessibleTools: string[] = $state([]);
  
  let loading = $state(true);
  let error = $state('');
  let activeTab = $state('staff_overview');
  
  // API Keys Form
  let showNewKeyForm = $state(false);
  let newKeyName = $state('Ma clé API');
  let copiedKeyId = $state('');
  let newKeyCreatedValue = $state('');

  // Manager Notes Form
  let newNoteContent = $state('');
  let sendingNote = $state(false);

  const isOwnProfile = $derived(targetUserId === authStore.user?.id);

  const tabs = $derived([
    ...(staffMember ? [
      { id: 'staff_overview', label: 'Espace Staff', icon: 'Grid' },
      { id: 'staff_activity', label: 'Activité Staff', icon: 'TrendingUp' }
    ] : []),
    ...(publicProfile ? [
      { id: 'community_overview', label: 'Vue Communautaire', icon: 'User' }
    ] : []),
    ...(staffMember && isOwnProfile ? [
      { id: 'api_keys', label: 'Clés API & Sécurité', icon: 'Lock' }
    ] : [])
  ]);

  // Reactive effect to load profile when targetUserId changes
  $effect(() => {
    if (targetUserId) {
      loadProfile(targetUserId);
    }
  });

  async function loadProfile(id: string) {
    loading = true;
    error = '';
    
    if (!authStore.token) {
      error = 'Non authentifié';
      loading = false;
      return;
    }

    try {
      const guildId = authStore.selectedGuildId;
      // Fetch private staff profile details
      const res = await fetch(`${API_BASE_URL}/api/dashboard/users/${id}/profile${guildId ? `?guildId=${guildId}` : ''}`, {
        headers: { Authorization: `Bearer ${authStore.token}` }
      });

      if (res.ok) {
        const data = await res.json();
        staffMember = data.staffMember;
        publicProfile = data.publicProfile;
        apiKeys = data.apiKeys || [];
        warnings = data.warnings || [];
        absences = data.absences || [];
        testingPeriods = data.testingPeriods || [];
        activities = data.activities || [];
        notesAbout = data.notesAbout || [];
        gradeHistory = data.gradeHistory || [];
        stats = data.stats;
        isBlacklisted = data.isBlacklisted;
        blacklistReason = data.blacklistReason;
        blacklistEndDate = data.blacklistEndDate;
        blacklistHistory = data.blacklistHistory || [];
        accessibleTools = data.accessibleTools || [];
        
        // Default active tab
        if (staffMember) {
          activeTab = 'staff_overview';
        } else {
          activeTab = 'community_overview';
        }
      } else {
        // Not a staff member or unauthorized for staff details
        // Try fetching only public community profile
        const pubRes = await fetch(`${API_BASE_URL}/api/public/profile/${id}`, {
          headers: { Authorization: `Bearer ${authStore.token}` }
        });
        if (pubRes.ok) {
          publicProfile = await pubRes.json();
          staffMember = null;
          activeTab = 'community_overview';
        } else {
          throw new Error('Impossible de charger le profil (utilisateur inconnu ou restreint)');
        }
      }
    } catch (err: any) {
      console.error('Erreur lors du chargement du profil:', err);
      error = err.message || 'Erreur lors du chargement du profil';
    } finally {
      loading = false;
    }
  }

  const getUserAvatar = () => {
    if (staffMember?.avatarUrl) return staffMember.avatarUrl;
    if (publicProfile?.avatar) return publicProfile.avatar;
    return 'https://cdn.discordapp.com/embed/avatars/0.png';
  };

  const gradeIcon = (grade: string) => {
    const g = grade?.toLowerCase() || '';
    if (g.includes('fondateur') || g.includes('direction')) return 'Crown';
    if (g.includes('admin')) return 'Shield';
    if (g.includes('manager') || g.includes('responsable')) return 'ShieldCheck';
    if (g.includes('mod')) return 'ShieldHalf';
    if (g.includes('dev')) return 'Code';
    if (g.includes('helper') || g.includes('test')) return 'LifeBuoy';
    return 'Badge';
  };

  const gradeColor = (grade: string) => {
    const g = grade?.toLowerCase() || '';
    if (g.includes('fondateur') || g.includes('direction')) return 'from-amber-400 via-orange-500 to-rose-600';
    if (g.includes('admin')) return 'from-rose-500 to-orange-500';
    if (g.includes('manager') || g.includes('responsable')) return 'from-purple-500 to-indigo-600';
    if (g.includes('mod')) return 'from-blue-500 to-cyan-500';
    if (g.includes('dev')) return 'from-emerald-500 to-teal-500';
    return 'from-primary to-primary-container';
  };

  const gradeBorderColor = (grade: string) => {
    const g = grade?.toLowerCase() || '';
    if (g.includes('fondateur') || g.includes('direction')) return 'border-amber-500/20';
    if (g.includes('admin')) return 'border-rose-500/20';
    if (g.includes('manager') || g.includes('responsable')) return 'border-purple-500/20';
    if (g.includes('mod')) return 'border-blue-500/20';
    if (g.includes('dev')) return 'border-emerald-500/20';
    return 'border-primary/20';
  };

  async function createNewAPIKey() {
    if (!staffMember) return;
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
      newKeyCreatedValue = data.fullKey;
      
      // Reload keys
      const keysRes = await fetchMyApiKeys(staffMember.guildId);
      apiKeys = keysRes?.keys || [];
      showNewKeyForm = false;
      newKeyName = 'Ma clé API';
      toast.success('Clé API générée avec succès');
    } catch (err) {
      console.error(err);
      toast.error('Impossible de créer la clé API');
    }
  }

  async function deleteKey(keyId: string) {
    if (!staffMember || !confirm('Voulez-vous vraiment révoquer cette clé API ?')) return;
    try {
      const success = await deleteMyApiKey(keyId, staffMember.guildId);
      if (success) {
        const keysRes = await fetchMyApiKeys(staffMember.guildId);
        apiKeys = keysRes?.keys || [];
        toast.success('Clé API révoquée');
      }
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors de la révocation');
    }
  }

  function copyToClipboard(text: string, keyId: string) {
    navigator.clipboard.writeText(text);
    copiedKeyId = keyId;
    toast.success('Copié dans le presse-papier');
    setTimeout(() => { copiedKeyId = ''; }, 2000);
  }

  // Manager Notes Methods
  async function submitManagerNote() {
    if (!newNoteContent.trim() || !staffMember) return;
    sendingNote = true;
    try {
      const success = await addManagerNote(staffMember.userId, newNoteContent.trim(), staffMember.guildId);
      if (success) {
        newNoteContent = '';
        toast.success('Note ajoutée');
        // Reload notes
        notesAbout = await fetchManagerNotes(staffMember.userId, staffMember.guildId);
      }
    } catch (err) {
      console.error(err);
      toast.error("Erreur lors de l'ajout de la note");
    } finally {
      sendingNote = false;
    }
  }

  async function removeNote(noteId: string) {
    if (!staffMember || !confirm('Voulez-vous supprimer cette note ?')) return;
    try {
      const success = await deleteManagerNote(staffMember.userId, noteId, staffMember.guildId);
      if (success) {
        toast.success('Note supprimée');
        notesAbout = await fetchManagerNotes(staffMember.userId, staffMember.guildId);
      }
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors de la suppression');
    }
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

  const chartData = $derived(
    activities.length > 0 ? {
      labels: activities.map(a => new Date(a.activityDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })),
      datasets: [
        {
          label: 'Messages',
          data: activities.map(a => a.messageCount),
          borderColor: 'rgb(var(--color-primary))',
          backgroundColor: 'rgba(var(--color-primary), 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 0
        },
        {
          label: 'Vocal (min)',
          data: activities.map(a => a.voiceMinutes || 0),
          borderColor: 'rgb(var(--color-secondary))',
          backgroundColor: 'rgba(var(--color-secondary), 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 0
        }
      ]
    } : null
  );

  const isRequesterManager = $derived(
    authStore.guilds.find(g => g.id === authStore.selectedGuildId)?.accessLevel !== 'none' &&
    authStore.guilds.find(g => g.id === authStore.selectedGuildId)?.accessLevel !== 'moderator'
  );
</script>

<div class="space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-1000 pb-24 font-sans">
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
      <h3 class="text-2xl font-black text-rose-700 font-headline">Erreur</h3>
      <p class="mt-2 text-rose-600/70 font-bold">{error}</p>
    </div>
  {:else}

    <!-- ── Hero Banner Section ──────────────────────────────────────── -->
    <div class="relative overflow-hidden rounded-[3.5rem] border border-outline-variant/10 bg-surface-container-lowest shadow-2xl">
      <div class="relative h-48 md:h-64 overflow-hidden">
        {#if staffMember}
          <div class="absolute inset-0 bg-linear-to-br {gradeColor(staffMember.grade)} opacity-40 blur-3xl scale-150"></div>
        {:else if publicProfile?.banner}
          <img src={publicProfile.banner} alt="Banner" class="w-full h-full object-cover" />
        {:else}
          <div class="absolute inset-0 bg-linear-to-br from-primary/20 via-primary/5 to-transparent blur-3xl scale-150"></div>
        {/if}
        <div class="absolute inset-0 bg-linear-to-b from-transparent to-surface-container-lowest"></div>
        
        {#if isBlacklisted}
          <div class="absolute top-6 right-6 z-20">
            <span class="inline-flex items-center gap-2 rounded-full bg-rose-500 px-4 py-2 text-[10px] font-black text-white uppercase tracking-widest shadow-lg shadow-rose-500/40">
              <Papicon icon="Slash" size={14} />
              Compte Restreint
            </span>
          </div>
        {/if}
      </div>

      <div class="relative px-8 pb-10 -mt-20 md:-mt-24">
        <div class="flex flex-col md:flex-row items-center md:items-end justify-between gap-8 text-center md:text-left">
          <div class="flex flex-col md:flex-row items-center md:items-end gap-6">
            <!-- Avatar Frame -->
            <div class="relative shrink-0">
              {#if staffMember}
                <div class="absolute -inset-2 bg-linear-to-br {gradeColor(staffMember.grade)} rounded-[2.5rem] blur-2xl opacity-30"></div>
              {/if}
              <div class="relative w-32 h-32 md:w-40 md:h-40 rounded-[2.5rem] border-[6px] border-surface-container-lowest shadow-2xl overflow-hidden bg-surface-container-low">
                <img src={getUserAvatar()} alt="Avatar" class="w-full h-full object-cover" />
              </div>
            </div>

            <!-- Identity Info -->
            <div class="space-y-2 pb-2">
              <div class="flex flex-wrap items-center justify-center md:justify-start gap-3">
                <h2 class="text-3xl md:text-5xl font-black text-on-surface tracking-tighter font-headline leading-none">
                  {staffMember?.displayName || publicProfile?.displayName || publicProfile?.username || authStore.user?.username}
                </h2>
                {#if staffMember}
                  <span class="inline-flex items-center gap-2 rounded-full border-2 {gradeBorderColor(staffMember.grade)} bg-surface-container-low/60 backdrop-blur-md px-4 py-2 text-[10px] font-black uppercase tracking-widest text-on-surface-variant shadow-sm">
                    <Papicon icon={gradeIcon(staffMember.grade)} size={14} class="text-primary" />
                    {staffMember.grade}
                  </span>
                {/if}
              </div>
              <p class="text-base text-on-surface-variant/60 font-bold">
                @{publicProfile?.username || staffMember?.username || authStore.user?.username} • <span class="font-mono text-xs opacity-50">{targetUserId}</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── View Tabs / Toggle ────────────────────────────────────── -->
    <div class="sticky top-6 z-40 flex justify-center">
      <div class="flex gap-1 bg-surface-container-lowest/80 backdrop-blur-2xl p-1.5 rounded-4xl border border-outline-variant/10 shadow-2xl shadow-surface/10 overflow-x-auto no-scrollbar">
        {#each tabs as tab}
          <button 
            onclick={() => activeTab = tab.id} 
            class="flex items-center gap-2.5 px-6 py-3.5 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-all duration-400 whitespace-nowrap group {activeTab === tab.id ? 'bg-primary text-on-primary shadow-lg shadow-primary/25 scale-[1.05]' : 'text-on-surface-variant/60 hover:text-on-surface hover:bg-surface-container-high'}"
          >
            <span class="flex items-center gap-2 pointer-events-none">
              <Papicon icon={tab.icon} size={16} class={activeTab === tab.id ? 'text-on-primary' : 'text-primary'} />
              {tab.label}
            </span>
          </button>
        {/each}
      </div>
    </div>

    <!-- ── Content Panel ────────────────────────────────── -->
    <div class="animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {#if activeTab === 'staff_overview' && staffMember}
        <!-- Staff Bento Overview -->
        <div class="space-y-8">
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <MetricCard label="Messages" value={`${stats?.totalMessages ?? 0}`} note="Total envoyé" icon="MessageSquare" toneClass="bg-primary/10 text-primary" />
            <MetricCard label="Vocal" value={`${Math.round((stats?.totalVoiceMinutes ?? 0))}m`} note="Temps passé" icon="Mic" toneClass="bg-secondary/10 text-secondary" />
            <MetricCard label="Sanctions" value={`${stats?.sanctionsIssued ?? 0}`} note="Warns + blacklist" icon="Hammer" toneClass="bg-rose-500/10 text-rose-500" />
            <MetricCard label="Avertissements" value={`${stats?.activeWarnings ?? 0}`} note="Actifs reçus" icon="ShieldAlert" toneClass="bg-amber-500/10 text-amber-500" />
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- Career Bento Card -->
            <div class="rounded-[2.5rem] bg-surface-container-low/50 p-8 border border-outline-variant/10 shadow-sm relative overflow-hidden group">
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
                  <p class="text-xl font-black text-on-surface">{getDurationSince(staffMember.joinedStaffAt)}</p>
                  <p class="text-[10px] font-bold text-on-surface-variant/60">{formatDate(staffMember.joinedStaffAt)}</p>
                </div>
                <div class="space-y-1">
                  <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Grade actuel depuis</p>
                  <p class="text-xl font-black text-on-surface">{getDurationSince(staffMember.currentRoleStartedAt)}</p>
                  <p class="text-[10px] font-bold text-on-surface-variant/60">{formatDate(staffMember.currentRoleStartedAt)}</p>
                </div>
                <div class="space-y-1">
                  <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Statut Tuteur</p>
                  <span class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-black uppercase tracking-wider {staffMember.isTutor ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-on-surface/5 text-on-surface-variant/40 border border-outline-variant/10'}">
                    {staffMember.isTutor ? 'Tuteur Actif' : 'Non Tuteur'}
                  </span>
                </div>
                <div class="space-y-1">
                  <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Identifiant Unique</p>
                  <p class="text-xs font-mono font-bold text-on-surface-variant truncate">{staffMember.id}</p>
                </div>
              </div>
            </div>

            <!-- Grade History Card (if visible) -->
            {#if gradeHistory.length > 0}
              <div class="rounded-[2.5rem] bg-surface-container-low/50 p-8 border border-outline-variant/10 shadow-sm relative overflow-hidden">
                <h4 class="text-sm font-black text-primary uppercase tracking-widest mb-6">Historique des promotions</h4>
                <div class="space-y-4 max-h-60 overflow-y-auto pr-2">
                  {#each gradeHistory as event}
                    <div class="flex items-start gap-3 border-b border-outline-variant/5 pb-3">
                      <div class="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0"></div>
                      <div>
                        <p class="text-xs font-bold text-on-surface">{event.details}</p>
                        <p class="text-[9px] font-bold text-on-surface-variant/40 uppercase mt-0.5">{formatDate(event.dateIso)} • Par {event.user}</p>
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {:else}
              <div class="rounded-[2.5rem] bg-surface-container-low/50 p-8 border border-outline-variant/10 shadow-sm flex flex-col justify-center items-center text-center">
                <Papicon icon="Grid" size={40} class="text-on-surface-variant/20 mb-4" />
                <p class="text-xs font-bold text-on-surface-variant/40">Aucun historique de grade disponible</p>
              </div>
            {/if}
          </div>

          <!-- Disciplinary & Restrictive Panels -->
          {#if isBlacklisted}
            <div class="rounded-[2.5rem] border-2 border-rose-500/20 bg-rose-500/5 p-8 flex items-start gap-6">
              <div class="w-14 h-14 rounded-3xl bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
                <Papicon icon="AlertTriangle" size={28} />
              </div>
              <div class="space-y-1">
                <h4 class="text-lg font-black text-rose-700">Compte Restreint / Blacklist</h4>
                <p class="text-sm text-rose-600/80 font-bold leading-relaxed">{blacklistReason}</p>
                {#if blacklistEndDate}
                  <p class="text-[10px] font-black uppercase tracking-widest text-rose-500 mt-2">Fin de la restriction : {formatDate(blacklistEndDate)}</p>
                {:else}
                  <p class="text-[10px] font-black uppercase tracking-widest text-rose-500 mt-2">Restriction permanente</p>
                {/if}
              </div>
            </div>
          {/if}

          <!-- Warnings & Absences -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- Warnings Panel -->
            <div class="rounded-[2.5rem] bg-surface-container-low/40 border border-outline-variant/10 p-8 shadow-sm">
              <h4 class="text-sm font-black text-primary uppercase tracking-widest mb-6">Avertissements reçus</h4>
              {#if warnings.length > 0}
                <div class="space-y-4">
                  {#each warnings as warn}
                    <div class="p-4 rounded-2xl bg-surface-container-high/40 border border-outline-variant/5 {warn.isActive ? 'border-amber-500/10 bg-amber-500/5' : ''}">
                      <div class="flex items-center justify-between mb-2">
                        <span class="text-xs font-black uppercase tracking-wider {warn.isActive ? 'text-amber-500' : 'text-on-surface-variant/40'}">
                          {warn.isActive ? 'Actif' : 'Expiré'}
                        </span>
                        <span class="text-[9px] font-bold text-on-surface-variant/40">{formatDate(warn.createdAt)}</span>
                      </div>
                      <p class="text-sm font-bold text-on-surface">{warn.reason}</p>
                      {#if warn.expiresAt}
                        <p class="text-[9px] font-bold text-on-surface-variant/40 mt-2">Expire le : {formatDate(warn.expiresAt)}</p>
                      {/if}
                    </div>
                  {/each}
                </div>
              {:else}
                <p class="text-xs text-on-surface-variant/40 italic">Aucun avertissement inscrit au dossier.</p>
              {/if}
            </div>

            <!-- Absences Panel -->
            <div class="rounded-[2.5rem] bg-surface-container-low/40 border border-outline-variant/10 p-8 shadow-sm">
              <h4 class="text-sm font-black text-primary uppercase tracking-widest mb-6">Absences déclarées</h4>
              {#if absences.length > 0}
                <div class="space-y-4 max-h-80 overflow-y-auto pr-2">
                  {#each absences as abs}
                    <div class="p-4 rounded-2xl bg-surface-container-high/40 border border-outline-variant/5">
                      <div class="flex items-center justify-between mb-2">
                        <span class="text-xs font-black uppercase tracking-wider text-primary">{abs.type}</span>
                        <span class="inline-flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-[9px] font-black uppercase tracking-wider {abs.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-500' : (abs.status === 'PENDING' ? 'bg-amber-500/10 text-amber-500' : 'bg-on-surface/5 text-on-surface-variant/40')}">
                          {abs.status}
                        </span>
                      </div>
                      <p class="text-sm font-bold text-on-surface">{abs.reason}</p>
                      <p class="text-[9px] font-bold text-on-surface-variant/40 mt-2">
                        Du {formatDate(abs.startDate)} au {abs.isIndefinite ? 'Indéterminé' : formatDate(abs.endDate)}
                      </p>
                    </div>
                  {/each}
                </div>
              {:else}
                <p class="text-xs text-on-surface-variant/40 italic">Aucune absence enregistrée.</p>
              {/if}
            </div>
          </div>

          <!-- Testing Periods & Mentoring reports -->
          {#if testingPeriods.length > 0}
            <div class="rounded-[2.5rem] bg-surface-container-low/40 border border-outline-variant/10 p-8 shadow-sm">
              <h4 class="text-sm font-black text-primary uppercase tracking-widest mb-6">Périodes de test & Tutorat</h4>
              <div class="space-y-6">
                {#each testingPeriods as period}
                  <div class="p-6 rounded-3xl bg-surface-container-high/30 border border-outline-variant/5 space-y-4">
                    <div class="flex items-center justify-between border-b border-outline-variant/5 pb-4">
                      <div>
                        <span class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Objectif</span>
                        <h5 class="text-base font-black text-on-surface">{period.targetGrade || 'Grade Staff'}</h5>
                      </div>
                      <div class="text-right">
                        <span class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider {period.status === 'PASSED' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : (period.status === 'ONGOING' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 'bg-rose-500/10 text-rose-500 border border-rose-500/20')}">
                          {period.status === 'PASSED' ? 'Validé' : (period.status === 'ONGOING' ? 'En cours' : 'Échoué')}
                        </span>
                        <p class="text-[9px] font-bold text-on-surface-variant/40 mt-1">Début: {formatDate(period.startDate)}</p>
                      </div>
                    </div>

                    {#if period.mentor}
                      <p class="text-xs font-bold text-on-surface-variant">Mentor assigné : <span class="text-on-surface font-black">@{period.mentor.username}</span></p>
                    {/if}

                    {#if period.reports && period.reports.length > 0}
                      <div class="space-y-3 pt-2">
                        <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Rapports du mentor</p>
                        {#each period.reports as rep}
                          <div class="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/5">
                            <div class="flex items-center justify-between mb-1.5">
                              <span class="text-[9px] font-black uppercase tracking-wider {rep.type === 'POSITIVE' ? 'text-emerald-500' : (rep.type === 'NEGATIVE' ? 'text-rose-500' : 'text-on-surface-variant/40')}">
                                {rep.type}
                              </span>
                              <span class="text-[9px] font-bold text-on-surface-variant/30">{formatDate(rep.createdAt)}</span>
                            </div>
                            <p class="text-xs font-medium text-on-surface-variant">{rep.content}</p>
                          </div>
                        {/each}
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          <!-- Manager Notes Pane (only visible if manager/admin) -->
          {#if isRequesterManager}
            <div class="rounded-[2.5rem] bg-surface-container-low/40 border border-outline-variant/10 p-8 shadow-sm">
              <div class="flex items-center gap-3 mb-6">
                <div class="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <Papicon icon="ShieldCheck" size={20} />
                </div>
                <h4 class="text-sm font-black text-on-surface uppercase tracking-widest">Notes de Management & Suivi (Privé)</h4>
              </div>

              <!-- Notes List -->
              <div class="space-y-4 mb-6">
                {#each notesAbout as note}
                  <div class="p-4.5 rounded-2xl bg-surface-container-high/40 border border-outline-variant/5 flex justify-between items-start gap-4">
                    <div>
                      <p class="text-sm font-bold text-on-surface">{note.content}</p>
                      <p class="text-[9px] font-bold text-on-surface-variant/40 uppercase mt-2">
                        Posté le {formatDate(note.createdAt)} par @{note.author?.username || 'un manager'}
                      </p>
                    </div>
                    <button onclick={() => removeNote(note.id)} class="p-2 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-all">
                      <Papicon icon="Trash" size={14} />
                    </button>
                  </div>
                {:else}
                  <p class="text-xs text-on-surface-variant/40 italic">Aucune note de suivi renseignée.</p>
                {/each}
              </div>

              <!-- Add Note Form -->
              <div class="flex flex-col md:flex-row gap-4 items-end">
                <div class="flex-1 w-full">
                  <FormInput id="new-note" placeholder="Ajouter une note de suivi privée..." bind:value={newNoteContent} className="w-full" />
                </div>
                <button 
                  onclick={submitManagerNote} 
                  disabled={sendingNote || !newNoteContent.trim()}
                  class="w-full md:w-auto px-8 py-4 bg-primary text-on-primary hover:bg-primary-hover font-black uppercase tracking-widest text-[10px] rounded-2xl shadow-lg transition-all disabled:opacity-50"
                >
                  Ajouter Note
                </button>
              </div>
            </div>
          {/if}

        </div>

      {:else if activeTab === 'staff_activity' && staffMember}
        <!-- Activity Chart & Metrics -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
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

            {#if chartData}
              <div class="h-[300px] w-full">
                <Chart data={chartData} height={300} />
              </div>
            {:else}
              <div class="h-[300px] flex flex-col items-center justify-center text-center">
                <Papicon icon="BarChart" size={48} class="text-on-surface-variant/20 mb-4" />
                <p class="text-sm font-bold text-on-surface-variant/40">Pas assez de données d'activité.</p>
              </div>
            {/if}
          </div>

          <div class="space-y-6">
            <!-- Tools Bento Grid -->
            {#if accessibleTools.length > 0}
              <div class="rounded-[2.5rem] bg-surface-container-low/50 p-8 border border-outline-variant/10 shadow-sm">
                <h5 class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 mb-6">Outils Accessibles</h5>
                <div class="space-y-3">
                  {#each accessibleTools as tool}
                    <div class="flex items-center gap-3 p-3.5 rounded-xl bg-surface-container-high/60 border border-outline-variant/5">
                      <div class="w-8 h-8 rounded-lg bg-primary/5 text-primary flex items-center justify-center shrink-0">
                        <Papicon icon="Gears" size={16} />
                      </div>
                      <span class="text-xs font-black text-on-surface-variant">{tool}</span>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <div class="rounded-[2.5rem] bg-linear-to-br from-primary to-primary-container p-8 text-on-primary shadow-xl shadow-primary/20">
               <Papicon icon="Sparkles" size={32} class="mb-4 opacity-50" />
               <h5 class="text-lg font-black tracking-tight leading-tight mb-2">Activité Régulière</h5>
               <p class="text-xs font-bold opacity-80 leading-relaxed">Les statistiques d'activité sont synchronisées quotidiennement avec les logs du serveur Discord.</p>
            </div>
          </div>
        </div>

      {:else if activeTab === 'community_overview' && publicProfile}
        <!-- Community Profile View -->
        <div class="space-y-8">
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-6">
            <MetricCard label="Points" value={publicProfile.points?.toLocaleString() || '0'} note="Score global" icon="Trophy" toneClass="bg-amber-500/10 text-amber-500" />
            <MetricCard label="Badge / Tier" value={publicProfile.tier || 'Débutant'} note="Niveau actuel" icon="Zap" toneClass={`${getTierBg(publicProfile.tier)} ${getTierColor(publicProfile.tier)}`} />
            <MetricCard label="Série (Streak)" value={`${publicProfile.streak || 0}j`} note="Record actuel" icon="Flame" toneClass="bg-orange-500/10 text-orange-500" />
            <MetricCard label="Classement" value={publicProfile.rank !== undefined ? `${publicProfile.rank + 1}${getRankSuffix(publicProfile.rank + 1)}` : '—'} note="Position serveur" icon="Medal" toneClass="bg-purple-500/10 text-purple-500" />
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <!-- Left column bio/identity -->
            <div class="space-y-6">
              <div class="rounded-[2rem] bg-surface-container-low/40 border border-outline-variant/10 p-8 shadow-sm">
                <h4 class="text-xs font-black text-primary uppercase tracking-widest mb-4">Biographie</h4>
                <p class="text-sm text-on-surface-variant leading-relaxed">
                  {publicProfile.bio?.trim() || 'Aucune biographie rédigée.'}
                </p>
              </div>

              <div class="rounded-[2rem] bg-surface-container-low/40 border border-outline-variant/10 p-8 shadow-sm">
                <h4 class="text-xs font-black text-primary uppercase tracking-widest mb-6">Détails de Compte</h4>
                <div class="space-y-4">
                  <div class="flex items-center justify-between border-b border-outline-variant/5 pb-2">
                    <span class="text-xs font-bold text-on-surface-variant/40 uppercase tracking-wider">Création</span>
                    <span class="text-xs font-bold text-on-surface">{formatDate(publicProfile.accountCreatedAt)}</span>
                  </div>
                  <div class="flex items-center justify-between border-b border-outline-variant/5 pb-2">
                    <span class="text-xs font-bold text-on-surface-variant/40 uppercase tracking-wider">Arrivée</span>
                    <span class="text-xs font-bold text-on-surface">{formatDate(publicProfile.guildJoinedAt)}</span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-xs font-bold text-on-surface-variant/40 uppercase tracking-wider">Dernier message</span>
                    <span class="text-xs font-bold text-on-surface">{formatTimeAgo(publicProfile.lastSeenAt)}</span>
                  </div>
                </div>
              </div>

              {#if publicProfile.roles && publicProfile.roles.length > 0}
                <div class="rounded-[2rem] bg-surface-container-low/40 border border-outline-variant/10 p-8 shadow-sm">
                  <h4 class="text-xs font-black text-primary uppercase tracking-widest mb-4">Rôles</h4>
                  <div class="flex flex-wrap gap-2">
                    {#each publicProfile.roles as role}
                      <span class="inline-flex items-center gap-1.5 rounded-lg bg-surface-container-high/60 border border-outline-variant/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-on-surface-variant">
                        {role.name}
                      </span>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>

            <!-- Right column algo participations -->
            <div class="lg:col-span-2 space-y-6">
              <div class="rounded-[2.5rem] bg-surface-container-low/40 border border-outline-variant/10 p-10 shadow-sm">
                <div class="flex items-center gap-3.5 mb-8 border-b border-outline-variant/5 pb-6">
                  <div class="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center">
                    <Papicon icon="Terminal" size={24} />
                  </div>
                  <div>
                    <h3 class="text-xl font-black text-on-surface font-headline leading-tight">Défis Validés</h3>
                    <p class="text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-wider mt-0.5">Activité algorithmique récente</p>
                  </div>
                </div>

                {#if publicProfile.recentAlgos && publicProfile.recentAlgos.length > 0}
                  <div class="space-y-3.5">
                    {#each publicProfile.recentAlgos as algo}
                      <div class="flex items-center justify-between p-4.5 rounded-2xl bg-surface-container-high/30 border border-outline-variant/5 hover:border-primary/25 hover:bg-surface-container-high/60 transition-all group/item">
                        <div class="flex items-center gap-4">
                          <div class="w-10 h-10 rounded-lg bg-primary/5 text-primary flex items-center justify-center group-hover/item:scale-105 transition-transform">
                            <Papicon icon="Check" size={16} />
                          </div>
                          <div>
                            <h4 class="text-sm font-black text-on-surface leading-tight">{algo.title}</h4>
                            <p class="text-[9px] font-bold text-on-surface-variant/40 uppercase tracking-wider mt-0.5">Kotbo Engine</p>
                          </div>
                        </div>
                        <div class="text-right">
                          {#if algo.points !== null && algo.points !== undefined}
                            <span class="text-sm font-black text-emerald-400">+{algo.points} pts</span>
                          {:else}
                            <span class="text-[10px] font-bold text-emerald-400/80 uppercase">Validé</span>
                          {/if}
                          <p class="text-[9px] font-bold text-on-surface-variant/30 uppercase tracking-wider mt-0.5">{formatDate(algo.date)}</p>
                        </div>
                      </div>
                    {/each}
                  </div>
                {:else}
                  <div class="py-16 text-center opacity-30">
                    <Papicon icon="Terminal" size={48} class="mx-auto mb-4" />
                    <p class="text-sm font-black uppercase tracking-widest">Aucune soumission validée</p>
                  </div>
                {/if}
              </div>
            </div>
          </div>
        </div>

      {:else if activeTab === 'api_keys' && staffMember && isOwnProfile}
        <!-- API Keys Management Panel (Own profile only) -->
        <div class="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-8">
          <div class="rounded-[3rem] bg-surface-container-low/30 p-10 border border-outline-variant/10 shadow-sm">
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
              <div class="flex items-center gap-4">
                <div class="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                  <Papicon icon="Lock" size={24} />
                </div>
                <div>
                  <p class="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Sécurité</p>
                  <h4 class="text-2xl font-black text-on-surface font-headline">Clés API Personnelles</h4>
                </div>
              </div>
              <button 
                onclick={() => { showNewKeyForm = !showNewKeyForm; newKeyCreatedValue = ''; }}
                class="inline-flex items-center gap-2 rounded-2xl px-6 py-3.5 text-[10px] font-black uppercase tracking-widest transition-all {showNewKeyForm ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' : 'bg-primary text-on-primary shadow-lg shadow-primary/20 hover:scale-[1.02]'}"
              >
                <Papicon icon={showNewKeyForm ? 'Cross' : 'Plus'} size={14} />
                {showNewKeyForm ? 'Annuler' : 'Créer une clé'}
              </button>
            </div>

            {#if newKeyCreatedValue}
              <div class="mb-8 p-6 rounded-3xl bg-emerald-500/5 border border-emerald-500/20 animate-in zoom-in-95 duration-500">
                <h5 class="text-sm font-black text-emerald-500 mb-2">Votre clé API a été générée avec succès :</h5>
                <div class="flex items-center gap-3 bg-surface-container-high/60 px-4 py-3 rounded-2xl mb-4 border border-outline-variant/10">
                  <code class="text-xs font-mono font-bold text-on-surface break-all">{newKeyCreatedValue}</code>
                  <button 
                    onclick={() => copyToClipboard(newKeyCreatedValue, 'new-key')}
                    class="p-2 rounded-lg hover:bg-surface-container-high transition-colors text-on-surface-variant/40 hover:text-primary"
                  >
                    <Papicon icon="Paper" size={16} />
                  </button>
                </div>
                <p class="text-[10px] font-bold text-rose-500">
                  ⚠️ IMPORTANT : Copiez cette clé maintenant ! Elle ne sera plus jamais affichée à l'avenir pour des raisons de sécurité.
                </p>
              </div>
            {/if}

            {#if showNewKeyForm}
              <div class="mb-10 p-6 rounded-3xl bg-surface-container-high/40 border border-outline-variant/10 animate-in zoom-in-95 duration-500">
                <div class="flex flex-col md:flex-row gap-4 items-end">
                  <div class="flex-1 w-full">
                    <label for="key-name" class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 mb-2 block px-1">Nom descriptif de la clé</label>
                    <FormInput id="key-name" bind:value={newKeyName} placeholder="Mon script de backup..." className="w-full" />
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
                        <span class="text-[9px] font-bold text-on-surface-variant/40 uppercase">
                          Utilisée le {formatDate(key.lastUsedAt)}
                        </span>
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
                <p class="mt-1 text-sm font-bold text-on-surface-variant/30">Générez une clé API pour automatiser des requêtes Kotbo.</p>
              </div>
            {/if}
          </div>

          <div class="space-y-6">
            <div class="rounded-[2.5rem] bg-surface-container-low/50 p-8 border border-outline-variant/10 shadow-sm">
               <div class="flex items-center gap-3 mb-6">
                  <div class="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                    <Papicon icon="ShieldAlert" size={20} />
                  </div>
                  <h5 class="text-sm font-black uppercase tracking-widest text-on-surface">Sécurité des Clés API</h5>
               </div>
               <ul class="space-y-4">
                 <li class="flex gap-3 text-xs font-bold text-on-surface-variant/60 leading-relaxed">
                   <span class="text-amber-500">•</span>
                   Une clé compromise doit être immédiatement révoquée depuis cet espace.
                 </li>
                 <li class="flex gap-3 text-xs font-bold text-on-surface-variant/60 leading-relaxed">
                   <span class="text-amber-500">•</span>
                   Ne divulguez ou ne stockez jamais vos clés sur des dépôts de code publics.
                 </li>
               </ul>
            </div>
          </div>
        </div>
      {/if}

    </div>

  {/if}
</div>

<style>
  :global(.font-headline) {
    font-family: 'Outfit', 'Inter', sans-serif;
  }
</style>