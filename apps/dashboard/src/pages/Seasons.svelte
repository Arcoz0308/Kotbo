<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchSeasonsData, createSeason, startSeason, endSeason } from '../lib/api';
  import { toast } from '../lib/stores/toast.svelte';
  import ModulePage from '../lib/components/ModulePage.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import EmptyState from '../lib/components/EmptyState.svelte';

  let loading = $state(true);
  let data: any = $state(null);
  let showCreate = $state(false);
  let newSeason = $state({ name: '', startDate: '', endDate: '' });

  async function load() {
    loading = true;
    try {
      data = await fetchSeasonsData();
    } catch {
      toast.error('Erreur lors du chargement');
    } finally {
      loading = false;
    }
  }

  async function handleCreate() {
    if (!newSeason.name || !newSeason.startDate || !newSeason.endDate) {
      toast.error('Tous les champs sont requis');
      return;
    }
    try {
      await createSeason(newSeason);
      showCreate = false;
      newSeason = { name: '', startDate: '', endDate: '' };
      await load();
    } catch {
      toast.error('Erreur lors de la création');
    }
  }

  async function handleStart(seasonId: string) {
    try {
      await startSeason(seasonId);
      await load();
    } catch {
      toast.error('Erreur lors du demarrage');
    }
  }

  async function handleEnd(seasonId: string) {
    try {
      await endSeason(seasonId);
      await load();
    } catch {
      toast.error('Erreur lors de la cloture');
    }
  }

  function getStatusBadge(status: string) {
    const map: Record<string, { label: string; cls: string }> = {
      UPCOMING: { label: 'A venir', cls: 'bg-primary/10 text-primary' },
      ACTIVE: { label: 'En cours', cls: 'bg-emerald-500/10 text-emerald-500' },
      ENDED: { label: 'Terminee', cls: 'bg-amber-500/10 text-amber-500' },
      ARCHIVED: { label: 'Archivee', cls: 'bg-surface-container-high/40 text-on-surface-variant' },
    };
    return map[status] ?? { label: status, cls: 'bg-surface-container-high/40 text-on-surface-variant' };
  }

  function getDotColor(status: string): string {
    if (status === 'ACTIVE') return 'bg-emerald-500';
    if (status === 'UPCOMING') return 'bg-primary';
    if (status === 'ENDED') return 'bg-amber-500';
    return 'bg-on-surface-variant/40';
  }

  function getMedal(index: number): string {
    if (index === 0) return '\u{1F947}';
    if (index === 1) return '\u{1F948}';
    if (index === 2) return '\u{1F949}';
    return '';
  }

  onMount(load);
</script>

<ModulePage
  title="Saisons de Leveling"
  description="Classements compétitifs avec récompenses de fin de saison."
  icon="flag"
  featureKey="leveling"
>
  {#snippet actions()}
    <button
      class="px-4 py-2 bg-primary text-on-primary text-[13px] font-medium rounded-xl shadow-sm active:scale-[0.98] transition-all flex items-center gap-2"
      onclick={() => showCreate = !showCreate}
    >
      <Papicon icon="plus" size={16} />
      Nouvelle saison
    </button>
  {/snippet}

<!-- ======================== CREATE FORM ======================== -->
{#if showCreate}
  <div class="bg-surface-container-low/30 border border-outline-variant/10 rounded-xl p-6 space-y-4 mb-6">
    <h3 class="text-base font-semibold flex items-center gap-2.5">Creer une saison</h3>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div class="space-y-1">
        <label for="season-name" class="field-label">Nom</label>
        <input
          id="season-name"
          type="text"
          bind:value={newSeason.name}
          placeholder="Saison 1 --- Ete 2026"
          class="w-full px-3 py-2 bg-surface-container-high/30 border border-outline-variant/10 rounded-lg text-on-surface text-sm"
        />
      </div>
      <div class="space-y-1">
        <label for="season-start-date" class="field-label">Date de debut</label>
        <input
          id="season-start-date"
          type="date"
          bind:value={newSeason.startDate}
          class="w-full px-3 py-2 bg-surface-container-high/30 border border-outline-variant/10 rounded-lg text-on-surface text-sm"
        />
      </div>
      <div class="space-y-1">
        <label for="season-end-date" class="field-label">Date de fin</label>
        <input
          id="season-end-date"
          type="date"
          bind:value={newSeason.endDate}
          class="w-full px-3 py-2 bg-surface-container-high/30 border border-outline-variant/10 rounded-lg text-on-surface text-sm"
        />
      </div>
    </div>
    <div class="flex justify-end gap-2 pt-2">
      <button
        class="px-4 py-2 bg-surface-container-high/40 text-on-surface-variant rounded-xl text-xs font-bold hover:bg-surface-container-high/60 transition-all"
        onclick={() => showCreate = false}
      >Annuler</button>
      <button
        class="px-4 py-2 bg-primary text-on-primary text-[13px] font-medium rounded-xl shadow-sm active:scale-[0.98] transition-all flex items-center gap-2"
        onclick={handleCreate}
      >Creer</button>
    </div>
  </div>
{/if}

<!-- ======================== CONTENT ======================== -->
{#if loading}
  <div class="flex flex-col items-center justify-center py-16 text-on-surface-variant/50 gap-4">
    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    <p class="text-sm">Chargement des donnees...</p>
  </div>
{:else if data}

  <!-- ==================== HERO: ACTIVE SEASON ==================== -->
  {#if data.activeSeason}
    <div class="rounded-xl p-[2px] mb-6" style="background: linear-gradient(135deg, var(--primary-color), #10b981, var(--primary-color))">
      <div class="bg-surface-container-low rounded-xl p-6 space-y-4">
        <!-- Top: name + badge + dates -->
        <div>
          <div class="flex items-center gap-3 mb-1">
            <h2 class="text-xl font-bold text-on-surface">{data.activeSeason.name}</h2>
            <span class="px-2.5 py-0.5 bg-emerald-500/10 text-emerald-500 text-xs font-medium rounded-full">En cours</span>
          </div>
          <p class="flex items-center gap-1.5 text-xs text-on-surface-variant/60">
            <Papicon icon="calendar" size={14} />
            {new Date(data.activeSeason.startDate).toLocaleDateString('fr-FR')}
            &mdash;
            {new Date(data.activeSeason.endDate).toLocaleDateString('fr-FR')}
          </p>
        </div>

        <!-- Leaderboard -->
        {#if data.activeLeaderboard.length > 0}
          <div class="space-y-3">
            <h4 class="text-sm font-semibold flex items-center gap-2 text-on-surface-variant">
              <Papicon icon="crown" size={16} />
              Classement actuel
            </h4>
            <div class="space-y-0.5">
              {#each data.activeLeaderboard as entry, i}
                <div class="grid items-center py-2 px-3 rounded-lg text-sm transition-colors hover:bg-surface-container-high/10 {i < 3 ? 'bg-surface-container-high/5' : ''}" style="grid-template-columns: 28px 40px 1fr 80px 100px;">
                  <span class="text-base leading-none">{getMedal(i)}</span>
                  <span class="font-semibold text-on-surface-variant">#{entry.rank}</span>
                  <span class="font-mono text-xs text-on-surface-variant/60">{entry.userId}</span>
                  <span class="text-primary font-medium text-xs">Niv. {entry.level}</span>
                  <span class="text-right text-xs text-on-surface-variant/60">{entry.xp.toLocaleString()} XP</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- End season button -->
        <div class="pt-2">
          <button
            class="px-4 py-2 bg-rose-500/10 text-rose-500 rounded-xl text-xs font-bold hover:bg-rose-500/20 transition-all flex items-center gap-2"
            onclick={() => handleEnd(data.activeSeason.id)}
          >
            <Papicon icon="x" size={14} />
            Terminer la saison
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- ==================== ALL SEASONS TIMELINE ==================== -->
  {#if data.seasons.length > 0}
    <h3 class="text-base font-semibold flex items-center gap-2.5 mb-4">Toutes les saisons</h3>

    <div class="relative pl-6">
      <!-- Vertical line -->
      <div class="absolute left-1.75 top-0 bottom-0 w-0.5 bg-outline-variant/30"></div>

      {#each data.seasons as season}
        {@const badge = getStatusBadge(season.status)}
        <div class="relative mb-3">
          <!-- Dot -->
          <div class="absolute -left-6 top-4.5 w-3 h-3 rounded-full border-2 border-surface z-10 {getDotColor(season.status)}"></div>

          <!-- Card -->
          <div class="bg-surface-container-low/30 border border-outline-variant/10 rounded-xl p-4 hover:border-primary/30 transition-colors">
            <div class="flex items-center gap-3 mb-2">
              <h4 class="text-sm font-semibold text-on-surface">#{season.number} &mdash; {season.name}</h4>
              <span class="px-2.5 py-0.5 text-xs font-medium rounded-full {badge.cls}">{badge.label}</span>
            </div>
            <div class="flex flex-wrap gap-4 text-xs text-on-surface-variant/60">
              <span class="flex items-center gap-1">
                <Papicon icon="calendar" size={13} />
                {new Date(season.startDate).toLocaleDateString('fr-FR')} &mdash; {new Date(season.endDate).toLocaleDateString('fr-FR')}
              </span>
              <span class="flex items-center gap-1">
                <Papicon icon="users" size={13} />
                {season._count?.snapshots ?? 0} participants
              </span>
            </div>
            {#if season.status === 'UPCOMING'}
              <div class="mt-3">
                <button
                  class="px-4 py-2 bg-primary text-on-primary text-[13px] font-medium rounded-xl shadow-sm active:scale-[0.98] transition-all flex items-center gap-1.5"
                  onclick={() => handleStart(season.id)}
                >
                  <Papicon icon="zap" size={13} />
                  Demarrer
                </button>
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <!-- Empty state -->
    <EmptyState icon="flag" title="Aucune saison créée" description="Cliquez sur « Nouvelle saison » pour commencer." />
  {/if}
{/if}
</ModulePage>
