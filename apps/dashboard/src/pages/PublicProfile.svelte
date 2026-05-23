<script lang="ts">
  import { onMount } from 'svelte';
  import { router } from 'tinro';
  import Papicon from '../lib/components/Papicon.svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import { fetchPublicProfile, updatePublicProfile } from '../lib/api';

  interface Props {
    userId: string;
  }

  let { userId }: Props = $props();

  let profile = $state<any>(null);
  let loading = $state(true);
  let error = $state('');
  let activeTab = $state('overview');
  let bioDraft = $state('');
  let privacyDraft = $state(false);
  let saving = $state(false);
  let saveMessage = $state('');

  const isSelf = $derived(authStore.user?.id === userId);
  const canEdit = $derived(!!authStore.token && isSelf);

  const tabs = $derived([
    { id: 'overview', label: 'Vue d\'ensemble', icon: 'Grid' },
    { id: 'activity', label: 'Activité', icon: 'TrendingUp' },
    { id: 'events', label: 'Événements', icon: 'Calendar' },
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

  function formatRank(rank: number | null | undefined) {
    if (!rank) return '—';
    if (rank === 1) return '🥇 #1';
    if (rank === 2) return '🥈 #2';
    if (rank === 3) return '🥉 #3';
    return `#${rank}`;
  }

  function formatEventType(eventType: string) {
    const upper = eventType.toUpperCase();
    if (upper.includes('QUIZ')) return 'Quiz';
    if (upper.includes('GAME')) return 'Jeu';
    if (upper.includes('TALK')) return 'Talk';
    return eventType;
  }

  function getPrimaryRole(profile: any) {
    return profile?.primaryRole ?? profile?.roles?.[0] ?? null;
  }

  async function refreshProfile() {
    loading = true;
    error = '';

    try {
      profile = await fetchPublicProfile(userId);
      bioDraft = profile.bio ?? '';
      privacyDraft = !!profile.isPrivate;
    } catch (err: any) {
      error = err?.message || 'Erreur lors du chargement du profil';
    } finally {
      loading = false;
    }
  }

  onMount(refreshProfile);

  async function saveProfileSettings() {
    if (!canEdit || !profile) return;
    saving = true;
    saveMessage = '';

    try {
      const response = await updatePublicProfile(userId, {
        bio: bioDraft.trim() ? bioDraft.trim() : null,
        isProfilePrivate: privacyDraft,
      });

      profile.bio = response.profile.bio;
      profile.isPrivate = response.profile.isProfilePrivate;
      saveMessage = 'Profil mis à jour.';
    } catch (err: any) {
      saveMessage = err?.message || 'Impossible de sauvegarder le profil.';
    } finally {
      saving = false;
    }
  }
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
        <h1 class="text-4xl font-black tracking-tight text-on-surface font-headline">Profil introuvable</h1>
        <p class="mt-4 max-w-lg text-base font-semibold text-on-surface-variant/70">{error}</p>
        <button onclick={() => router.goto('/')} class="mt-10 inline-flex items-center gap-3 rounded-2xl bg-surface-container-high px-6 py-4 text-xs font-black uppercase tracking-[0.2em] text-on-surface transition hover:bg-surface-container-highest">
          <Papicon icon="ArrowLeft" size={18} />
          Retour
        </button>
      </div>
    {:else if profile}
      <div class="overflow-hidden rounded-[3rem] border border-outline-variant/10 bg-surface-container-low shadow-2xl shadow-surface/20">
        <div class="relative h-56 bg-linear-to-br from-primary/20 via-primary/5 to-transparent md:h-72">
          {#if profile.banner}
            <img src={profile.banner} alt="Bannière" class="h-full w-full object-cover" />
          {/if}
          <div class="absolute inset-0 bg-linear-to-b from-transparent via-surface-container-low/20 to-surface-container-lowest"></div>
          <div class="absolute right-6 top-6 rounded-full border border-white/15 bg-black/20 px-4 py-2 text-[10px] font-black uppercase tracking-[0.25em] text-white backdrop-blur-xl">
            {#if profile.isPrivate}
              Profil privé
            {:else}
              Profil public
            {/if}
          </div>
        </div>

        <div class="relative px-6 pb-8 md:px-10">
          <div class="-mt-20 flex flex-col gap-8 md:-mt-24 md:flex-row md:items-end md:justify-between">
            <div class="flex flex-col gap-6 md:flex-row md:items-end">
              <div class="relative shrink-0">
                <div class="absolute -inset-4 rounded-[2.75rem] bg-primary/20 blur-2xl"></div>
                <img src={profile.avatar} alt={profile.displayName || profile.username} class="relative h-40 w-40 rounded-[2.5rem] border-8 border-surface-container-lowest object-cover shadow-2xl md:h-48 md:w-48" />
              </div>

              <div class="space-y-3 pb-2">
                <div>
                  <h1 class="text-4xl font-black tracking-tight text-on-surface md:text-6xl font-headline">{profile.displayName || profile.globalName || profile.username}</h1>
                  <p class="mt-2 text-lg font-semibold text-on-surface-variant/60">@{profile.username} · {profile.globalName || 'Nom global inconnu'}</p>
                </div>

                <div class="flex flex-wrap gap-2">
                  {#if getPrimaryRole(profile)}
                    <span class="inline-flex items-center gap-2 rounded-full border border-primary/10 bg-primary/5 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-primary">
                      <Papicon icon="Award" size={14} />
                      {getPrimaryRole(profile).name}
                    </span>
                    {#if (profile.roles?.length ?? 0) > 1}
                      <span class="inline-flex items-center gap-2 rounded-full border border-outline-variant/10 bg-surface-container-high px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-on-surface-variant/60">
                        +{(profile.roles?.length ?? 0) - 1} autre{(profile.roles?.length ?? 0) > 2 ? 's' : ''} rôle{(profile.roles?.length ?? 0) > 2 ? 's' : ''}
                      </span>
                    {/if}
                  {/if}
                </div>
              </div>
            </div>

            <div class="flex flex-wrap gap-3 pb-2">
              {#if authStore.token}
                <button onclick={() => router.goto(`/profile?userId=${userId}`)} class="inline-flex items-center gap-3 rounded-2xl border border-outline-variant/10 bg-surface-container-high px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-on-surface transition hover:bg-surface-container-highest">
                  <Papicon icon="ShieldUser" size={18} />
                  Vue staff
                </button>
              {/if}
              <span class="inline-flex items-center gap-3 rounded-2xl bg-surface-container-high px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-on-surface-variant/70">
                <Papicon icon="Sparkles" size={18} />
                {profile.isPrivate ? 'Visible au staff seulement' : 'Visible à tous'}
              </span>
            </div>
          </div>

          {#if profile.bio || canEdit}
            <div class="mt-8 rounded-[2.25rem] border border-outline-variant/10 bg-surface-container-low/60 p-6 md:p-8">
              <div class="flex items-center gap-3">
                <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Papicon icon="FileText" size={22} />
                </div>
                <div>
                  <p class="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Bio</p>
                  <h2 class="text-xl font-black text-on-surface">Présentation du membre</h2>
                </div>
              </div>

              {#if canEdit}
                <div class="mt-5 space-y-4">
                  <textarea bind:value={bioDraft} rows="4" class="w-full rounded-3xl border border-outline-variant/10 bg-surface-container-high px-5 py-4 text-sm font-medium text-on-surface outline-none transition focus:border-primary/40" placeholder="Décris-toi en quelques mots."></textarea>
                  <label class="flex items-center gap-3 text-sm font-semibold text-on-surface-variant/80">
                    <input type="checkbox" bind:checked={privacyDraft} class="h-5 w-5 rounded border-outline-variant/20 text-primary focus:ring-primary" />
                    Rendre ce profil privé pour les membres non staff
                  </label>
                  <div class="flex flex-wrap items-center gap-3">
                    <button onclick={saveProfileSettings} disabled={saving} class="inline-flex items-center gap-3 rounded-2xl bg-primary px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-white transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60">
                      <Papicon icon="Save" size={18} />
                      {saving ? 'Sauvegarde...' : 'Enregistrer'}
                    </button>
                    {#if saveMessage}
                      <p class="text-sm font-semibold text-on-surface-variant/70">{saveMessage}</p>
                    {/if}
                  </div>
                </div>
              {:else}
                <p class="mt-4 max-w-4xl text-base leading-7 font-medium text-on-surface-variant/75">{profile.bio || 'Aucune bio renseignée pour le moment.'}</p>
              {/if}
            </div>
          {/if}
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
          <div class="space-y-6">
            <div class="rounded-[2.5rem] border border-outline-variant/10 bg-surface-container-low p-6">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Activité</p>
                  <h3 class="mt-2 text-2xl font-black text-on-surface">Activité agrégée</h3>
                  <p class="mt-1 text-sm text-on-surface-variant/60">Graphique d'activité sur les serveurs où le bot est présent (14 derniers jours).</p>
                </div>
              </div>
              <div class="mt-6">
                <img alt="Graphique d'activité" src={`/api/public/profile/${userId}/activity-image?days=14`} class="w-full rounded-md shadow-md" />
              </div>
            </div>

            <div class="grid gap-6 lg:grid-cols-3">
              <div class="rounded-[2.5rem] border border-outline-variant/10 bg-surface-container-low p-8 lg:col-span-2">
                <div class="flex items-center gap-4">
                  <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Papicon icon="User" size={22} />
                  </div>
                  <div>
                    <p class="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Informations</p>
                    <h2 class="text-2xl font-black text-on-surface">Dossier public</h2>
                  </div>
                </div>

                <div class="mt-8 grid gap-6 md:grid-cols-2">
                  <div>
                    <p class="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/40">Compte</p>
                    <p class="mt-2 text-base font-bold text-on-surface">Créé le {formatDate(profile.accountCreatedAt)}</p>
                  </div>
                  <div>
                    <p class="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/40">Arrivée serveur</p>
                    <p class="mt-2 text-base font-bold text-on-surface">{formatDate(profile.guildJoinedAt)}</p>
                  </div>
                  <div>
                    <p class="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/40">Dernière activité</p>
                    <p class="mt-2 text-base font-bold text-on-surface">{formatDate(profile.lastSeenAt)}</p>
                  </div>
                  <div>
                    <p class="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/40">Invitation</p>
                    <p class="mt-2 text-base font-bold text-on-surface">{profile.invite ? `${profile.invite.inviterTag ?? profile.invite.inviterId ?? 'Inconnu'} · ${profile.invite.inviteCode ?? '—'}` : 'Aucune donnée'}</p>
                  </div>
                </div>

                <div class="mt-8 rounded-4xl border border-outline-variant/10 bg-surface-container-lowest/70 p-6">
                  <p class="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Badges</p>
                  <div class="mt-4 flex flex-wrap gap-3">
                    {#each profile.roles || [] as role}
                      <span class="rounded-full border border-primary/10 bg-primary/5 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-primary">{role.name}</span>
                    {/each}
                    {#if !profile.roles || profile.roles.length === 0}
                      <span class="text-sm font-semibold text-on-surface-variant/50">Aucun badge enregistré</span>
                    {/if}
                  </div>
                </div>
              </div>

              <div class="space-y-6">
                <div class="rounded-[2.5rem] border border-outline-variant/10 bg-surface-container-low p-8">
                  <p class="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Présence</p>
                  <div class="mt-5 space-y-4 text-sm font-semibold text-on-surface-variant/75">
                    <div class="flex items-center justify-between gap-4"><span>Messages</span><strong>{profile.messageCount?.toLocaleString('fr-FR') ?? '0'}</strong></div>
                    <div class="flex items-center justify-between gap-4"><span>Vocal</span><strong>{formatDuration(profile.voiceTimeSeconds)}</strong></div>
                    <div class="flex items-center justify-between gap-4"><span>Version privée</span><strong>{profile.isPrivate ? 'Oui' : 'Non'}</strong></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        {:else if activeTab === 'activity'}
          <div class="space-y-6">
            <div class="rounded-[2.5rem] border border-outline-variant/10 bg-surface-container-low p-6 lg:col-span-2">
              <div class="flex items-center gap-4">
                <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Papicon icon="TrendingUp" size={22} /></div>
                <div>
                  <p class="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Activité</p>
                  <h2 class="text-2xl font-black text-on-surface">Graphiques d'activité</h2>
                </div>
              </div>

              <div class="mt-6">
                <img alt="Graphique d'activité" src={`/api/public/profile/${userId}/activity-image?days=30`} class="w-full rounded-md shadow-md" />
              </div>
            </div>

            <div class="grid gap-6 lg:grid-cols-1">
              <div class="rounded-[2.5rem] border border-outline-variant/10 bg-surface-container-low p-8">
                <p class="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Résumé</p>
                <div class="mt-5 space-y-4 text-sm font-semibold text-on-surface-variant/75">
                  <div class="flex items-center justify-between gap-4"><span>Messages</span><strong>{profile.messageCount?.toLocaleString('fr-FR') ?? '0'}</strong></div>
                  <div class="flex items-center justify-between gap-4"><span>Vocal</span><strong>{formatDuration(profile.voiceTimeSeconds)}</strong></div>
                  <div class="flex items-center justify-between gap-4"><span>Jours actifs (est.)</span><strong>{profile.activeDays ?? '—'}</strong></div>
                </div>
              </div>

              <div class="rounded-[2.5rem] border border-outline-variant/10 bg-surface-container-low p-8">
                <p class="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Confidentialité</p>
                <p class="mt-4 text-sm font-medium leading-6 text-on-surface-variant/70">{profile.isPrivate ? 'Les membres non staff voient une version réduite du profil.' : 'Le profil est accessible à tous les membres du serveur.'}</p>
              </div>
            </div>
          </div>
        {:else if activeTab === 'events'}
          <div class="grid gap-6 lg:grid-cols-3">
            <div class="rounded-[2.5rem] border border-outline-variant/10 bg-surface-container-low p-8 lg:col-span-2">
              <div class="flex items-center gap-4">
                <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Papicon icon="Calendar" size={22} /></div>
                <div>
                  <p class="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Événements</p>
                  <h2 class="text-2xl font-black text-on-surface">Historique de participation</h2>
                </div>
              </div>

              <div class="mt-8 space-y-4">
                {#each profile.eventParticipations || [] as entry}
                  <div class="rounded-[1.75rem] border border-outline-variant/10 bg-surface-container-lowest/80 p-5">
                    <div class="flex items-start justify-between gap-4">
                      <div>
                        <p class="text-base font-black text-on-surface">{entry.eventTitle}</p>
                        <p class="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant/45">{formatDate(entry.createdAt)} · {formatEventType(entry.eventType)}</p>
                      </div>
                      <span class="rounded-full bg-primary/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-primary">Score {entry.score}</span>
                    </div>
                  </div>
                {/each}
                {#if !profile.eventParticipations || profile.eventParticipations.length === 0}
                  <div class="rounded-[1.75rem] border border-dashed border-outline-variant/20 bg-surface-container-lowest/70 p-10 text-center text-sm font-semibold text-on-surface-variant/45">Aucune participation événementielle trouvée.</div>
                {/if}
              </div>
            </div>

            <div class="space-y-6">
              <div class="rounded-[2.5rem] border border-outline-variant/10 bg-surface-container-low p-8">
                <p class="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Synthèse</p>
                <div class="mt-5 space-y-4 text-sm font-semibold text-on-surface-variant/75">
                  <div class="flex items-center justify-between gap-4"><span>Événements</span><strong>{profile.eventParticipations?.length ?? 0}</strong></div>
                  <div class="flex items-center justify-between gap-4"><span>Rôles</span><strong>{profile.roles?.length ?? 0}</strong></div>
                  <div class="flex items-center justify-between gap-4"><span>Bio</span><strong>{profile.bio ? 'Oui' : 'Non'}</strong></div>
                </div>
              </div>

              <div class="rounded-[2.5rem] border border-outline-variant/10 bg-linear-to-br from-surface-container-low to-surface-container-high p-8">
                <p class="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Invitation</p>
                <p class="mt-4 text-sm font-medium leading-6 text-on-surface-variant/70">{profile.invite ? `Invité par ${profile.invite.inviterTag ?? profile.invite.inviterId ?? 'Inconnu'} via ${profile.invite.inviteCode ?? 'un code inconnu'}.` : 'Aucune donnée d’invitation disponible.'}</p>
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