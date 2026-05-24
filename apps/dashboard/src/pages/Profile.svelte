<script lang="ts">
  import { onMount } from 'svelte';
  import { router } from 'tinro';
  import Papicon from '../lib/components/Papicon.svelte';
  import DiscordMemberLookup from '../lib/components/DiscordMemberLookup.svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import { fetchStaffProfile } from '../lib/api';

  let currentUser = $state<any>(null);
  let profile = $state<any>(null);
  let loading = $state(true);
  let error = $state('');
  let activeTab = $state('overview');
  let searchUserId = $state('');
  let searchQuery = $state('');
  let searchSelectedId = $state('');
  let searchSelectedUsername = $state('');
  let searchSelectedAvatarUrl = $state('');

  const tabs = $derived([
    { id: 'overview', label: 'Vue d\'ensemble', icon: 'Grid' },
    { id: 'activity', label: 'Activité', icon: 'TrendingUp' },
    { id: 'discipline', label: 'Discipline', icon: 'ShieldAlert' },
    { id: 'tests', label: 'Tests', icon: 'ClipboardCheck' },
    { id: 'history', label: 'Historique', icon: 'History' },
  ]);

  function formatDate(value: string | Date | null | undefined) {
    if (!value) return '—';
    return new Date(value).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }

  function formatDuration(seconds: number | null | undefined) {
    if (!seconds || seconds <= 0) return '0m';
    const totalMinutes = Math.floor(seconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    const remainingMinutes = totalMinutes % 60;
    if (days > 0) return `${days}j ${remainingHours}h`;
    if (hours > 0) return `${hours}h ${remainingMinutes}m`;
    return `${remainingMinutes}m`;
  }

  function formatGrade(grade: string) {
    const value = grade.toLowerCase();
    if (value.includes('owner')) return '👑 Propriétaire';
    if (value.includes('admin')) return '⚙️ Admin';
    if (value.includes('moderator') || value.includes('mod')) return '🛡️ Modérateur';
    if (value.includes('helper')) return '🤝 Helper';
    return grade;
  }

  function getPrimaryRole(profileData: any) {
    return profileData?.primaryRole ?? profileData?.roles?.[0] ?? null;
  }

  function formatTestingPeriodStatus(status: string) {
    if (status === 'PASSED') return '✅ Validée';
    if (status === 'FAILED') return '❌ Échouée';
    return '⏳ En cours';
  }

  function normalizeDiscordUserId(value: string) {
    const trimmed = value.trim();
    const mentionMatch = trimmed.match(/^<@!?([0-9]+)>$/);
    if (mentionMatch) return mentionMatch[1];
    return trimmed;
  }

  function getSelectedUserId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('userId')?.trim() || currentUser?.id || authStore.user?.id || '';
  }

  async function loadProfile(userId: string) {
    if (!userId) return;

    loading = true;
    error = '';

    try {
      profile = await fetchStaffProfile(userId);
      searchUserId = userId;
      searchQuery = userId;
      searchSelectedId = userId;
    } catch (err: any) {
      error = err?.message || 'Impossible de charger le profil staff';
      profile = null;
    } finally {
      loading = false;
    }
  }

  async function reloadProfile() {
    await loadProfile(getSelectedUserId());
  }

  async function openUserProfile() {
    const trimmed = normalizeDiscordUserId(searchSelectedId || searchQuery || searchUserId);
    if (!trimmed) return;
    router.goto(`/profile?userId=${encodeURIComponent(trimmed)}`);
    await loadProfile(trimmed);
  }

  onMount(async () => {
    if (authStore.token) {
      const meResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/user/me`, {
        headers: { Authorization: `Bearer ${authStore.token}` },
      }).catch(() => null);

      if (meResponse?.ok) {
        currentUser = await meResponse.json();
      }
    }

    await loadProfile(getSelectedUserId());
  });
</script>

<div class="min-h-screen bg-surface-container-lowest pb-24">
  <div class="mx-auto max-w-7xl px-6 pt-10 md:pt-14">
    {#if loading}
      <div class="space-y-8 animate-pulse">
        <div class="h-72 rounded-[3rem] bg-surface-container-high"></div>
        <div class="grid gap-6 md:grid-cols-4">
          <div class="h-32 rounded-4xl bg-surface-container-high"></div>
          <div class="h-32 rounded-4xl bg-surface-container-high"></div>
          <div class="h-32 rounded-4xl bg-surface-container-high"></div>
          <div class="h-32 rounded-4xl bg-surface-container-high"></div>
        </div>
      </div>
    {:else if error}
      <div class="mx-auto flex max-w-2xl flex-col items-center justify-center rounded-[3rem] border border-rose-500/10 bg-rose-500/5 px-8 py-16 text-center">
        <div class="mb-6 flex h-20 w-20 items-center justify-center rounded-4xl bg-rose-500/10 text-rose-500">
          <Papicon icon="AlertTriangle" size={40} />
        </div>
        <h1 class="text-4xl font-black tracking-tight text-on-surface font-headline">Profil staff indisponible</h1>
        <p class="mt-4 max-w-lg text-base font-semibold text-on-surface-variant/70">{error}</p>
        <button onclick={() => router.goto('/')} class="mt-10 inline-flex items-center gap-3 rounded-2xl bg-surface-container-high px-6 py-4 text-xs font-black uppercase tracking-[0.2em] text-on-surface transition hover:bg-surface-container-highest">
          <Papicon icon="ArrowLeft" size={18} />
          Retour
        </button>
      </div>
    {:else if profile}
      <div class="overflow-hidden rounded-[3rem] border border-outline-variant/10 bg-surface-container-low shadow-2xl shadow-surface/20">
        <div class="relative h-56 bg-linear-to-br from-primary/25 via-primary/10 to-transparent md:h-72">
          {#if profile.publicProfile?.bannerUrl}
            <img src={profile.publicProfile.bannerUrl} alt="Bannière" class="h-full w-full object-cover" />
          {/if}
          <div class="absolute inset-0 bg-linear-to-b from-transparent via-surface-container-low/10 to-surface-container-lowest"></div>
          <div class="absolute right-6 top-6 rounded-full border border-white/15 bg-black/20 px-4 py-2 text-[10px] font-black uppercase tracking-[0.25em] text-white backdrop-blur-xl">
            Dashboard staff
          </div>
        </div>

        <div class="relative px-6 pb-8 md:px-10">
          <div class="-mt-20 flex flex-col gap-8 md:-mt-24 md:flex-row md:items-end md:justify-between">
            <div class="flex flex-col gap-6 md:flex-row md:items-end">
              <div class="relative shrink-0">
                <div class="absolute -inset-4 rounded-[2.75rem] bg-primary/20 blur-2xl"></div>
                <img src={profile.publicProfile?.avatarUrl ?? `https://cdn.discordapp.com/embed/avatars/0.png`} alt={profile.staffMember.displayName ?? profile.staffMember.username ?? 'Staff'} class="relative h-40 w-40 rounded-[2.5rem] border-8 border-surface-container-lowest object-cover shadow-2xl md:h-48 md:w-48" />
              </div>

              <div class="space-y-3 pb-2">
                <div>
                  <h1 class="text-4xl font-black tracking-tight text-on-surface md:text-6xl font-headline">{profile.staffMember.displayName ?? profile.publicProfile?.displayName ?? profile.staffMember.username}</h1>
                  <p class="mt-2 text-lg font-semibold text-on-surface-variant/60">{profile.publicProfile?.userTag ?? profile.staffMember.userTag ?? 'Tag Discord inconnu'} · {formatGrade(profile.staffMember.grade)}</p>
                </div>

                <div class="flex flex-wrap gap-2">
                  {#if getPrimaryRole(profile.publicProfile)}
                    <span class="inline-flex items-center gap-2 rounded-full border border-primary/10 bg-primary/5 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-primary">
                      <Papicon icon="Award" size={14} />
                      {getPrimaryRole(profile.publicProfile).name}
                    </span>
                    {#if (profile.publicProfile?.roles?.length ?? 0) > 1}
                      <span class="inline-flex items-center gap-2 rounded-full border border-outline-variant/10 bg-surface-container-high px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-on-surface-variant/60">
                        +{(profile.publicProfile?.roles?.length ?? 0) - 1} autre{(profile.publicProfile?.roles?.length ?? 0) > 2 ? 's' : ''} rôle{(profile.publicProfile?.roles?.length ?? 0) > 2 ? 's' : ''}
                      </span>
                    {/if}
                  {/if}
                </div>
              </div>
            </div>

            <div class="flex flex-wrap gap-3 pb-2">
              <button onclick={() => router.goto(`/profile/${profile.staffMember.userId}`)} class="inline-flex items-center gap-3 rounded-2xl border border-outline-variant/10 bg-surface-container-high px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-on-surface transition hover:bg-surface-container-highest">
                <Papicon icon="ExternalLink" size={18} />
                Profil public
              </button>
              <button onclick={() => router.goto(`/profile?userId=${profile.staffMember.userId}`)} class="inline-flex items-center gap-3 rounded-2xl bg-primary px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-white transition hover:scale-[1.01]">
                <Papicon icon="ShieldUser" size={18} />
                Vue staff
              </button>
            </div>
          </div>

          <div class="mt-8 grid gap-4 rounded-[2.25rem] border border-outline-variant/10 bg-surface-container-low/60 p-5 md:grid-cols-[1fr_auto] md:items-end md:p-6">
            <div>
              <p class="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Accès rapide</p>
              <div class="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
                <div class="w-full md:max-w-xl">
                  <DiscordMemberLookup
                    guildId={profile.staffMember.guildId}
                    bind:query={searchQuery}
                    bind:selectedId={searchSelectedId}
                    bind:selectedUsername={searchSelectedUsername}
                    bind:selectedAvatarUrl={searchSelectedAvatarUrl}
                    placeholder="@mention, pseudo ou ID Discord"
                    selectedIdPlaceholder="ID Discord du staff"
                    staffOnly={true}
                  />
                </div>
                <button onclick={openUserProfile} class="inline-flex items-center justify-center gap-3 rounded-2xl bg-on-surface px-5 py-4 text-xs font-black uppercase tracking-[0.18em] text-surface transition hover:opacity-95">
                  <Papicon icon="Search" size={18} />
                  Ouvrir
                </button>
              </div>
            </div>
            <div class="rounded-2xl bg-surface-container-high px-5 py-4 text-sm font-semibold text-on-surface-variant/75">
              {searchSelectedUsername ? `Sélection: ${searchSelectedUsername}` : profile.accessibleTools?.length ? `${profile.accessibleTools.length} outil(s) accessible(s)` : 'Aucun outil supplémentaire'}
            </div>
          </div>
        </div>
      </div>

      <div class="sticky top-4 z-30 mt-8 flex justify-center">
        <div class="flex flex-wrap justify-center gap-2 rounded-4xl border border-outline-variant/10 bg-surface-container-lowest/90 p-2 shadow-2xl backdrop-blur-xl">
          {#each tabs as tab}
            <button onclick={() => activeTab = tab.id} class="inline-flex items-center gap-3 rounded-3xl px-6 py-3 text-[11px] font-black uppercase tracking-[0.18em] transition {activeTab === tab.id ? 'bg-on-surface text-surface shadow-lg' : 'text-on-surface-variant/60 hover:bg-surface-container-high hover:text-on-surface'}">
              <Papicon icon={tab.icon} size={16} />
              {tab.label}
            </button>
          {/each}
        </div>
      </div>

      <div class="mt-10 space-y-8">
        {#if activeTab === 'overview'}
          <div class="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            <div class="rounded-[2.25rem] border border-outline-variant/10 bg-surface-container-low p-6">
              <p class="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Messages</p>
              <h3 class="mt-3 text-4xl font-black text-on-surface">{profile.stats.totalMessages.toLocaleString('fr-FR')}</h3>
              <p class="mt-2 text-sm font-semibold text-on-surface-variant/60">Messages cumulés</p>
            </div>
            <div class="rounded-[2.25rem] border border-outline-variant/10 bg-surface-container-low p-6">
              <p class="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Vocal</p>
              <h3 class="mt-3 text-4xl font-black text-on-surface">{profile.stats.totalVoiceMinutes.toLocaleString('fr-FR')}m</h3>
              <p class="mt-2 text-sm font-semibold text-on-surface-variant/60">Temps de présence vocal</p>
            </div>
            <div class="rounded-[2.25rem] border border-outline-variant/10 bg-surface-container-low p-6">
              <p class="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Warns</p>
              <h3 class="mt-3 text-4xl font-black text-on-surface">{profile.stats.activeWarnings}</h3>
              <p class="mt-2 text-sm font-semibold text-on-surface-variant/60">Avertissements actifs</p>
            </div>
            <div class="rounded-[2.25rem] border border-outline-variant/10 bg-surface-container-low p-6">
              <p class="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Sanctions</p>
              <h3 class="mt-3 text-4xl font-black text-on-surface">{profile.stats.sanctionsIssued}</h3>
              <p class="mt-2 text-sm font-semibold text-on-surface-variant/60">Warnings + blacklist</p>
            </div>
          </div>

          <div class="grid gap-6 lg:grid-cols-3">
            <div class="rounded-[2.5rem] border border-outline-variant/10 bg-surface-container-low p-8 lg:col-span-2">
              <div class="flex items-center gap-4">
                <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Papicon icon="User" size={22} /></div>
                <div>
                  <p class="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Contact</p>
                  <h2 class="text-2xl font-black text-on-surface">Informations staff</h2>
                </div>
              </div>

              <div class="mt-8 grid gap-6 md:grid-cols-2">
                <div>
                  <p class="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/40">Grade</p>
                  <p class="mt-2 text-base font-bold text-on-surface">{formatGrade(profile.staffMember.grade)}</p>
                </div>
                <div>
                  <p class="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/40">Depuis le grade actuel</p>
                  <p class="mt-2 text-base font-bold text-on-surface">{formatDuration(Date.now() - new Date(profile.staffMember.currentRoleStartedAt).getTime())}</p>
                </div>
                <div>
                  <p class="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/40">Entrée dans le staff</p>
                  <p class="mt-2 text-base font-bold text-on-surface">{formatDate(profile.staffMember.joinedStaffAt)}</p>
                </div>
                <div>
                  <p class="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/40">Dernière montée / descente</p>
                  <p class="mt-2 text-base font-bold text-on-surface">{profile.gradeHistory?.[0] ? formatDate(profile.gradeHistory[0].dateIso) : '—'}</p>
                </div>
              </div>

              <div class="mt-8 rounded-4xl border border-outline-variant/10 bg-surface-container-lowest/70 p-6">
                <p class="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Profil public lié</p>
                <p class="mt-3 text-sm font-semibold text-on-surface-variant/75">{profile.publicProfile?.bio || 'Aucune bio publique renseignée.'}</p>
              </div>
            </div>

            <div class="space-y-6">
              <div class="rounded-[2.5rem] border border-outline-variant/10 bg-linear-to-br from-primary to-primary-container p-8 text-on-primary shadow-xl shadow-primary/20">
                <p class="text-[10px] font-black uppercase tracking-[0.25em] text-white/70">Aperçu</p>
                <h3 class="mt-3 text-2xl font-black">Lecture rapide</h3>
                <div class="mt-6 space-y-3 text-sm font-semibold text-white/80">
                  <div class="flex items-center justify-between gap-4"><span>Notes écrites</span><strong>{profile.notesWritten.length}</strong></div>
                  <div class="flex items-center justify-between gap-4"><span>Notes reçues</span><strong>{profile.notesAbout.length}</strong></div>
                  <div class="flex items-center justify-between gap-4"><span>Périodes de test</span><strong>{profile.testingPeriods.length}</strong></div>
                  <div class="flex items-center justify-between gap-4"><span>Absences</span><strong>{profile.absences.length}</strong></div>
                </div>
              </div>

              <div class="rounded-[2.5rem] border border-outline-variant/10 bg-surface-container-low p-8">
                <p class="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Clés API</p>
                <div class="mt-4 space-y-3">
                  {#each profile.apiKeys.slice(0, 4) as key}
                    <div class="rounded-2xl border border-outline-variant/10 bg-surface-container-lowest/70 px-4 py-3 text-sm font-semibold text-on-surface-variant/75">{key.displayKey} · {key.name}</div>
                  {/each}
                  {#if profile.apiKeys.length === 0}
                    <p class="text-sm font-semibold text-on-surface-variant/45">Aucune clé API.</p>
                  {/if}
                </div>
              </div>
            </div>
          </div>
        {:else if activeTab === 'activity'}
          <div class="grid gap-6 lg:grid-cols-3">
            <div class="rounded-[2.5rem] border border-outline-variant/10 bg-surface-container-low p-8 lg:col-span-2">
              <div class="flex items-center gap-4">
                <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Papicon icon="TrendingUp" size={22} /></div>
                <div>
                  <p class="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Activité</p>
                  <h2 class="text-2xl font-black text-on-surface">Dernières actions</h2>
                </div>
              </div>

              <div class="mt-8 space-y-4">
                {#each profile.activities.slice(0, 12) as activity}
                  <div class="rounded-[1.75rem] border border-outline-variant/10 bg-surface-container-lowest/80 p-5">
                    <div class="flex items-start justify-between gap-4">
                      <div>
                        <p class="text-base font-black text-on-surface">{formatDate(activity.activityDate)}</p>
                        <p class="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant/45">Messages · Vocal</p>
                      </div>
                      <span class="rounded-full bg-primary/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-primary">{activity.messageCount} / {activity.voiceMinutes}m</span>
                    </div>
                  </div>
                {/each}
                {#if profile.activities.length === 0}
                  <div class="rounded-[1.75rem] border border-dashed border-outline-variant/20 bg-surface-container-lowest/70 p-10 text-center text-sm font-semibold text-on-surface-variant/45">Aucune activité staff enregistrée.</div>
                {/if}
              </div>
            </div>

            <div class="space-y-6">
              <div class="rounded-[2.5rem] border border-outline-variant/10 bg-surface-container-low p-8">
                <p class="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Synthèse</p>
                <div class="mt-5 space-y-4 text-sm font-semibold text-on-surface-variant/75">
                  <div class="flex items-center justify-between gap-4"><span>Messages</span><strong>{profile.stats.totalMessages.toLocaleString('fr-FR')}</strong></div>
                  <div class="flex items-center justify-between gap-4"><span>Vocal</span><strong>{profile.stats.totalVoiceMinutes.toLocaleString('fr-FR')}m</strong></div>
                  <div class="flex items-center justify-between gap-4"><span>Warns</span><strong>{profile.stats.activeWarnings}</strong></div>
                </div>
              </div>

              <div class="rounded-[2.5rem] border border-outline-variant/10 bg-surface-container-low p-8">
                <p class="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Période de test</p>
                <p class="mt-4 text-sm font-medium leading-6 text-on-surface-variant/70">{profile.testingPeriods.length ? 'Une ou plusieurs périodes de test existent pour ce membre.' : 'Aucune période de test enregistrée.'}</p>
              </div>
            </div>
          </div>
        {:else if activeTab === 'discipline'}
          <div class="grid gap-6 lg:grid-cols-3">
            <div class="rounded-[2.5rem] border border-outline-variant/10 bg-surface-container-low p-8 lg:col-span-2">
              <div class="flex items-center gap-4">
                <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Papicon icon="ShieldAlert" size={22} /></div>
                <div>
                  <p class="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Discipline</p>
                  <h2 class="text-2xl font-black text-on-surface">Warns et blacklist</h2>
                </div>
              </div>

              <div class="mt-8 space-y-4">
                {#each profile.warnings as warning}
                  <div class="rounded-[1.75rem] border border-outline-variant/10 bg-surface-container-lowest/80 p-5">
                    <div class="flex items-start justify-between gap-4">
                      <div>
                        <p class="text-base font-black text-on-surface">{warning.reason}</p>
                        <p class="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant/45">{formatDate(warning.createdAt)} · {warning.isActive ? 'Actif' : 'Inactif'}</p>
                      </div>
                      <span class="rounded-full bg-primary/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-primary">Warn</span>
                    </div>
                  </div>
                {/each}
                {#if profile.warnings.length === 0}
                  <div class="rounded-[1.75rem] border border-dashed border-outline-variant/20 bg-surface-container-lowest/70 p-10 text-center text-sm font-semibold text-on-surface-variant/45">Aucun avertissement staff enregistré.</div>
                {/if}
              </div>
            </div>

            <div class="space-y-6">
              <div class="rounded-[2.5rem] border border-outline-variant/10 bg-surface-container-low p-8">
                <p class="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Blacklist</p>
                {#if profile.activeBlacklist}
                  <p class="mt-4 text-sm font-semibold text-on-surface-variant/75">{profile.activeBlacklist.reason}</p>
                  <p class="mt-3 text-xs font-black uppercase tracking-[0.18em] text-primary">Depuis {formatDate(profile.activeBlacklist.startDate)}</p>
                {:else}
                  <p class="mt-4 text-sm font-semibold text-on-surface-variant/45">Aucune blacklist active.</p>
                {/if}
              </div>

              <div class="rounded-[2.5rem] border border-outline-variant/10 bg-surface-container-low p-8">
                <p class="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Absences</p>
                <p class="mt-4 text-sm font-semibold text-on-surface-variant/70">{profile.absences.length} absence(s) consignée(s).</p>
              </div>
            </div>
          </div>
        {:else if activeTab === 'tests'}
          <div class="grid gap-6 lg:grid-cols-3">
            <div class="rounded-[2.5rem] border border-outline-variant/10 bg-surface-container-low p-8 lg:col-span-2">
              <div class="flex items-center gap-4">
                <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Papicon icon="ClipboardCheck" size={22} /></div>
                <div>
                  <p class="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Tests</p>
                  <h2 class="text-2xl font-black text-on-surface">Périodes de test et rapports</h2>
                </div>
              </div>

              <div class="mt-8 space-y-4">
                {#each profile.testingPeriods as period}
                  <div class="rounded-[1.75rem] border border-outline-variant/10 bg-surface-container-lowest/80 p-5">
                    <div class="flex items-start justify-between gap-4">
                      <div>
                        <p class="text-base font-black text-on-surface">{formatTestingPeriodStatus(period.status)}</p>
                        <p class="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant/45">Début {formatDate(period.startDate)} · Cible {period.targetGrade ?? '—'}</p>
                      </div>
                      <span class="rounded-full bg-primary/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-primary">{period.plannedDurationDays}j</span>
                    </div>

                    <div class="mt-4 grid gap-3 md:grid-cols-2">
                      <div class="rounded-2xl bg-surface-container-low px-4 py-3 text-sm font-semibold text-on-surface-variant/75">Mentor: {period.mentor ? period.mentor.displayName ?? period.mentor.username : '—'}</div>
                      <div class="rounded-2xl bg-surface-container-low px-4 py-3 text-sm font-semibold text-on-surface-variant/75">Rapports: {period.reports?.length ?? 0}</div>
                    </div>
                  </div>
                {/each}

                {#if profile.testingPeriods.length === 0}
                  <div class="rounded-[1.75rem] border border-dashed border-outline-variant/20 bg-surface-container-lowest/70 p-10 text-center text-sm font-semibold text-on-surface-variant/45">Aucune période de test enregistrée.</div>
                {/if}
              </div>
            </div>

            <div class="space-y-6">
              <div class="rounded-[2.5rem] border border-outline-variant/10 bg-surface-container-low p-8">
                <p class="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Historique des rapports</p>
                <p class="mt-4 text-sm font-semibold text-on-surface-variant/70">Les rapports de tutorat et de suivi sont visibles dans les périodes détaillées.</p>
              </div>
            </div>
          </div>
        {:else if activeTab === 'history'}
          <div class="grid gap-6 lg:grid-cols-3">
            <div class="rounded-[2.5rem] border border-outline-variant/10 bg-surface-container-low p-8 lg:col-span-2">
              <div class="flex items-center gap-4">
                <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Papicon icon="History" size={22} /></div>
                <div>
                  <p class="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Historique</p>
                  <h2 class="text-2xl font-black text-on-surface">Grades et notes récentes</h2>
                </div>
              </div>

              <div class="mt-8 space-y-4">
                {#each profile.gradeHistory as entry}
                  <div class="rounded-[1.75rem] border border-outline-variant/10 bg-surface-container-lowest/80 p-5">
                    <p class="text-base font-black text-on-surface">{entry.action}</p>
                    <p class="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant/45">{formatDate(entry.dateIso)} · {entry.module}</p>
                    <p class="mt-3 text-sm font-medium leading-6 text-on-surface-variant/75">{entry.details}</p>
                  </div>
                {/each}

                {#if profile.gradeHistory.length === 0}
                  <div class="rounded-[1.75rem] border border-dashed border-outline-variant/20 bg-surface-container-lowest/70 p-10 text-center text-sm font-semibold text-on-surface-variant/45">Aucun historique de grade disponible.</div>
                {/if}
              </div>
            </div>

            <div class="space-y-6">
              <div class="rounded-[2.5rem] border border-outline-variant/10 bg-surface-container-low p-8">
                <p class="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Notes de management</p>
                <p class="mt-4 text-sm font-semibold text-on-surface-variant/70">{profile.notesAbout.length} note(s) reçue(s), {profile.notesWritten.length} note(s) rédigée(s).</p>
              </div>
              <div class="rounded-[2.5rem] border border-outline-variant/10 bg-surface-container-low p-8">
                <p class="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Raccourcis</p>
                <button onclick={() => router.goto(`/profile/${profile.staffMember.userId}`)} class="mt-4 inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-primary px-5 py-4 text-xs font-black uppercase tracking-[0.18em] text-white transition hover:scale-[1.01]">
                  <Papicon icon="ExternalLink" size={18} />
                  Voir le profil public
                </button>
              </div>
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  :global(.font-headline) {
    font-family: 'Outfit', 'Inter', sans-serif;
  }
</style>