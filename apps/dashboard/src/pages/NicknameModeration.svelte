<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import ModulePage from '../lib/components/ModulePage.svelte';
  import ToggleSwitch from '../lib/components/ToggleSwitch.svelte';
  import InlineFeedback from '../lib/components/InlineFeedback.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import { createAsyncActionState } from '../lib/asyncAction.svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import { toast } from '../lib/stores/toast.svelte';
  import {
    fetchNicknameModerationConfig,
    updateNicknameModerationConfig,
    fetchBannedWords,
    addBannedWord,
    deleteBannedWord,
    toggleBannedWord,
  } from '../lib/api';

  let wsListener: ((e: CustomEvent) => void) | null = null;

  // ---------------------------------------------------------------------------
  // Types
  // ---------------------------------------------------------------------------

  type BannedWordEntry = {
    id: string;
    word: string;
    category: string;
    enabled: boolean;
    guildId: string | null;
  };

  type CategoryMeta = {
    label: string;
    color: string;
    bg: string;
  };

  const CATEGORIES: Record<string, CategoryMeta> = {
    custom:     { label: 'Personnalisé', color: 'text-primary',      bg: 'bg-primary/10 border-primary/20' },
    racism:     { label: 'Racisme',      color: 'text-error',        bg: 'bg-error/10 border-error/20' },
    threat:     { label: 'Menace',       color: 'text-orange-400',   bg: 'bg-orange-400/10 border-orange-400/20' },
    sexual:     { label: 'Sexuel',       color: 'text-pink-400',     bg: 'bg-pink-400/10 border-pink-400/20' },
    lgbtphobia: { label: 'LGBTphobie',  color: 'text-purple-400',   bg: 'bg-purple-400/10 border-purple-400/20' },
    hate:       { label: 'Haine',        color: 'text-red-600',      bg: 'bg-red-600/10 border-red-600/20' },
    insult:     { label: 'Insulte',      color: 'text-yellow-400',   bg: 'bg-yellow-400/10 border-yellow-400/20' },
  };

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  let enabled = $state(false);
  let onJoin = $state(true);
  let onUpdate = $state(true);
  let checkInvisible = $state(true);
  let checkGlobal = $state(true);
  let checkCustom = $state(true);
  let globalWords = $state<BannedWordEntry[]>([]);
  let customWords = $state<BannedWordEntry[]>([]);
  let whitelist = $state<string[]>([]);
  let bypass = $state<string[]>([]);
  let loading = $state(true);
  let loadError = $state('');

  let newWord = $state('');
  let newCategory = $state('custom');
  let activeTab = $state<'custom' | 'global'>('custom');

  let newWhitelistItem = $state('');
  let newBypassItem = $state('');

  const saveToggleAction = createAsyncActionState();
  const wordAction = createAsyncActionState();
  const exceptionAction = createAsyncActionState();

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async function loadData(showLoading = false) {
    if (showLoading) {
      loading = true;
    }
    try {
      const [config, words] = await Promise.all([
        fetchNicknameModerationConfig(),
        fetchBannedWords(),
      ]);
      if (config) {
        enabled = config.enabled ?? false;
        whitelist = config.whitelist ?? [];
        bypass = config.bypass ?? [];
        onJoin = config.onJoin ?? true;
        onUpdate = config.onUpdate ?? true;
        checkInvisible = config.checkInvisible ?? true;
        checkGlobal = config.checkGlobal ?? true;
        checkCustom = config.checkCustom ?? true;
      }
      if (words) {
        globalWords = words.global ?? [];
        customWords = words.custom ?? [];
      }
      loadError = '';
    } catch (err) {
      loadError = err instanceof Error ? err.message : 'Impossible de charger la configuration.';
    } finally {
      if (showLoading) {
        loading = false;
      }
    }
  }

  onMount(async () => {
    await loadData(true);

    wsListener = (e: CustomEvent) => {
      const payload = e.detail;
      const shouldRefresh =
        payload?.type === 'dashboard_state_changed' &&
        payload?.guildId === authStore.selectedGuildId &&
        (payload?.reason === 'nickname_moderation_updated' || payload?.reason === 'banned_words_updated');

      if (shouldRefresh) {
        console.log('[NicknameWS] Changement détecté via WebSocket, actualisation des données...');
        void loadData(false);
      }
    };

    window.addEventListener('kotbo-ws-message', wsListener as any);
  });

  onDestroy(() => {
    if (wsListener) {
      window.removeEventListener('kotbo-ws-message', wsListener as any);
    }
  });

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  async function saveToggle() {
    await saveToggleAction.run(
      async () => {
        const ok = await updateNicknameModerationConfig({ enabled });
        if (!ok) throw new Error('Erreur API');
        return true;
      },
      { successMessage: `Module ${enabled ? 'activé' : 'désactivé'}.` }
    );
  }

  async function saveGranularToggle(field: 'onJoin' | 'onUpdate' | 'checkInvisible' | 'checkGlobal' | 'checkCustom', value: boolean) {
    await saveToggleAction.run(
      async () => {
        const ok = await updateNicknameModerationConfig({ [field]: value });
        if (!ok) throw new Error('Erreur API');
        return true;
      },
      { successMessage: `Paramètre mis à jour.` }
    );
  }

  async function addWord() {
    const trimmed = newWord.trim().toLowerCase();
    if (!trimmed) return;
    if (customWords.some((w) => w.word === trimmed)) {
      wordAction.setError('Ce mot est déjà dans votre liste.');
      return;
    }

    newWord = '';

    await wordAction.run(
      async () => {
        const res = await addBannedWord(trimmed, newCategory);
        if (!res?.id) throw new Error('Erreur lors de l\'ajout');
        if (!customWords.some((w) => w.id === res.id || w.word === trimmed)) {
          customWords = [...customWords, { id: res.id, word: trimmed, category: newCategory, enabled: true, guildId: null }];
        }
        return true;
      },
      { successMessage: `"${trimmed}" ajouté.` }
    );
  }

  async function handleDelete(entry: BannedWordEntry) {
    await wordAction.run(
      async () => {
        const ok = await deleteBannedWord(entry.id);
        if (!ok) throw new Error('Erreur lors de la suppression');
        customWords = customWords.filter((w) => w.id !== entry.id);

        toast.success(`"${entry.word}" supprimé.`, 6000, {
          label: 'Annuler',
          onClick: async () => {
            await wordAction.run(async () => {
              const res = await addBannedWord(entry.word, entry.category);
              if (!res?.id) throw new Error("Erreur lors de l'annulation");
              if (!customWords.some((w) => w.word === entry.word)) {
                customWords = [...customWords, { id: res.id, word: entry.word, category: entry.category, enabled: true, guildId: null }];
              }
              return true;
            }, { successMessage: `"${entry.word}" rétabli.` });
          }
        });

        return true;
      },
      {}
    );
  }

  async function handleToggle(entry: BannedWordEntry) {
    const newEnabled = !entry.enabled;
    await wordAction.run(
      async () => {
        const ok = await toggleBannedWord(entry.id, newEnabled);
        if (!ok) throw new Error('Erreur');
        customWords = customWords.map((w) => w.id === entry.id ? { ...w, enabled: newEnabled } : w);
        return true;
      },
      {}
    );
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); addWord(); }
  }

  function getCat(key: string): CategoryMeta {
    return CATEGORIES[key] ?? CATEGORIES.custom;
  }

  async function addWhitelistItem() {
    const trimmed = newWhitelistItem.trim().toLowerCase();
    if (!trimmed) return;
    if (whitelist.includes(trimmed)) {
      exceptionAction.setError('Ce pseudo est déjà autorisé.');
      return;
    }

    const updatedWhitelist = [...whitelist, trimmed];
    await exceptionAction.run(
      async () => {
        const ok = await updateNicknameModerationConfig({ whitelist: updatedWhitelist });
        if (!ok) throw new Error('Erreur API');
        whitelist = updatedWhitelist;
        newWhitelistItem = '';
        return true;
      },
      { successMessage: `"${trimmed}" ajouté aux pseudos autorisés.` }
    );
  }

  async function removeWhitelistItem(item: string) {
    const updatedWhitelist = whitelist.filter((w) => w !== item);
    await exceptionAction.run(
      async () => {
        const ok = await updateNicknameModerationConfig({ whitelist: updatedWhitelist });
        if (!ok) throw new Error('Erreur API');
        
        const previousWhitelist = whitelist;
        whitelist = updatedWhitelist;

        toast.success(`"${item}" supprimé des pseudos autorisés.`, 6000, {
          label: 'Annuler',
          onClick: async () => {
            await exceptionAction.run(async () => {
              const okUndo = await updateNicknameModerationConfig({ whitelist: previousWhitelist });
              if (!okUndo) throw new Error("Erreur lors de l'annulation");
              whitelist = previousWhitelist;
              return true;
            }, { successMessage: `"${item}" rétabli.` });
          }
        });

        return true;
      },
      {}
    );
  }

  async function addBypassItem() {
    const trimmed = newBypassItem.trim();
    if (!trimmed) return;
    if (bypass.includes(trimmed)) {
      exceptionAction.setError('Cet ID membre est déjà exempté.');
      return;
    }

    if (!/^\d{17,20}$/.test(trimmed)) {
      exceptionAction.setError('ID membre invalide (doit contenir entre 17 et 20 chiffres).');
      return;
    }

    const updatedBypass = [...bypass, trimmed];
    await exceptionAction.run(
      async () => {
        const ok = await updateNicknameModerationConfig({ bypass: updatedBypass });
        if (!ok) throw new Error('Erreur API');
        bypass = updatedBypass;
        newBypassItem = '';
        return true;
      },
      { successMessage: `Membre ${trimmed} exempté.` }
    );
  }

  async function removeBypassItem(item: string) {
    const updatedBypass = bypass.filter((b) => b !== item);
    await exceptionAction.run(
      async () => {
        const ok = await updateNicknameModerationConfig({ bypass: updatedBypass });
        if (!ok) throw new Error('Erreur API');
        
        const previousBypass = bypass;
        bypass = updatedBypass;

        toast.success(`Exemption pour le membre ${item} retirée.`, 6000, {
          label: 'Annuler',
          onClick: async () => {
            await exceptionAction.run(async () => {
              const okUndo = await updateNicknameModerationConfig({ bypass: previousBypass });
              if (!okUndo) throw new Error("Erreur lors de l'annulation");
              bypass = previousBypass;
              return true;
            }, { successMessage: `Exemption pour le membre ${item} rétablie.` });
          }
        });

        return true;
      },
      {}
    );
  }

  function handleWhitelistKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); addWhitelistItem(); }
  }

  function handleBypassKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); addBypassItem(); }
  }
</script>

<ModulePage
  title="Modération des pseudos"
  description="Renomme automatiquement les pseudos non conformes dès qu'un membre rejoint ou modifie son pseudo."
  icon="filter"
  featureKey="nickname_moderation"
>
  <InlineFeedback state={saveToggleAction} />

  {#if loading}
    <div class="flex flex-col gap-6 animate-pulse">
      {#each [1, 2] as _}
        <div class="h-32 rounded-3xl bg-surface-container-low/60"></div>
      {/each}
    </div>
  {:else if loadError}
    <div class="rounded-3xl bg-error/10 border border-error/20 p-6 text-error text-sm font-semibold">
      ⚠️ {loadError}
    </div>
  {:else}
    <!-- ============================================================ -->
    <!-- Section 1 — Toggle principal                                   -->
    <!-- ============================================================ -->
    <section class="bg-surface-container-low/40 backdrop-blur-xl rounded-4xl border border-outline-variant/30 p-8 flex flex-col gap-6">
      <div class="flex items-start justify-between gap-6">
        <div class="flex flex-col gap-1">
          <h2 class="text-base font-black tracking-tight text-on-surface">Activation</h2>
          <p class="text-sm text-on-surface-variant/70">
            Lorsqu'activé, le bot vérifie les pseudos à l'arrivée et lors des modifications.
            Un pseudo non conforme est remplacé par
            <code class="font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded-lg text-xs">pseudo non conforme | automod</code>.
            <br />
            Commande Discord de vérification : <code class="font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded-lg text-xs">/rescan pseudo rescan</code>
          </p>
        </div>
        <div class="flex-shrink-0">
          <ToggleSwitch checked={enabled} onToggle={() => { enabled = !enabled; saveToggle(); }} disabled={saveToggleAction.state.loading} />
        </div>
      </div>

      <div class="p-4 rounded-2xl bg-surface-container/30 border border-outline-variant/20 flex flex-col gap-3">
        <p class="text-xs font-black uppercase tracking-widest text-on-surface-variant/50">Ce que le bot surveille</p>
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between gap-4 py-1.5 px-2 rounded-xl hover:bg-surface-container-high/30 transition-colors">
            <span class="text-sm text-on-surface-variant/80">Nouveaux membres rejoignant le serveur</span>
            <ToggleSwitch checked={onJoin} onToggle={() => { onJoin = !onJoin; saveGranularToggle('onJoin', onJoin); }} disabled={!enabled || saveToggleAction.state.loading} />
          </div>
          <div class="flex items-center justify-between gap-4 py-1.5 px-2 rounded-xl hover:bg-surface-container-high/30 transition-colors">
            <span class="text-sm text-on-surface-variant/80">Membres modifiant leur pseudo</span>
            <ToggleSwitch checked={onUpdate} onToggle={() => { onUpdate = !onUpdate; saveGranularToggle('onUpdate', onUpdate); }} disabled={!enabled || saveToggleAction.state.loading} />
          </div>
          <div class="flex items-center justify-between gap-4 py-1.5 px-2 rounded-xl hover:bg-surface-container-high/30 transition-colors">
            <span class="text-sm text-on-surface-variant/80">Pseudos composés uniquement de caractères invisibles</span>
            <ToggleSwitch checked={checkInvisible} onToggle={() => { checkInvisible = !checkInvisible; saveGranularToggle('checkInvisible', checkInvisible); }} disabled={!enabled || saveToggleAction.state.loading} />
          </div>
          <div class="flex items-center justify-between gap-4 py-1.5 px-2 rounded-xl hover:bg-surface-container-high/30 transition-colors">
            <span class="text-sm text-on-surface-variant/80">Mots de la liste globale (racisme, menaces, insultes…)</span>
            <ToggleSwitch checked={checkGlobal} onToggle={() => { checkGlobal = !checkGlobal; saveGranularToggle('checkGlobal', checkGlobal); }} disabled={!enabled || saveToggleAction.state.loading} />
          </div>
          <div class="flex items-center justify-between gap-4 py-1.5 px-2 rounded-xl hover:bg-surface-container-high/30 transition-colors">
            <span class="text-sm text-on-surface-variant/80">Vos mots personnalisés ci-dessous</span>
            <ToggleSwitch checked={checkCustom} onToggle={() => { checkCustom = !checkCustom; saveGranularToggle('checkCustom', checkCustom); }} disabled={!enabled || saveToggleAction.state.loading} />
          </div>
        </div>
        <p class="text-xs text-on-surface-variant/40 italic mt-1">
          Le bot ne peut pas renommer le propriétaire du serveur (limitation Discord).
        </p>
      </div>
    </section>

    <!-- ============================================================ -->
    <!-- Section 2 — Mots bannis                                       -->
    <!-- ============================================================ -->
    <section class="bg-surface-container-low/40 backdrop-blur-xl rounded-4xl border border-outline-variant/30 p-8 flex flex-col gap-6">
      <div class="flex flex-col gap-1">
        <h2 class="text-base font-black tracking-tight text-on-surface">Mots bannis</h2>
        <p class="text-sm text-on-surface-variant/70">
          Gérez les mots déclenchant un renommage automatique. Les mots <strong>globaux</strong> sont partagés
          entre tous les serveurs et sont en lecture seule. Vos mots <strong>personnalisés</strong> sont
          spécifiques à ce serveur.
        </p>
      </div>

      <!-- Tabs -->
      <div class="flex gap-1 p-1 bg-surface-container/40 rounded-2xl w-fit">
        {#each [{ key: 'custom', label: `Personnalisés (${customWords.length})` }, { key: 'global', label: `Globaux (${globalWords.length})` }] as tab}
          <button
            onclick={() => activeTab = tab.key as 'custom' | 'global'}
            class="px-4 py-2 rounded-xl text-sm font-bold transition-all {activeTab === tab.key ? 'bg-primary text-white shadow-sm' : 'text-on-surface-variant/60 hover:text-on-surface'}"
          >
            {tab.label}
          </button>
        {/each}
      </div>

      {#if activeTab === 'custom'}
        <!-- Formulaire d'ajout -->
        <div class="flex gap-3 items-start flex-wrap">
          <div class="flex-1 min-w-[200px] relative">
            <input
              id="banned-word-input"
              type="text"
              bind:value={newWord}
              onkeydown={handleKeydown}
              maxlength={100}
              placeholder="Entrer un mot ou fragment..."
              class="w-full bg-surface-container/60 border border-outline-variant/30 rounded-2xl px-5 py-3.5 text-sm text-on-surface placeholder:text-on-surface-variant/30 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-all"
            />
          </div>
          <select
            bind:value={newCategory}
            class="bg-surface-container/60 border border-outline-variant/30 rounded-2xl px-4 py-3.5 text-sm text-on-surface focus:outline-none focus:border-primary/60 transition-all"
          >
            {#each Object.entries(CATEGORIES) as [key, meta]}
              <option value={key}>{meta.label}</option>
            {/each}
          </select>
          <button
            onclick={addWord}
            disabled={!newWord.trim() || wordAction.state.loading}
            class="flex items-center gap-2 px-5 py-3.5 bg-primary text-white rounded-2xl text-sm font-bold transition-all hover:bg-primary/90 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Papicon icon="plus" size={16} />
            Ajouter
          </button>
        </div>

        <InlineFeedback state={wordAction} />

        <!-- Liste des mots personnalisés -->
        {#if customWords.length > 0}
          <div class="rounded-2xl border border-outline-variant/20 overflow-hidden">
            <table class="w-full text-sm">
              <thead>
                <tr class="bg-surface-container/40 text-left">
                  <th class="px-5 py-3 text-xs font-black uppercase tracking-widest text-on-surface-variant/50">Mot</th>
                  <th class="px-5 py-3 text-xs font-black uppercase tracking-widest text-on-surface-variant/50">Catégorie</th>
                  <th class="px-5 py-3 text-xs font-black uppercase tracking-widest text-on-surface-variant/50 text-center">Actif</th>
                  <th class="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-outline-variant/10">
                {#each customWords as entry (entry.id)}
                  {@const cat = getCat(entry.category)}
                  <tr class="hover:bg-surface-container/20 transition-colors {entry.enabled ? '' : 'opacity-40'}">
                    <td class="px-5 py-3 font-mono font-semibold text-on-surface">{entry.word}</td>
                    <td class="px-5 py-3">
                      <span class="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border {cat.bg} {cat.color}">
                        {cat.label}
                      </span>
                    </td>
                    <td class="px-5 py-3 text-center">
                      <ToggleSwitch checked={entry.enabled} onToggle={() => handleToggle(entry)} disabled={wordAction.state.loading} />
                    </td>
                    <td class="px-3 py-3 text-right">
                      <button
                        onclick={() => handleDelete(entry)}
                        disabled={wordAction.state.loading}
                        aria-label="Supprimer {entry.word}"
                        class="p-2 rounded-xl text-on-surface-variant/40 hover:text-error hover:bg-error/10 transition-all disabled:opacity-30"
                      >
                        <Papicon icon="trash" size={15} />
                      </button>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          <p class="text-xs text-on-surface-variant/40 text-right">{customWords.length} mot(s) personnalisé(s)</p>
        {:else}
          <div class="flex flex-col items-center gap-3 py-10 text-on-surface-variant/30">
            <Papicon icon="filter" size={36} class="opacity-20" />
            <p class="text-sm font-semibold">Aucun mot personnalisé.</p>
            <p class="text-xs">La liste globale est toujours active.</p>
          </div>
        {/if}

      {:else}
        <!-- Liste globale (read-only) -->
        {#if globalWords.length > 0}
          <div class="rounded-2xl border border-outline-variant/20 overflow-hidden">
            <div class="bg-surface-container/30 px-5 py-3 flex items-center gap-2 text-xs text-on-surface-variant/50 border-b border-outline-variant/10">
              <Papicon icon="lock" size={12} />
              <span>Ces mots sont gérés globalement et ne peuvent pas être modifiés ici.</span>
            </div>
            <table class="w-full text-sm">
              <thead>
                <tr class="bg-surface-container/40 text-left">
                  <th class="px-5 py-3 text-xs font-black uppercase tracking-widest text-on-surface-variant/50">Mot</th>
                  <th class="px-5 py-3 text-xs font-black uppercase tracking-widest text-on-surface-variant/50">Catégorie</th>
                  <th class="px-5 py-3 text-xs font-black uppercase tracking-widest text-on-surface-variant/50 text-center">Actif</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-outline-variant/10">
                {#each globalWords as entry (entry.id)}
                  {@const cat = getCat(entry.category)}
                  <tr class="hover:bg-surface-container/20 transition-colors {entry.enabled ? '' : 'opacity-40'}">
                    <td class="px-5 py-3 font-mono font-semibold text-on-surface">{entry.word}</td>
                    <td class="px-5 py-3">
                      <span class="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border {cat.bg} {cat.color}">
                        {cat.label}
                      </span>
                    </td>
                    <td class="px-5 py-3 text-center">
                      <span class="inline-flex items-center gap-1.5 text-xs font-bold {entry.enabled ? 'text-primary' : 'text-on-surface-variant/30'}">
                        <span class="w-2 h-2 rounded-full {entry.enabled ? 'bg-primary' : 'bg-on-surface-variant/20'}"></span>
                        {entry.enabled ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          <p class="text-xs text-on-surface-variant/40 text-right">{globalWords.length} mot(s) global/globaux</p>
        {:else}
          <div class="flex flex-col items-center gap-3 py-10 text-on-surface-variant/30">
            <Papicon icon="filter" size={36} class="opacity-20" />
            <p class="text-sm font-semibold">Aucun mot global configuré.</p>
          </div>
        {/if}
      {/if}
    </section>

    <!-- ============================================================ -->
    <!-- Section 3 — Exceptions (Pseudos & Membres autorisés)          -->
    <!-- ============================================================ -->
    <section class="bg-surface-container-low/40 backdrop-blur-xl rounded-4xl border border-outline-variant/30 p-8 flex flex-col gap-6">
      <div class="flex flex-col gap-1">
        <h2 class="text-base font-black tracking-tight text-on-surface">Exceptions de modération (Whitelist)</h2>
        <p class="text-sm text-on-surface-variant/70">
          Gérez les pseudos et les membres qui doivent contourner la modération automatique pour éviter les faux positifs.
        </p>
      </div>

      <InlineFeedback state={exceptionAction} />

      <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
        <!-- Pseudos autorisés -->
        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-1">
            <h3 class="text-sm font-bold text-on-surface">Pseudos autorisés (exacts)</h3>
            <p class="text-xs text-on-surface-variant/50">
              Ces pseudos complets ne seront jamais modérés, même s'ils contiennent un mot banni. (hors mots personnalisés)
            </p>
          </div>

          <div class="flex gap-2">
            <input
              type="text"
              bind:value={newWhitelistItem}
              onkeydown={handleWhitelistKeydown}
              placeholder="Ex: xavier085409, fichier.py..."
              class="flex-1 min-w-0 bg-surface-container/60 border border-outline-variant/30 rounded-2xl px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/30 focus:outline-none focus:border-primary/60 transition-all"
            />
            <button
              onclick={addWhitelistItem}
              disabled={!newWhitelistItem.trim() || exceptionAction.state.loading}
              class="shrink-0 px-5 py-3 bg-primary text-white rounded-2xl text-sm font-bold transition-all hover:bg-primary/90 active:scale-95 disabled:opacity-40"
            >
              Ajouter
            </button>
          </div>

          {#if whitelist.length > 0}
            <div class="flex flex-wrap gap-2 p-4 rounded-2xl bg-surface-container/20 border border-outline-variant/10">
              {#each whitelist as item}
                <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-primary/10 text-primary border border-primary/20">
                  {item}
                  <button
                    onclick={() => removeWhitelistItem(item)}
                    disabled={exceptionAction.state.loading}
                    aria-label="Supprimer {item}"
                    class="text-primary hover:text-error transition-colors focus:outline-none"
                  >
                    <Papicon icon="x" size={12} />
                  </button>
                </span>
              {/each}
            </div>
          {:else}
            <div class="p-6 rounded-2xl bg-surface-container/10 border border-dashed border-outline-variant/20 text-center text-xs text-on-surface-variant/40">
              Aucun pseudo autorisé configuré.
            </div>
          {/if}
        </div>

        <!-- Membres exemptés -->
        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-1">
            <h3 class="text-sm font-bold text-on-surface">Membres exemptés (Bypass)</h3>
            <p class="text-xs text-on-surface-variant/50">
              Les membres avec ces IDs Discord ne seront jamais renommés, peu importe le pseudo qu'ils choisissent.
            </p>
          </div>

          <div class="flex gap-2">
            <input
              type="text"
              bind:value={newBypassItem}
              onkeydown={handleBypassKeydown}
              placeholder="Ex: 636012675402..."
              class="flex-1 min-w-0 bg-surface-container/60 border border-outline-variant/30 rounded-2xl px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/30 focus:outline-none focus:border-primary/60 transition-all"
            />
            <button
              onclick={addBypassItem}
              disabled={!newBypassItem.trim() || exceptionAction.state.loading}
              class="shrink-0 px-5 py-3 bg-primary text-white rounded-2xl text-sm font-bold transition-all hover:bg-primary/90 active:scale-95 disabled:opacity-40"
            >
              Ajouter
            </button>
          </div>

          {#if bypass.length > 0}
            <div class="flex flex-wrap gap-2 p-4 rounded-2xl bg-surface-container/20 border border-outline-variant/10">
              {#each bypass as item}
                <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-secondary/10 text-on-secondary-container border border-secondary/20 font-mono">
                  {item}
                  <button
                    onclick={() => removeBypassItem(item)}
                    disabled={exceptionAction.state.loading}
                    aria-label="Retirer l'exemption pour {item}"
                    class="text-on-secondary-container hover:text-error transition-colors focus:outline-none"
                  >
                    <Papicon icon="x" size={12} />
                  </button>
                </span>
              {/each}
            </div>
          {:else}
            <div class="p-6 rounded-2xl bg-surface-container/10 border border-dashed border-outline-variant/20 text-center text-xs text-on-surface-variant/40">
              Aucun membre exempté (les admins/bots sont déjà ignorés par défaut).
            </div>
          {/if}
        </div>
      </div>
    </section>
  {/if}
</ModulePage>
