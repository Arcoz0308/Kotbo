<script lang="ts">
  import { onMount } from 'svelte';
  import { router } from 'tinro';
  import { authStore } from '../lib/stores/auth.svelte';
  import { API_BASE_URL } from '../lib/api';
  import Papicon from '../lib/components/Papicon.svelte';
  import RefreshButton from '../lib/components/RefreshButton.svelte';
  import FormInput from '../lib/components/FormInput.svelte';
  import ToggleSwitch from '../lib/components/ToggleSwitch.svelte';
  import { createAsyncActionState } from '../lib/asyncAction.svelte';
  import ModulePage from '../lib/components/ModulePage.svelte';
  import { toast } from '../lib/stores/toast.svelte';

  let forms = $state<any[]>([]);
  let loading = $state(true);
  let error = $state('');

  // Creation modal state
  let showCreateModal = $state(false);
  let newFormName = $state('');
  let newFormDescription = $state('');

  const createAction = createAsyncActionState();
  const deleteAction = createAsyncActionState();

  async function fetchForms() {
    if (!authStore.selectedGuildId) return;
    loading = true;
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/custom-forms`, {
        headers: { 'Authorization': `Bearer ${authStore.token}` }
      });
      if (!res.ok) throw new Error('Impossible de charger les formulaires');
      const data = await res.json();
      forms = data.forms || [];
    } catch (err: any) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  async function createForm() {
    if (!newFormName.trim()) return;

    await createAction.run(async () => {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/custom-forms`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authStore.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: newFormName,
          description: newFormDescription || undefined,
          structure: {
            title: newFormName,
            description: newFormDescription,
            fields: [
              {
                id: 'field_name',
                type: 'short_text',
                label: 'Nom / Pseudo',
                required: true,
              }
            ]
          }
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erreur lors de la création du formulaire');
      }

      const createdData = await res.json();
      await fetchForms();
      showCreateModal = false;
      newFormName = '';
      newFormDescription = '';
      
      // Redirect to builder
      router.goto(`/forms/builder/${createdData.form.id}`);
      return true;
    }, { successMessage: 'Formulaire créé avec succès !' });
  }

  async function deleteForm(formId: string) {
    if (!confirm('Voulez-vous vraiment supprimer ce formulaire ? Cette action est irréversible.')) return;

    await deleteAction.run(async () => {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/custom-forms/${formId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authStore.token}` }
      });
      if (!res.ok) throw new Error('Erreur lors de la suppression');
      await fetchForms();
      return true;
    }, { successMessage: 'Formulaire supprimé' });
  }

  async function toggleRecruitment(formId: string, value: boolean) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/custom-forms/${formId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${authStore.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ isRecruitment: value })
      });
      if (res.ok) {
        toast.success(value ? 'Formulaire relié au recrutement' : 'Formulaire dissocié du recrutement');
        await fetchForms();
      } else {
        toast.error('Erreur de configuration');
      }
    } catch {
      toast.error('Erreur réseau');
    }
  }

  async function toggleActive(formId: string, value: boolean) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/custom-forms/${formId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${authStore.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ isActive: value })
      });
      if (res.ok) {
        toast.success(value ? 'Formulaire activé' : 'Formulaire désactivé');
        await fetchForms();
      } else {
        toast.error('Erreur de configuration');
      }
    } catch {
      toast.error('Erreur réseau');
    }
  }

  onMount(() => {
    fetchForms();
  });
</script>

<ModulePage
  title="Formulaires Personnalisés"
  description="Créez des formulaires autonomes pour vos événements ou sondages. Connectables au recrutement si souhaité."
  icon="description"
  featureKey="events"
>
  {#snippet actions()}
    <div class="flex items-center gap-3">
      <RefreshButton onClick={fetchForms} loading={loading} label="Actualiser" />
      <button 
        onclick={() => showCreateModal = true}
        class="px-5 py-2.5 bg-primary text-white rounded-xl font-semibold text-[10px] uppercase tracking-widest  hover:scale-105 transition-transform flex items-center gap-2"
      >
        <Papicon icon="add" size={16} />
        Nouveau Formulaire
      </button>
    </div>
  {/snippet}

  <div class="space-y-8">
    {#if loading && forms.length === 0}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {#each Array(3) as _}
          <div class="bg-surface-container-low/40 border border-outline-variant/10 rounded-xl p-6 animate-pulse">
            <div class="h-6 bg-surface-container rounded-lg w-3/4 mb-4"></div>
            <div class="h-4 bg-surface-container rounded-lg w-1/2 mb-2"></div>
            <div class="h-20 bg-surface-container rounded-xl mt-4"></div>
          </div>
        {/each}
      </div>
    {:else if error}
      <div class="rounded-xl border border-rose-500/20 bg-rose-500/10 px-8 py-10 text-center">
        <Papicon icon="error" size={48} class="text-rose-500 mb-4" />
        <p class="text-xl font-bold text-rose-700">{error}</p>
      </div>
    {:else if forms.length === 0}
      <div class="flex flex-col items-center justify-center py-32 text-on-surface-variant/30 border-2 border-dashed border-outline-variant/10 rounded-[4rem] bg-surface-container-low/20">
        <div class="w-24 h-24 rounded-xl bg-surface-container flex items-center justify-center mb-6 shadow-inner text-purple-400">
          <Papicon icon="description" size={48} />
        </div>
        <h3 class="text-2xl font-semibold tracking-tight text-on-surface/50 font-sans">Aucun formulaire</h3>
        <p class="mt-3 text-sm max-w-sm text-center opacity-60 font-sans">
          Créez votre premier formulaire autonome personnalisé pour commencer.
        </p>
      </div>
    {:else}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {#each forms as form (form.id)}
          <div class="bg-surface-container-low/40 border border-outline-variant/10 rounded-xl p-6 hover:bg-surface-container-low transition-all group relative overflow-hidden flex flex-col justify-between">
            <div>
              <div class="flex items-start justify-between mb-4">
                <div class="flex-1 min-w-0">
                  <h3 class="text-lg font-semibold text-on-surface truncate font-sans">{form.name}</h3>
                  {#if form.description}
                    <p class="text-sm text-on-surface-variant/75 mt-1 line-clamp-2 font-sans">{form.description}</p>
                  {/if}
                </div>
              </div>

              <div class="space-y-4 mb-6 pt-2 border-t border-outline-variant/5">
                <div class="flex items-center justify-between text-xs text-on-surface-variant/60 font-sans">
                  <span class="flex items-center gap-2">
                    <Papicon icon="link" size={14} />
                    Lien Public :
                  </span>
                  <div class="flex items-center gap-1 min-w-0 max-w-[150px]">
                    <span class="truncate text-[10px] font-mono">{window.location.origin}/form/{form.id}</span>
                    <button
                      onclick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/form/${form.id}`);
                        toast.success("Lien public copié !");
                      }}
                      class="p-1 rounded-md hover:bg-surface-container-high transition-colors shrink-0"
                      title="Copier le lien public"
                    >
                      <Papicon icon="content_copy" size={12} />
                    </button>
                  </div>
                </div>

                <div class="flex items-center justify-between text-xs text-on-surface-variant/60 font-sans">
                  <span class="flex items-center gap-2">
                    <Papicon icon="assignment_turned_in" size={14} />
                    Soumissions :
                  </span>
                  <span class="font-bold text-on-surface">{form._count?.submissions || 0}</span>
                </div>

                <div class="flex items-center justify-between text-xs text-on-surface-variant/60 font-sans">
                  <span class="flex items-center gap-2">
                    <Papicon icon="work" size={14} />
                    Lien Recrutement :
                  </span>
                  <ToggleSwitch
                    checked={form.isRecruitment}
                    onToggle={(v: boolean) => toggleRecruitment(form.id, v)}
                  />
                </div>

                <div class="flex items-center justify-between text-xs text-on-surface-variant/60 font-sans">
                  <span class="flex items-center gap-2">
                    <Papicon icon="visibility" size={14} />
                    Actif :
                  </span>
                  <ToggleSwitch
                    checked={form.isActive}
                    onToggle={(v: boolean) => toggleActive(form.id, v)}
                  />
                </div>
              </div>
            </div>

            <div class="flex gap-2 w-full pt-4 border-t border-outline-variant/10">
              <button
                onclick={() => router.goto(`/forms/builder/${form.id}`)}
                class="flex-1 px-3 py-2.5 rounded-xl bg-primary/10 text-primary text-xs font-semibold uppercase tracking-wider hover:bg-primary/20 transition-all flex items-center justify-center gap-1.5"
                title="Modifier le formulaire"
              >
                <Papicon icon="edit" size={13} />
                Modifier
              </button>
              <button
                onclick={() => router.goto(`/forms/${form.id}/responses`)}
                class="flex-1 px-3 py-2.5 rounded-xl bg-surface-container text-on-surface-variant text-xs font-semibold uppercase tracking-wider hover:bg-surface-container-high transition-all flex items-center justify-center gap-1.5"
                title="Voir les réponses"
              >
                <Papicon icon="assignment" size={13} />
                Réponses
              </button>
              <button
                onclick={() => deleteForm(form.id)}
                class="px-3 py-2.5 rounded-xl bg-rose-500/10 text-rose-500 text-xs font-semibold uppercase tracking-wider hover:bg-rose-500/20 transition-all"
                title="Supprimer"
              >
                <Papicon icon="delete" size={14} />
              </button>
            </div>

          </div>
        {/each}
      </div>
    {/if}
  </div>
</ModulePage>

<!-- Create Form Modal -->
{#if showCreateModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
    <div class="bg-surface border border-outline-variant/30 rounded-xl w-full max-w-xl shadow-sm overflow-hidden animate-in zoom-in-95 duration-200">
      <div class="p-8 border-b border-outline-variant/20 flex items-center justify-between">
        <div>
          <h3 class="text-xl font-semibold text-on-surface font-sans">Créer un Formulaire Autonome</h3>
          <p class="text-on-surface-variant text-sm font-sans">Saisissez les informations de base</p>
        </div>
        <button onclick={() => showCreateModal = false} class="w-10 h-10 rounded-full flex items-center justify-center hover:bg-surface-hover transition-colors">
          <Papicon icon="close" size={20} />
        </button>
      </div>
      
      <div class="p-8 space-y-6">
        <div>
          <label for="form-name" class="block text-xs font-semibold uppercase tracking-widest text-on-surface-variant/60 mb-2 font-sans">Nom du formulaire</label>
          <FormInput 
            id="form-name"
            type="text" 
            bind:value={newFormName} 
            placeholder="Ex: Formulaire d'Inscription Event"
            className="w-full"
          />
        </div>
        <div>
          <label for="form-description" class="block text-xs font-semibold uppercase tracking-widest text-on-surface-variant/60 mb-2 font-sans">Description (optionnelle)</label>
          <textarea 
            id="form-description"
            bind:value={newFormDescription}
            placeholder="Description du formulaire..."
            class="w-full bg-surface-container rounded-lg p-4 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-hidden border border-outline-variant/10 focus:border-primary/50 transition-all resize-none h-24 font-sans"
          ></textarea>
        </div>
      </div>
      
      <div class="p-8 bg-surface-container-low border-t border-outline-variant/20 flex gap-4">
        <button onclick={() => showCreateModal = false} class="flex-1 py-3.5 rounded-xl font-bold bg-surface hover:bg-surface-hover transition-colors font-sans">Annuler</button>
        <button 
          onclick={createForm}
          disabled={createAction.state.loading || !newFormName.trim()}
          class="flex-1 py-3.5 rounded-xl font-semibold bg-primary text-on-primary hover: active:scale-[0.98] transition-all  disabled:opacity-50 disabled:scale-100 font-sans"
        >
          {createAction.state.loading ? 'Création...' : 'Créer & Continuer'}
        </button>
      </div>
    </div>
  </div>
{/if}
