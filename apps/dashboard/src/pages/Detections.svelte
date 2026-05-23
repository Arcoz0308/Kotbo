<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import { fetchMemberCase, fetchSuspectedDetections } from '../lib/api';
  import ModulePage from '../lib/components/ModulePage.svelte';
  import MemberCaseModal from '../lib/components/MemberCaseModal.svelte';
  import RefreshButton from '../lib/components/RefreshButton.svelte';
  import Papicon from '../lib/components/Papicon.svelte';

  type DetectionItem = {
    id: string;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    isBot: boolean;
    accountCreatedAt: string | null;
    guildJoinedAt: string | null;
    guildLeftAt: string | null;
    lastSeenAt: string | null;
    messageCount: number;
    isOnServer: boolean;
    presenceStatus: string | null;
    accountAgeMs: number | null;
    accountAgeLabel: string;
  };

  let detections = $state<DetectionItem[]>([]);
  let loading = $state(true);
  let error = $state('');
  let modalOpen = $state(false);
  let selectedUserId = $state<string | null>(null);
  let selectedUserName = $state('');
  let caseData = $state<any>(null);
  let loadingCase = $state(false);
  let caseError = $state('');

  const stats = $derived({
    total: detections.length,
    onServer: detections.filter((item) => item.isOnServer).length,
    left: detections.filter((item) => !item.isOnServer).length,
    bot: detections.filter((item) => item.isBot).length,
  });

  function formatDate(value: string | null) {
    if (!value) return 'Inconnue';
    return new Date(value).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  function formatRelative(value: string | null) {
    if (!value) return 'Inconnue';
    const diffMs = Date.now() - new Date(value).getTime();
    if (Number.isNaN(diffMs)) return 'Inconnue';
    const minutes = Math.max(1, Math.floor(diffMs / 60000));
    if (minutes < 60) return `il y a ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `il y a ${hours} h`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `il y a ${days} j`;
    return formatDate(value);
  }

  async function loadDetections() {
    if (!authStore.selectedGuildId) return;
    loading = true;
    error = '';
    try {
      const response = await fetchSuspectedDetections(authStore.selectedGuildId);
      detections = response?.detections ?? [];
    } catch (err) {
      console.error('Erreur chargement détections:', err);
      error = err instanceof Error ? err.message : 'Impossible de charger les détections';
      detections = [];
    } finally {
      loading = false;
    }
  }

  async function openMemberCase(member: DetectionItem) {
    await openMemberCaseById(member.id, member.displayName || member.username || 'Membre');
  }

  async function openMemberCaseById(userId: string, userName = 'Membre') {
    if (!authStore.selectedGuildId) return;

    selectedUserId = userId;
    selectedUserName = userName;
    modalOpen = true;
    loadingCase = true;
    caseError = '';
    caseData = null;

    try {
      caseData = await fetchMemberCase(userId, authStore.selectedGuildId);
      if (caseData?.profile) {
        selectedUserName = caseData.profile.displayName || caseData.profile.username || selectedUserName;
      }
    } catch (err) {
      caseError = err instanceof Error ? err.message : 'Impossible de charger le dossier';
    } finally {
      loadingCase = false;
    }
  }

  onMount(() => {
    void loadDetections();
  });
</script>

<ModulePage
  title="Détections"
  description="Surveille les comptes suspects et ouvre directement leur dossier modération."
  icon="bell"
  featureKey="double_accounts"
>
  {#snippet actions()}
    <RefreshButton onClick={loadDetections} loading={loading} label="Actualiser" />
  {/snippet}

  <div class="grid gap-4 md:grid-cols-4 mb-8">
    <div class="rounded-3xl border border-outline-variant/10 bg-surface-container-low/40 p-5">
      <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Suspects</p>
      <p class="mt-2 text-3xl font-black text-on-surface">{stats.total}</p>
    </div>
    <div class="rounded-3xl border border-outline-variant/10 bg-surface-container-low/40 p-5">
      <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Encore présents</p>
      <p class="mt-2 text-3xl font-black text-emerald-500">{stats.onServer}</p>
    </div>
    <div class="rounded-3xl border border-outline-variant/10 bg-surface-container-low/40 p-5">
      <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Partis</p>
      <p class="mt-2 text-3xl font-black text-amber-500">{stats.left}</p>
    </div>
    <div class="rounded-3xl border border-outline-variant/10 bg-surface-container-low/40 p-5">
      <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Bots</p>
      <p class="mt-2 text-3xl font-black text-sky-500">{stats.bot}</p>
    </div>
  </div>

  <div class="mb-8 rounded-[2.5rem] border border-amber-500/20 bg-amber-500/5 p-6 flex gap-4 items-start">
    <div class="rounded-2xl bg-amber-500/10 p-3 text-amber-500 shrink-0">
      <Papicon icon="AlertTriangle" size={22} />
    </div>
    <div>
      <h3 class="text-lg font-black text-on-surface">Centre de surveillance</h3>
      <p class="mt-1 text-sm text-on-surface-variant/70">
        Cette page centralise les comptes marqués comme suspects par le bot. Ouvre un dossier pour vérifier les détails, puis valide ou sanctionne depuis le module <span class="font-bold">Doubles Comptes</span>.
      </p>
    </div>
  </div>

  {#if loading}
    <div class="flex flex-col items-center justify-center py-24 gap-4">
      <div class="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      <p class="text-sm font-bold text-on-surface-variant/60">Chargement des détections...</p>
    </div>
  {:else if error}
    <div class="rounded-2xl border border-rose-500/20 bg-rose-500/5 px-4 py-6 text-center">
      <p class="text-rose-500 font-bold">{error}</p>
      <button onclick={loadDetections} class="mt-4 text-xs font-black uppercase tracking-widest text-primary">Réessayer</button>
    </div>
  {:else if detections.length === 0}
    <div class="flex flex-col items-center justify-center py-24 text-center rounded-[2.5rem] border border-outline-variant/10 bg-surface-container-low/30">
      <div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500">
        <Papicon icon="ShieldCheck" size={32} />
      </div>
      <h3 class="mt-6 text-xl font-bold text-on-surface">Aucune détection active</h3>
      <p class="mt-2 text-sm text-on-surface-variant/50 max-w-lg">
        Aucun membre n’est actuellement marqué comme suspect dans le serveur.
      </p>
    </div>
  {:else}
    <div class="grid gap-4 xl:grid-cols-2">
      {#each detections as detection (detection.id)}
        <article class="rounded-[2rem] border border-outline-variant/10 bg-surface-container-low/40 p-5 transition-all duration-300 hover:border-primary/20 hover:bg-surface-container-low">
          <div class="flex items-start gap-4">
            {#if detection.avatarUrl}
              <img src={detection.avatarUrl} alt="" class="h-14 w-14 rounded-2xl object-cover shrink-0" />
            {:else}
              <div class="h-14 w-14 rounded-2xl bg-surface-container-high flex items-center justify-center text-on-surface-variant/40 shrink-0">
                <Papicon icon="User" size={24} />
              </div>
            {/if}

            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <h4 class="text-lg font-black text-on-surface truncate">{detection.displayName || detection.username || detection.id}</h4>
                <span class={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest ${detection.isOnServer ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-500/10 text-slate-400'}`}>
                  {detection.isOnServer ? 'Sur le serveur' : 'Parti'}
                </span>
                {#if detection.isBot}
                  <span class="px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest bg-sky-500/10 text-sky-500">Bot</span>
                {/if}
              </div>
              <p class="mt-1 text-xs text-on-surface-variant/60">@{detection.username || 'inconnu'} · ID {detection.id}</p>
              <p class="mt-2 text-sm text-on-surface-variant/70">
                Compte créé {formatRelative(detection.accountCreatedAt)} · arrivé {formatRelative(detection.guildJoinedAt)}
              </p>
              <p class="mt-1 text-sm font-bold text-amber-500">
                Age entre création et arrivée : {detection.accountAgeLabel}
              </p>
            </div>
          </div>

          <div class="mt-4 grid gap-2 text-xs text-on-surface-variant/60 sm:grid-cols-2">
            <div class="rounded-2xl bg-surface-container-high/30 px-3 py-2">Dernière activité: {formatRelative(detection.lastSeenAt)}</div>
            <div class="rounded-2xl bg-surface-container-high/30 px-3 py-2">Messages: {detection.messageCount}</div>
          </div>

          <div class="mt-5 flex flex-wrap items-center gap-2">
            <button
              onclick={() => openMemberCase(detection)}
              class="rounded-xl bg-primary px-4 py-2 text-[10px] font-black uppercase tracking-widest text-on-primary transition-transform hover:scale-[1.02]"
            >
              Ouvrir le dossier
            </button>
            <a href={`/members/${detection.id}`} class="rounded-xl border border-outline-variant/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-on-surface-variant transition-colors hover:text-on-surface hover:border-primary/20">
              Voir dans les membres
            </a>
          </div>
        </article>
      {/each}
    </div>
  {/if}
</ModulePage>

<MemberCaseModal
  open={modalOpen}
  userId={selectedUserId}
  userName={selectedUserName}
  {caseData}
  loading={loadingCase}
  error={caseError}
  onClose={() => modalOpen = false}
  onSelectUser={(newUserId) => {
    const foundNode = caseData?.interactionGraph?.nodes?.find((n: any) => n.id === newUserId);
    const label = foundNode?.label || 'Membre';
    void openMemberCaseById(newUserId, label);
  }}
/>
