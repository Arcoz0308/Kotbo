<script lang="ts">
  import { onMount } from 'svelte';
  import ModulePage from '../lib/components/ModulePage.svelte';
  import ActionButton from '../lib/components/ActionButton.svelte';
  import ToggleSwitch from '../lib/components/ToggleSwitch.svelte';
  import InlineFeedback from '../lib/components/InlineFeedback.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import { createAsyncActionState } from '../lib/asyncAction.svelte';
  import { fetchNicknameModerationConfig, updateNicknameModerationConfig } from '../lib/api';

  // ---- State ---------------------------------------------------------------
  let enabled = $state(false);
  let bannedWords = $state<string[]>([]);

  /** Mot en cours de saisie dans l'input */
  let newWord = $state('');

  let loading = $state(true);
  let loadError = $state('');

  const saveAction = createAsyncActionState();

  // ---- Lifecycle -----------------------------------------------------------
  onMount(async () => {
    try {
      const data = await fetchNicknameModerationConfig();
      if (data) {
        enabled = data.enabled ?? false;
        bannedWords = Array.isArray(data.bannedWords) ? [...data.bannedWords] : [];
      }
    } catch (err) {
      loadError = err instanceof Error ? err.message : 'Impossible de charger la configuration.';
    } finally {
      loading = false;
    }
  });

  // ---- Actions -------------------------------------------------------------

  function addWord() {
    const trimmed = newWord.trim().toLowerCase();
    if (!trimmed || bannedWords.includes(trimmed) || trimmed.length > 100) return;
    bannedWords = [...bannedWords, trimmed];
    newWord = '';
  }

  function removeWord(word: string) {
    bannedWords = bannedWords.filter((w) => w !== word);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addWord();
    }
  }

  async function save() {
    await saveAction.run(
      async () => {
        const ok = await updateNicknameModerationConfig({ enabled, bannedWords });
        if (!ok) throw new Error('La sauvegarde a échoué.');
        return true;
      },
      { successMessage: 'Configuration sauvegardée avec succès.' }
    );
  }
</script>

<ModulePage
  title="Modération des pseudos"
  description="Renomme automatiquement les pseudos non conformes dès qu'un membre rejoint ou modifie son pseudo."
  icon="tag"
  featureKey="nickname_moderation"
>
  {#snippet actions()}
    <ActionButton onclick={save} loading={saveAction.state.loading} disabled={loading}>
      Sauvegarder
    </ActionButton>
  {/snippet}

  <InlineFeedback state={saveAction} />

  {#if loading}
    <!-- Skeleton loader -->
    <div class="flex flex-col gap-6 animate-pulse">
      {#each [1, 2] as _}
        <div class="h-24 rounded-3xl bg-surface-container-low/60"></div>
      {/each}
    </div>
  {:else if loadError}
    <div class="rounded-3xl bg-error/10 border border-error/20 p-6 text-error text-sm font-semibold">
      {loadError}
    </div>
  {:else}
    <!-- ================================================================ -->
    <!-- Section 1 — Toggle principal                                      -->
    <!-- ================================================================ -->
    <section class="bg-surface-container-low/40 backdrop-blur-xl rounded-4xl border border-outline-variant/30 p-8 flex flex-col gap-6">
      <div class="flex items-start justify-between gap-6">
        <div class="flex flex-col gap-1">
          <h2 class="text-base font-black tracking-tight text-on-surface">Activation</h2>
          <p class="text-sm text-on-surface-variant/70">
            Lorsqu'activé, le bot vérifie automatiquement les pseudos des nouveaux membres et des
            membres qui modifient leur pseudo. Si un pseudo est non conforme, il est remplacé
            par <code class="font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded-lg text-xs">pseudo non conforme | automod</code>.
          </p>
        </div>
        <div class="flex-shrink-0">
          <ToggleSwitch checked={enabled} onToggle={() => (enabled = !enabled)} />
        </div>
      </div>

      <div class="flex flex-col gap-3 p-4 rounded-2xl bg-surface-container/30 border border-outline-variant/20">
        <div class="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-on-surface-variant/60">
          <Papicon icon="info" size={14} />
          <span>Ce que le bot surveille</span>
        </div>
        <ul class="text-sm text-on-surface-variant/80 flex flex-col gap-1.5 list-none">
          <li class="flex items-center gap-2"><span class="text-primary">→</span> Nouveaux membres rejoignant le serveur</li>
          <li class="flex items-center gap-2"><span class="text-primary">→</span> Membres modifiant leur pseudo sur le serveur</li>
          <li class="flex items-center gap-2"><span class="text-primary">→</span> Pseudos composés de caractères invisibles ou non affichables</li>
          <li class="flex items-center gap-2"><span class="text-primary">→</span> Une liste de mots problématiques par défaut (racisme, menaces, insultes...)</li>
          <li class="flex items-center gap-2"><span class="text-primary">→</span> Vos mots personnalisés ajoutés ci-dessous</li>
        </ul>
        <p class="text-xs text-on-surface-variant/50 mt-1 italic">
          Note : Le bot ne peut pas renommer le propriétaire du serveur (limitation Discord).
        </p>
      </div>
    </section>

    <!-- ================================================================ -->
    <!-- Section 2 — Liste de mots personnalisés                           -->
    <!-- ================================================================ -->
    <section class="bg-surface-container-low/40 backdrop-blur-xl rounded-4xl border border-outline-variant/30 p-8 flex flex-col gap-6">
      <div class="flex flex-col gap-1">
        <h2 class="text-base font-black tracking-tight text-on-surface">Mots interdits personnalisés</h2>
        <p class="text-sm text-on-surface-variant/70">
          Ajoutez ici les mots ou fragments que vous souhaitez interdire sur votre serveur, en plus de la liste de base. 
          La comparaison est insensible à la casse.
          Maximum <strong>200 mots</strong>, 100 caractères par mot.
        </p>
      </div>

      <!-- Input d'ajout -->
      <div class="flex gap-3 items-center">
        <div class="flex-1 relative">
          <input
            id="nickname-word-input"
            type="text"
            bind:value={newWord}
            onkeydown={handleKeydown}
            maxlength={100}
            placeholder="Ajouter un mot ou fragment..."
            class="w-full bg-surface-container/60 border border-outline-variant/30 rounded-2xl px-5 py-3.5 text-sm text-on-surface placeholder:text-on-surface-variant/30 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-all"
          />
          {#if newWord.length > 80}
            <span class="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-on-surface-variant/40">
              {newWord.length}/100
            </span>
          {/if}
        </div>
        <button
          onclick={addWord}
          disabled={!newWord.trim() || bannedWords.includes(newWord.trim().toLowerCase())}
          class="flex items-center gap-2 px-5 py-3.5 bg-primary text-white rounded-2xl text-sm font-bold tracking-wide transition-all hover:bg-primary/90 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Papicon icon="plus" size={16} />
          Ajouter
        </button>
      </div>

      <!-- Tags des mots ajoutés -->
      {#if bannedWords.length > 0}
        <div class="flex flex-wrap gap-2.5">
          {#each bannedWords as word (word)}
            <span
              class="group flex items-center gap-2 px-3.5 py-1.5 bg-error/10 border border-error/20 text-error rounded-xl text-sm font-semibold transition-all hover:bg-error/15"
            >
              <span class="font-mono text-xs">{word}</span>
              <button
                onclick={() => removeWord(word)}
                aria-label="Supprimer {word}"
                class="opacity-50 group-hover:opacity-100 transition-opacity hover:text-error ml-0.5"
              >
                <Papicon icon="x" size={13} />
              </button>
            </span>
          {/each}
        </div>
      {:else}
        <div class="flex flex-col items-center gap-3 py-8 text-on-surface-variant/40">
          <Papicon icon="tag" size={32} class="opacity-30" />
          <p class="text-sm font-medium">Aucun mot personnalisé ajouté.</p>
          <p class="text-xs">La liste de base est toujours active.</p>
        </div>
      {/if}

      <!-- Compteur -->
      {#if bannedWords.length > 0}
        <p class="text-xs text-on-surface-variant/50 text-right">
          {bannedWords.length} / 200 mots personnalisés
        </p>
      {/if}
    </section>
  {/if}
</ModulePage>
