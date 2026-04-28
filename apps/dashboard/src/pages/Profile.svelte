<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import { API_BASE_URL } from '../lib/api';
  import type { APIKey, StaffMember } from '../lib/types';
  import MetricCard from '../lib/components/MetricCard.svelte';
  import FormInput from '../lib/components/FormInput.svelte';
  import Papicon from '../lib/components/Papicon.svelte';

  let user: any = null;
  let staffMember: StaffMember | null = null;
  let apiKeys: APIKey[] = [];
  let isBlacklisted = false;
  let blacklistReason = '';
  let blacklistEndDate: string | null = null;
  let accessibleTools: string[] = [];
  let stats: any = null;
  let loading = true;
  let error = '';
  let showNewKeyForm = false;
  let newKeyName = 'Ma clé API';
  let copiedKeyId = '';

  const getUserAvatar = () => {
    if (staffMember?.avatarUrl) return staffMember.avatarUrl;
    if (!user?.id || !user?.avatar) return 'https://cdn.discordapp.com/embed/avatars/0.png';
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`;
  };

  const gradeIcon = (grade: string) => {
    const g = grade?.toLowerCase();
    if (g?.includes('admin')) return 'shield';
    if (g?.includes('mod')) return 'shield-check';
    if (g?.includes('dev')) return 'code';
    if (g?.includes('helper') || g?.includes('test')) return 'life-buoy';
    return 'badge';
  };

  const gradeColor = (grade: string) => {
    const g = grade?.toLowerCase();
    if (g?.includes('admin')) return 'from-rose-500 to-orange-500';
    if (g?.includes('mod')) return 'from-blue-500 to-indigo-500';
    if (g?.includes('dev')) return 'from-emerald-500 to-teal-500';
    return 'from-primary to-primary-container';
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
      if (!meRes.ok) {
        throw new Error('Impossible de récupérer le profil utilisateur');
      }
      const meData = await meRes.json();
      user = meData;

      // Récupérer le profil staff et les clés API
      const profileRes = await fetch(`${API_BASE_URL}/api/dashboard/users/${meData.id}/profile`, {
        headers: { Authorization: `Bearer ${authStore.token}` }
      });
      if (!profileRes.ok) {
        throw new Error('Impossible de récupérer le profil staff');
      }
      const profileData = await profileRes.json();
      staffMember = profileData.staffMember;
      apiKeys = profileData.apiKeys || [];
      isBlacklisted = profileData.isBlacklisted;
      blacklistReason = profileData.blacklistReason;
      blacklistEndDate = profileData.blacklistEndDate;
      accessibleTools = profileData.accessibleTools || [];

      // Récupérer les stats
      if (staffMember) {
        const statsRes = await fetch(`${API_BASE_URL}/api/dashboard/users/${meData.id}/staff-stats`, {
          headers: { Authorization: `Bearer ${authStore.token}` }
        });
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          stats = statsData.stats;
        }
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
      const keysRes = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${staffMember.guildId}/api-keys`, {
        headers: { Authorization: `Bearer ${authStore.token}` }
      });
      const keysData = await keysRes.json();
      apiKeys = keysData.keys;
      showNewKeyForm = false;
      newKeyName = 'Ma clé API';
    } catch (err) {
      console.error('Erreur:', err);
      alert('Erreur lors de la création de la clé API');
    }
  }

  async function deleteAPIKey(keyId: string) {
    if (!staffMember || !confirm('Tu es sûr de vouloir supprimer cette clé API?')) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${staffMember.guildId}/api-keys/${keyId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authStore.token}` }
      });

      if (!res.ok) throw new Error('Erreur lors de la suppression');

      // Recharger les clés API
      const keysRes = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${staffMember.guildId}/api-keys`, {
        headers: { Authorization: `Bearer ${authStore.token}` }
      });
      const keysData = await keysRes.json();
      apiKeys = keysData.keys;
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
</script>

<div class="space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-1000">
  {#if loading}
    <div class="flex flex-col gap-10 animate-pulse w-full">
      <div class="h-48 w-full bg-surface-variant/30 rounded-[3rem]"></div>
      <div class="flex flex-col md:flex-row gap-8">
         <div class="h-[60vh] w-full md:w-1/3 bg-surface-variant/30 rounded-[3rem]"></div>
         <div class="h-[60vh] w-full md:w-2/3 bg-surface-variant/30 rounded-[3rem]"></div>
      </div>
    </div>
  {:else if error}
    <div class="rounded-3xl border border-rose-500/20 bg-rose-500/10 px-8 py-6 text-center">
      <Papicon icon="alert-circle" size={40} class="text-rose-500 mx-auto" />
      <p class="mt-3 text-lg font-bold text-rose-700">{error}</p>
    </div>
  {:else if user && staffMember}

    <!-- ── Hero Section ──────────────────────────────────────── -->
    <div class="rounded-[3rem] border border-outline-variant/20 bg-linear-to-br from-surface-container/90 via-surface-container-low/80 to-surface-container/50 p-8 md:p-10 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl overflow-hidden relative">
      <!-- Background gradient orb -->
      <div class="absolute -top-32 -right-32 w-80 h-80 bg-linear-to-br {gradeColor(staffMember.grade)} rounded-full blur-[120px] opacity-20 pointer-events-none"></div>

      <div class="relative flex flex-col gap-8 xl:flex-row xl:items-center xl:justify-between">
        <div class="flex items-center gap-8">
          <!-- Avatar -->
          <div class="relative shrink-0">
            <div class="absolute -inset-2 bg-linear-to-br {gradeColor(staffMember.grade)} rounded-3xl blur-xl opacity-40 animate-pulse"></div>
            <div class="relative w-24 h-24 md:w-28 md:h-28 rounded-3xl border-4 border-surface-container-lowest shadow-2xl overflow-hidden">
              <img src={getUserAvatar()} alt="Avatar" class="w-full h-full object-cover" />
            </div>
          </div>

          <div class="space-y-3">
            <div>
              <p class="text-[10px] font-black uppercase tracking-[0.3em] text-primary mb-1">Espace Personnel</p>
              <h2 class="text-3xl md:text-5xl font-black text-on-surface tracking-tighter font-headline leading-tight">
                {staffMember.displayName || staffMember.username || user.username}
              </h2>
              <p class="text-sm text-on-surface-variant/80 mt-1">@{user.username} • Identifiant: <span class="font-mono text-[10px] opacity-60">{user.id}</span></p>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <span class="inline-flex items-center gap-2 rounded-full bg-linear-to-r {gradeColor(staffMember.grade)} px-4 py-2 text-xs font-black text-white shadow-lg uppercase tracking-widest font-headline">
                <Papicon icon={gradeIcon(staffMember.grade)} size={16} />
                {staffMember.grade}
              </span>
              {#if isBlacklisted}
                <span class="inline-flex items-center gap-2 rounded-full bg-rose-500/10 border border-rose-500/20 px-4 py-2 text-xs font-black text-rose-700 uppercase tracking-widest">
                  <Papicon icon="slash" size={16} />
                  Blacklisté
                </span>
              {/if}
            </div>
          </div>
        </div>

        <div class="flex items-center gap-4">
          <a href="/profile/{user.id}" class="inline-flex items-center gap-2 rounded-2xl border border-outline-variant/20 bg-white/5 hover:bg-white/10 px-6 py-3 text-xs font-black uppercase tracking-widest text-on-surface-variant transition-all hover:scale-[1.05] active:scale-[0.95]">
            <Papicon icon="eye" size={18} />
            Voir mon profil public
          </a>
        </div>
      </div>

      {#if isBlacklisted}
        <div class="mt-6 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-5 py-4">
          <div class="flex items-start gap-3">
            <Papicon icon="alert-triangle" size={20} class="text-rose-500 shrink-0 mt-0.5" />
            <div>
              <p class="text-sm font-bold text-rose-700">Compte blacklisté</p>
              <p class="text-xs text-rose-600 mt-1">{blacklistReason}</p>
              {#if blacklistEndDate}
                <p class="text-xs text-rose-500/70 mt-1">Jusqu'au {formatDate(blacklistEndDate)}</p>
              {:else}
                <p class="text-xs text-rose-500/70 mt-1 italic">Permanent</p>
              {/if}
            </div>
          </div>
        </div>
      {/if}
    </div>

    <!-- ── Stats Grid ──────────────────────────────────────── -->
    {#if stats}
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Messages" value={`${stats.totalMessages ?? 0}`} note="total envoyés" icon="message-square" toneClass="bg-primary/10 text-primary" />
        <MetricCard label="Vocal" value={`${stats.totalVoiceMinutes ?? 0} min`} note="temps vocal" icon="mic" toneClass="bg-secondary/10 text-secondary" />
        <MetricCard label="Avertissements" value={`${stats.activeWarnings ?? 0}`} note="actifs" icon="alert-triangle" toneClass="bg-amber-500/10 text-amber-700" />
        <MetricCard label="Sanctions" value={`${stats.sanctionsIssued ?? 0}`} note="émises" icon="hammer" toneClass="bg-emerald-500/10 text-emerald-700" />
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="stat-kpi">
          <div class="flex items-center gap-3 mb-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600">
              <Papicon icon="clock" size={20} />
            </div>
            <p class="section-label">Rapports en attente</p>
          </div>
          <p class="text-3xl font-black text-on-surface tracking-tight">{stats.pendingReports ?? 0}</p>
        </div>
        <div class="stat-kpi">
          <div class="flex items-center gap-3 mb-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
              <Papicon icon="calendar" size={20} />
            </div>
            <p class="section-label">Staff depuis</p>
          </div>
          <p class="text-lg font-black text-on-surface tracking-tight">{formatDate(stats.joinedStaffAt)}</p>
        </div>
        <div class="stat-kpi">
          <div class="flex items-center gap-3 mb-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600">
              <Papicon icon="trending-up" size={20} />
            </div>
            <p class="section-label">Grade depuis</p>
          </div>
          <p class="text-lg font-black text-on-surface tracking-tight">{formatDate(stats.currentRoleStartedAt)}</p>
        </div>
      </div>
    {/if}

    <!-- ── Tools & API Keys ──────────────────────────────────── -->
    <div class="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-8 items-start">

      <!-- API Keys -->
      <div class="premium-card rounded-[2.5rem] overflow-hidden">
        <div class="p-6 md:p-8">
          <div class="flex items-center justify-between gap-4 mb-6">
            <div class="flex items-center gap-3">
              <div class="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                <Papicon icon="key" size={24} />
              </div>
              <div>
                <p class="text-[10px] font-black uppercase tracking-[0.25em] text-on-surface-variant/70">Développement</p>
                <h3 class="text-lg font-black tracking-tighter text-on-surface">Mes Clés API</h3>
              </div>
            </div>
            <button 
              onclick={() => showNewKeyForm = !showNewKeyForm} 
              class="inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-widest transition-all {showNewKeyForm ? 'bg-rose-500/10 text-rose-700 border border-rose-500/20 hover:bg-rose-500/20' : 'bg-primary text-on-primary shadow-lg shadow-primary/20 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]'}"
            >
              <Papicon icon={showNewKeyForm ? 'x' : 'plus'} size={18} />
              {showNewKeyForm ? 'Annuler' : 'Nouvelle clé'}
            </button>
          </div>

          {#if showNewKeyForm}
            <div class="flex gap-3 items-end mb-6 p-4 rounded-2xl border border-outline-variant/20 bg-surface-container-low/60">
              <div class="flex-1">
                <label for="new-api-key-name" class="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1 block">Nom de la clé</label>
                <FormInput id="new-api-key-name" bind:value={newKeyName} type="text" placeholder="Ma clé API" className="w-full" />
              </div>
              <button 
                onclick={createNewAPIKey} 
                class="inline-flex items-center gap-2 rounded-xl bg-emerald-600 text-white px-5 py-3 text-xs font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 hover:bg-emerald-700 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                <Papicon icon="check" size={18} />
                Créer
              </button>
            </div>
          {/if}

          {#if apiKeys.length > 0}
            <div class="space-y-3">
              {#each apiKeys as key (key.id)}
                <div class="flex items-center justify-between gap-4 rounded-2xl border border-outline-variant/15 bg-surface-container-low/60 p-4 transition-all hover:border-primary/20 hover:shadow-sm group">
                  <div class="min-w-0 flex-1 space-y-1.5">
                    <div class="flex items-center gap-3">
                      <span class="text-sm font-black text-on-surface">{key.name}</span>
                      <div class="flex items-center gap-1.5">
                        {#each key.permissions as perm}
                          <span class="badge badge-info">{perm}</span>
                        {/each}
                      </div>
                    </div>
                    <div class="flex items-center gap-3">
                      <code class="text-xs font-mono text-on-surface-variant/75 bg-surface-container rounded px-2 py-0.5">{key.displayKey}</code>
                      <button
                        type="button"
                        onclick={() => copyToClipboard(key.displayKey, key.id)}
                        class="text-on-surface-variant/70 hover:text-primary transition-colors"
                        title="Copier"
                      >
                                                  <Papicon icon={copiedKeyId === key.id ? 'check' : 'copy'} size={14} />
                      </button>
                    </div>
                    {#if key.lastUsedAt}
                      <p class="text-[10px] text-on-surface-variant/70">Dernière utilisation : {formatDate(key.lastUsedAt)}</p>
                    {/if}
                  </div>
                  <button 
                    onclick={() => deleteAPIKey(key.id)} 
                    class="inline-flex items-center gap-1 rounded-xl border border-rose-500/20 bg-rose-500/8 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-rose-700 opacity-0 group-hover:opacity-100 transition-all hover:bg-rose-600 hover:text-white hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <Papicon icon="trash-2" size={12} />
                    Supprimer
                  </button>
                </div>
              {/each}
            </div>
          {:else}
            <div class="flex flex-col items-center justify-center p-12 text-center">
              <div class="w-16 h-16 rounded-3xl bg-primary/8 text-primary flex items-center justify-center shadow-inner">
                <Papicon icon="key" size={32} />
              </div>
              <h4 class="mt-4 text-lg font-black tracking-tighter text-on-surface">Aucune clé API</h4>
              <p class="mt-2 max-w-sm text-sm leading-relaxed text-on-surface-variant/75">
                Crée une nouvelle clé pour utiliser l'API Kotbo et intégrer tes propres outils.
              </p>
            </div>
          {/if}
        </div>
      </div>

      <!-- Accessible Tools Sidebar -->
      <div class="space-y-6">
        {#if accessibleTools.length > 0}
          <div class="premium-card rounded-[2.5rem] p-6 space-y-5">
            <div class="flex items-center gap-3">
              <div class="w-11 h-11 rounded-2xl bg-secondary/10 text-secondary flex items-center justify-center">
                <Papicon icon="tool" size={24} />
              </div>
              <div>
                <p class="text-[10px] font-black uppercase tracking-[0.25em] text-on-surface-variant/70">Accès</p>
                <h3 class="text-lg font-black tracking-tighter text-on-surface">Outils disponibles</h3>
              </div>
            </div>
            <div class="flex flex-wrap gap-2">
              {#each accessibleTools as tool}
                <span class="inline-flex items-center gap-2 rounded-full border border-secondary/20 bg-secondary/8 px-4 py-2 text-xs font-black uppercase tracking-widest text-secondary">
                  <Papicon icon="check-circle" size={14} />
                  {tool}
                </span>
              {/each}
            </div>
          </div>
        {/if}

        <div class="premium-card rounded-[2.5rem] p-6 space-y-4">
          <div class="flex items-center gap-3">
            <div class="w-11 h-11 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <Papicon icon="info" size={24} />
            </div>
            <div>
              <p class="text-[10px] font-black uppercase tracking-[0.25em] text-on-surface-variant/70">Information</p>
              <h3 class="text-lg font-black tracking-tighter text-on-surface">À propos</h3>
            </div>
          </div>
          <div class="space-y-3 text-sm leading-relaxed text-on-surface-variant/70">
            <p>Ce profil affiche vos informations de staff et vos statistiques sur le serveur.</p>
            <p>Les clés API permettent d'interagir programmatiquement avec les services Kotbo.</p>
          </div>
          <div class="grid gap-3">
            <div class="rounded-3xl border border-outline-variant/15 bg-surface-container-low/70 p-4">
              <p class="text-[10px] font-black uppercase tracking-[0.22em] text-on-surface-variant/70">Identifiant</p>
              <p class="mt-1 text-sm font-bold text-on-surface font-mono">{user.id}</p>
            </div>
            <div class="rounded-3xl border border-outline-variant/15 bg-surface-container-low/70 p-4">
              <p class="text-[10px] font-black uppercase tracking-[0.22em] text-on-surface-variant/40">Serveur</p>
              <p class="mt-1 text-sm font-bold text-on-surface">{staffMember.guildId}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

  {:else}
    <div class="flex flex-col items-center justify-center py-24 text-center">
      <div class="w-20 h-20 rounded-4xl bg-amber-500/10 text-amber-500 flex items-center justify-center shadow-inner">
        <Papicon icon="user-x" size={40} />
      </div>
      <h3 class="mt-6 text-2xl font-black tracking-tighter text-on-surface">Aucun profil staff trouvé</h3>
      <p class="mt-3 max-w-xl text-sm leading-relaxed text-on-surface-variant/65">
        Vous n'êtes pas enregistré comme membre du staff sur ce serveur. Contactez un administrateur pour être ajouté.
      </p>
      <div class="mt-10">
        <a href="/profile/{user?.id || ''}" class="inline-flex items-center gap-2 rounded-2xl bg-primary px-8 py-4 text-sm font-black uppercase tracking-widest text-on-primary shadow-xl shadow-primary/20 transition-all hover:scale-[1.05] active:scale-[0.95]">
          <Papicon icon="user" size={20} />
          Voir mon profil public
        </a>
      </div>
    </div>
  {/if}
</div>
