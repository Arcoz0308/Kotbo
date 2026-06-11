<script lang="ts">
  import { onMount } from 'svelte';
  import { router } from 'tinro';
  import { authStore } from '../lib/stores/auth.svelte';
  import { API_BASE_URL } from '../lib/api';
  import Papicon from '../lib/components/Papicon.svelte';
  import RefreshButton from '../lib/components/RefreshButton.svelte';
  import FormInput from '../lib/components/FormInput.svelte';
  import FormSelect from '../lib/components/FormSelect.svelte';
  import ToggleSwitch from '../lib/components/ToggleSwitch.svelte';
  import { createAsyncActionState } from '../lib/asyncAction.svelte';
  import ModulePage from '../lib/components/ModulePage.svelte';
  import { toast } from '../lib/stores/toast.svelte';

  let forms = $state<any[]>([]);
  let loading = $state(true);
  let error = $state('');

  // Form builder state
  let showCreateModal = $state(false);
  let showScriptModal = $state(false);
  let selectedForm = $state<any>(null);
  let generatedScript = $state('');

  // API Key success modal state
  let newlyGeneratedKey = $state('');
  let showKeyModal = $state(false);
  let keyCopied = $state(false);

  function copyKeyToClipboard() {
    navigator.clipboard.writeText(newlyGeneratedKey);
    keyCopied = true;
    setTimeout(() => { keyCopied = false; }, 2000);
  }

  // New form state
  let newFormName = $state('');
  let newFormDescription = $state('');
  let selectedTemplate = $state<'default' | 'simple' | 'custom' | 'google'>('default');
  let customStructure = $state<any>(null);

  // Form builder state
  let formFields = $state<any[]>([]);
  let currentField = $state<any>(null);
  let editingFieldIndex = $state<number | null>(null);


  const createAction = createAsyncActionState();
  const deleteAction = createAsyncActionState();
  const regenerateKeyAction = createAsyncActionState();

  async function fetchForms() {
    if (!authStore.selectedGuildId) return;
    loading = true;
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/recruitment/forms`, {
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
      // For 'google' template, build a minimal structure client-side
      // For 'default' and 'simple', let the backend generate the structure via the `template` field
      let structure = null;
      if (selectedTemplate === 'google') {
        structure = {
          title: newFormName,
          description: newFormDescription,
          type: 'google',
          fields: [
            {
              id: 'discord_id',
              type: 'short_text',
              label: 'Discord ID',
              description: 'Votre ID Discord (ex: 123456789012345678)',
              required: true,
            },
            {
              id: 'email',
              type: 'email',
              label: 'Email',
              description: 'Votre adresse email',
              required: true,
            },
            {
              id: 'age',
              type: 'number',
              label: 'Âge',
              description: 'Votre âge',
              required: true,
            },
          ],
        };
      } else if (selectedTemplate === 'custom') {
        if (!customStructure) {
          throw new Error('Veuillez finaliser votre formulaire personnalisé avant de continuer.');
        }
        structure = { ...customStructure, type: 'custom' };
      }

      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/recruitment/forms`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authStore.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: newFormName,
          description: newFormDescription || undefined,
          template: selectedTemplate,
          structure: structure ?? undefined,
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erreur lors de la création du formulaire');
      }

      const createdData = await res.json();
      if (createdData.apiKey) {
        newlyGeneratedKey = createdData.apiKey;
        showKeyModal = true;
      }

      await fetchForms();
      showCreateModal = false;
      newFormName = '';
      newFormDescription = '';
      selectedTemplate = 'default';
      customStructure = null;
      formFields = [];
      currentField = null;
      editingFieldIndex = null;
      return true;
    }, { successMessage: 'Formulaire créé avec succès !' });
  }


  async function deleteForm(formId: string) {
    if (!confirm('Voulez-vous vraiment supprimer ce formulaire ? Cette action est irréversible.')) return;

    await deleteAction.run(async () => {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/recruitment/forms/${formId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authStore.token}` }
      });
      if (!res.ok) throw new Error('Erreur lors de la suppression');
      await fetchForms();
      return true;
    }, { successMessage: 'Formulaire supprimé' });
  }

  async function regenerateAPIKey(formId: string) {
    if (!confirm('Voulez-vous vraiment régénérer la clé API ? L\'ancienne clé ne fonctionnera plus.')) return;

    await regenerateKeyAction.run(async () => {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/recruitment/forms/${formId}/regenerate-key`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authStore.token}` }
      });
      if (!res.ok) throw new Error('Erreur lors de la régénération');
      const data = await res.json();
      newlyGeneratedKey = data.apiKey;
      showKeyModal = true;
      await fetchForms();
      return true;
    }, { successMessage: 'Clé API régénérée' });
  }

  async function showGoogleAppsScript(form: any) {
    selectedForm = form;
    const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/recruitment/forms/${form.id}/script`, {
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    });
    if (!res.ok) throw new Error('Erreur lors de la génération du script');
    const data = await res.json();
    generatedScript = data.script;
    showScriptModal = true;
  }

  // Form builder functions
  function addField(type: string) {
    const newField = {
      id: `field_${Date.now()}`,
      type,
      label: 'Nouvelle question',
      description: '',
      required: false,
      options: type === 'multiple_choice' || type === 'checkboxes' || type === 'dropdown' ? ['Option 1', 'Option 2'] : undefined,
    };
    formFields.push(newField);
    currentField = newField;
    editingFieldIndex = formFields.length - 1;
  }

  function removeField(index: number) {
    formFields.splice(index, 1);
    if (editingFieldIndex === index) {
      currentField = null;
      editingFieldIndex = null;
    }
  }

  function editField(index: number) {
    currentField = formFields[index];
    editingFieldIndex = index;
  }

  function saveCurrentField() {
    if (currentField && editingFieldIndex !== null) {
      formFields[editingFieldIndex] = { ...currentField };
    }
    currentField = null;
    editingFieldIndex = null;
  }

  function addOption() {
    if (currentField && currentField.options) {
      currentField.options.push(`Option ${currentField.options.length + 1}`);
    }
  }

  function removeOption(index: number) {
    if (currentField && currentField.options) {
      currentField.options.splice(index, 1);
    }
  }

  function buildCustomStructure() {
    customStructure = {
      title: newFormName,
      description: newFormDescription,
      fields: formFields,
    };
  }

  onMount(() => {
    fetchForms();
  });
</script>

<ModulePage 
  title="Formulaires de Recrutement" 
  description="Créez et gérez vos formulaires de recrutement avec génération automatique de script Google Forms." 
  icon="description"
  featureKey="recruitment"
>
  {#snippet actions()}
    <div class="flex items-center gap-3">
      <RefreshButton onClick={fetchForms} loading={loading} label="Actualiser" />
      <button 
        onclick={() => showCreateModal = true}
        class="px-6 py-3 rounded-xl bg-primary text-white font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
      >
        <Papicon icon="add" size={18} />
        Nouveau Formulaire
      </button>
    </div>
  {/snippet}

  <div class="space-y-8">
    {#if loading && forms.length === 0}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {#each Array(3) as _}
          <div class="bg-surface-container-low/40 border border-outline-variant/10 rounded-4xl p-6 animate-pulse">
            <div class="h-6 bg-surface-container rounded-lg w-3/4 mb-4"></div>
            <div class="h-4 bg-surface-container rounded-lg w-1/2 mb-2"></div>
            <div class="h-20 bg-surface-container rounded-xl mt-4"></div>
          </div>
        {/each}
      </div>
    {:else if error}
      <div class="rounded-4xl border border-rose-500/20 bg-rose-500/10 px-8 py-10 text-center">
        <Papicon icon="error" size={48} class="text-rose-500 mb-4" />
        <p class="text-xl font-bold text-rose-700">{error}</p>
      </div>
    {:else if forms.length === 0}
      <div class="flex flex-col items-center justify-center py-32 text-on-surface-variant/30 border-2 border-dashed border-outline-variant/10 rounded-[4rem] bg-surface-container-low/20">
        <div class="w-24 h-24 rounded-[3rem] bg-surface-container flex items-center justify-center mb-6 shadow-inner">
          <Papicon icon="description" size={48} />
        </div>
        <h3 class="text-2xl font-black tracking-tight text-on-surface/50">Aucun formulaire</h3>
        <p class="mt-3 text-sm max-w-sm text-center opacity-60">
          Créez votre premier formulaire de recrutement pour commencer à recevoir des candidatures.
        </p>
      </div>
    {:else}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {#each forms as form (form.id)}
          <div class="bg-surface-container-low/40 border border-outline-variant/10 rounded-4xl p-6 hover:bg-surface-container-low transition-all group">
            <div class="flex items-start justify-between mb-4">
              <div class="flex-1">
                <h3 class="text-lg font-black text-on-surface">{form.name}</h3>
                {#if form.description}
                  <p class="text-sm text-on-surface-variant/70 mt-1">{form.description}</p>
                {/if}
              </div>
              <div class="flex items-center gap-2">
                <span class="px-3 py-1 rounded-full text-[10px] font-black uppercase {form.isActive ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border-rose-500/20'}">
                  {form.isActive ? 'Actif' : 'Inactif'}
                </span>
              </div>
            </div>

            <div class="space-y-3 mb-6">
              {#if form.apiKey}
                <div class="flex items-center gap-2 text-xs text-on-surface-variant/60">
                  <Papicon icon="api" size={14} />
                  <span>Clé API :</span>
                  <span class="font-mono">{form.apiKey.displayKey}</span>
                </div>
              {:else}
                <div class="flex items-center justify-between text-xs text-on-surface-variant/60 gap-2">
                  <div class="flex items-center gap-2 min-w-0">
                    <Papicon icon="link" size={14} />
                    <span class="truncate">{window.location.origin}/form/{form.id}</span>
                  </div>
                  <button
                    onclick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/form/${form.id}`);
                      toast.success("Lien copié dans le presse-papier !");
                    }}
                    class="p-1 rounded-md hover:bg-surface-container-high transition-colors shrink-0"
                    title="Copier le lien public"
                  >
                    <Papicon icon="content_copy" size={12} />
                  </button>
                </div>
              {/if}
              <div class="flex items-center gap-2 text-xs text-on-surface-variant/60">
                <Papicon icon="send" size={14} />
                <span>{form._count?.candidatures || 0} soumissions</span>
              </div>
            </div>

            <div class="flex gap-2 flex-wrap">
              <button
                onclick={() => router.goto(`/recruitment-forms/builder/${form.id}`)}
                class="flex-1 px-3 py-2 rounded-xl bg-primary/10 text-primary text-xs font-black uppercase tracking-wider hover:bg-primary/20 transition-all flex items-center justify-center gap-1.5"
                title="Modifier le formulaire"
              >
                <Papicon icon="edit" size={13} />
                Modifier
              </button>
              <button
                onclick={() => router.goto(`/recruitment-forms/${form.id}/responses`)}
                class="flex-1 px-3 py-2 rounded-xl bg-surface-container text-on-surface-variant text-xs font-black uppercase tracking-wider hover:bg-surface-container-high transition-all flex items-center justify-center gap-1.5"
                title="Voir les réponses"
              >
                <Papicon icon="assignment_turned_in" size={13} />
                Réponses
              </button>
              {#if form.apiKey}
                <button
                  onclick={() => showGoogleAppsScript(form)}
                  class="px-3 py-2 rounded-xl bg-surface-container text-on-surface-variant text-xs font-black uppercase tracking-wider hover:bg-surface-container-high transition-all"
                  title="Générer le script Google Forms"
                >
                  <Papicon icon="code" size={14} />
                </button>
                <button
                  onclick={() => regenerateAPIKey(form.id)}
                  class="px-3 py-2 rounded-xl bg-surface-container text-on-surface-variant text-xs font-black uppercase tracking-wider hover:bg-surface-container-high transition-all"
                  title="Régénérer la clé API"
                >
                  <Papicon icon="refresh" size={14} />
                </button>
              {/if}
              <button
                onclick={() => deleteForm(form.id)}
                class="px-3 py-2 rounded-xl bg-rose-500/10 text-rose-500 text-xs font-black uppercase tracking-wider hover:bg-rose-500/20 transition-all"
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
  <div class="fixed inset-0 z-9999 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
    <div class="bg-surface border border-outline-variant/30 rounded-[3rem] w-full max-w-4xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto">
      <div class="p-8 border-b border-outline-variant/20 flex items-center justify-between bg-surface sticky top-0 z-10">
        <div>
          <h3 class="text-2xl font-black text-on-surface">Créer un Formulaire</h3>
          <p class="text-on-surface-variant text-sm">Configurez votre formulaire de recrutement</p>
        </div>
        <button onclick={() => showCreateModal = false} class="w-10 h-10 rounded-full flex items-center justify-center hover:bg-surface-hover transition-colors">
          <Papicon icon="x" size={24} />
        </button>
      </div>
      
      <div class="p-8 space-y-8">
        <!-- Basic Info -->
        <div class="space-y-4">
          <div>
            <label for="form-name" class="block text-xs font-black uppercase tracking-widest text-on-surface-variant/60 mb-2">Nom du formulaire</label>
            <FormInput 
              id="form-name"
              type="text" 
              bind:value={newFormName} 
              placeholder="Ex: Candidature Staff 2024"
              className="w-full"
            />
          </div>
          <div>
            <label for="form-description" class="block text-xs font-black uppercase tracking-widest text-on-surface-variant/60 mb-2">Description (optionnel)</label>
            <textarea 
              id="form-description"
              bind:value={newFormDescription}
              placeholder="Description du formulaire..."
              class="w-full bg-surface-container rounded-2xl p-4 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-hidden border-2 border-transparent focus:border-primary/50 transition-all resize-none h-24"
            ></textarea>
          </div>
        </div>

        <!-- Template Selection -->
        <div class="space-y-4">
          <fieldset>
            <legend class="block text-xs font-black uppercase tracking-widest text-on-surface-variant/60 mb-2">Modèle de formulaire</legend>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <button 
              onclick={() => { selectedTemplate = 'default'; customStructure = null; }}
              class="p-6 rounded-2xl border-2 transition-all {selectedTemplate === 'default' ? 'border-primary bg-primary/5' : 'border-outline-variant/20 hover:border-outline-variant/40'}"
            >
              <div class="text-3xl mb-3">📋</div>
              <h4 class="font-bold text-on-surface mb-1">Standard</h4>
              <p class="text-xs text-on-surface-variant/70">Formulaire complet avec toutes les questions standard</p>
            </button>
            <button 
              onclick={() => { selectedTemplate = 'simple'; customStructure = null; }}
              class="p-6 rounded-2xl border-2 transition-all {selectedTemplate === 'simple' ? 'border-primary bg-primary/5' : 'border-outline-variant/20 hover:border-outline-variant/40'}"
            >
              <div class="text-3xl mb-3">⚡</div>
              <h4 class="font-bold text-on-surface mb-1">Simplifié</h4>
              <p class="text-xs text-on-surface-variant/70">Formulaire rapide avec les questions essentielles</p>
            </button>
            <button 
              onclick={() => { selectedTemplate = 'custom'; }}
              class="p-6 rounded-2xl border-2 transition-all {selectedTemplate === 'custom' ? 'border-primary bg-primary/5' : 'border-outline-variant/20 hover:border-outline-variant/40'}"
            >
              <div class="text-3xl mb-3">🎨</div>
              <h4 class="font-bold text-on-surface mb-1">Personnalisé</h4>
              <p class="text-xs text-on-surface-variant/70">Créez votre propre formulaire</p>
            </button>
            <button 
              onclick={() => { selectedTemplate = 'google'; customStructure = null; }}
              class="p-6 rounded-2xl border-2 transition-all {selectedTemplate === 'google' ? 'border-primary bg-primary/5' : 'border-outline-variant/20 hover:border-outline-variant/40'}"
            >
              <div class="text-3xl mb-3">🔗</div>
              <h4 class="font-bold text-on-surface mb-1">Google Forms</h4>
              <p class="text-xs text-on-surface-variant/70">Intégration avec Google Forms</p>
            </button>
          </div>
          </fieldset>
        </div>

        <!-- Google Forms Instructions -->
        {#if selectedTemplate === 'google'}
          <div class="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6 space-y-4">
            <div class="flex items-start gap-4">
              <div class="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                <Papicon icon="info" size={24} class="text-amber-500" />
              </div>
              <div class="flex-1">
                <h4 class="font-bold text-amber-400 mb-2">Intégration Google Forms</h4>
                <p class="text-sm text-amber-400/80 mb-4">
                  Ce template est optimisé pour une intégration avec Google Forms. Après création, utilisez le script généré pour connecter votre formulaire Google à Kotbo.
                </p>
                <ol class="list-decimal list-inside space-y-2 text-sm text-amber-400/80">
                  <li>Créez votre formulaire sur Google Forms</li>
                  <li>Ajoutez les champs: Discord ID, Email, Âge</li>
                  <li>Utilisez le script généré pour connecter</li>
                  <li>Configurez le trigger onSubmit</li>
                </ol>
              </div>
            </div>
          </div>
        {/if}

        <!-- Custom Form Builder -->
        {#if selectedTemplate === 'custom'}
          <div class="space-y-6 pt-6 border-t border-outline-variant/10">
            <div class="flex items-center justify-between">
              <h4 class="text-lg font-black text-on-surface">Constructeur de Formulaire</h4>
              <div class="flex gap-2">
                <button 
                  onclick={() => addField('short_text')}
                  class="px-4 py-2 rounded-xl bg-surface-container text-xs font-black uppercase tracking-wider hover:bg-surface-container-high transition-all"
                >
                  Texte court
                </button>
                <button 
                  onclick={() => addField('paragraph')}
                  class="px-4 py-2 rounded-xl bg-surface-container text-xs font-black uppercase tracking-wider hover:bg-surface-container-high transition-all"
                >
                  Paragraphe
                </button>
                <button 
                  onclick={() => addField('multiple_choice')}
                  class="px-4 py-2 rounded-xl bg-surface-container text-xs font-black uppercase tracking-wider hover:bg-surface-container-high transition-all"
                >
                  Choix multiple
                </button>
                <button 
                  onclick={() => addField('email')}
                  class="px-4 py-2 rounded-xl bg-surface-container text-xs font-black uppercase tracking-wider hover:bg-surface-container-high transition-all"
                >
                  Email
                </button>
              </div>
            </div>

            {#if formFields.length > 0}
              <div class="space-y-4">
                {#each formFields as field, index (field.id)}
                  <div class="bg-surface-container-low/50 border border-outline-variant/10 rounded-2xl p-4 {editingFieldIndex === index ? 'ring-2 ring-primary' : ''}">
                    <div class="flex items-start justify-between mb-3">
                      <div class="flex-1">
                        <span class="text-[10px] font-mono text-on-surface-variant/50">{field.type}</span>
                        <input 
                          type="text" 
                          bind:value={field.label}
                          class="w-full bg-transparent text-on-surface font-bold focus:outline-hidden"
                          placeholder="Question"
                        />
                      </div>
                      <div class="flex gap-2">
                        <button 
                          onclick={() => editField(index)}
                          class="w-8 h-8 rounded-lg bg-surface-container hover:bg-surface-container-high flex items-center justify-center transition-colors"
                        >
                          <Papicon icon="edit" size={14} />
                        </button>
                        <button 
                          onclick={() => removeField(index)}
                          class="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 flex items-center justify-center transition-colors"
                        >
                          <Papicon icon="delete" size={14} />
                        </button>
                      </div>
                    </div>

                    {#if editingFieldIndex === index && currentField}
                      <div class="space-y-4 pt-4 border-t border-outline-variant/10">
                        <div>
                          <label for={`field-desc-${index}`} class="text-xs font-bold text-on-surface-variant/60 mb-2 block">Description</label>
                          <input 
                            id={`field-desc-${index}`}
                            type="text" 
                            bind:value={currentField.description}
                            class="w-full bg-surface-container rounded-xl px-4 py-2 text-sm"
                            placeholder="Description optionnelle"
                          />
                        </div>
                        <label class="flex items-center gap-3">
                          <input id={`field-required-${index}`} type="checkbox" bind:checked={currentField.required} class="w-5 h-5 rounded" />
                          <span class="text-sm font-medium">Question obligatoire</span>
                        </label>

                        {#if currentField.options}
                          <div class="space-y-2">
                            <span class="text-xs font-bold text-on-surface-variant/60 mb-2 block">Options</span>
                            {#each currentField.options as option, optIndex}
                              <div class="flex gap-2">
                                <input 
                                  id={`option-${index}-${optIndex}`}
                                  type="text" 
                                  bind:value={currentField.options[optIndex]}
                                  class="flex-1 bg-surface-container rounded-xl px-4 py-2 text-sm"
                                />
                                <button 
                                  onclick={() => removeOption(optIndex)}
                                  class="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center"
                                >
                                  <Papicon icon="close" size={14} />
                                </button>
                              </div>
                            {/each}
                            <button 
                              onclick={addOption}
                              class="px-4 py-2 rounded-xl bg-primary/10 text-primary text-xs font-black uppercase tracking-wider hover:bg-primary/20 transition-all"
                            >
                              + Ajouter option
                            </button>
                          </div>
                        {/if}

                        <button 
                          onclick={saveCurrentField}
                          class="px-6 py-2 rounded-xl bg-primary text-white text-xs font-black uppercase tracking-wider hover:bg-primary/90 transition-all"
                        >
                          Enregistrer
                        </button>
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>

              <button 
                onclick={buildCustomStructure}
                class="w-full px-6 py-4 rounded-xl bg-primary text-white font-black uppercase tracking-wider hover:bg-primary/90 transition-all"
              >
                Finaliser le formulaire
              </button>
            {:else}
              <div class="text-center py-12 text-on-surface-variant/30 border-2 border-dashed border-outline-variant/10 rounded-2xl">
                <Papicon icon="add_circle" size={48} class="mb-4" />
                <p class="text-sm">Ajoutez votre première question pour commencer</p>
              </div>
            {/if}
          </div>
        {/if}
      </div>
      
      <div class="p-8 bg-surface-container-low border-t border-outline-variant/20 flex gap-4 sticky bottom-0">
        <button onclick={() => showCreateModal = false} class="flex-1 py-4 rounded-xl font-bold bg-surface hover:bg-surface-hover transition-colors">Annuler</button>
        <button 
          onclick={createForm}
          disabled={createAction.state.loading || !newFormName.trim() || (selectedTemplate === 'custom' && !customStructure)}
          class="flex-1 py-4 rounded-xl font-black bg-primary text-on-primary hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
        >
          {createAction.state.loading ? 'Création...' : 'Créer le formulaire'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Google Apps Script Modal -->
{#if showScriptModal}
  <div class="fixed inset-0 z-9999 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
    <div class="bg-surface border border-outline-variant/30 rounded-[3rem] w-full max-w-4xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto">
      <div class="p-8 border-b border-outline-variant/20 flex items-center justify-between bg-primary/5 sticky top-0 bg-surface z-10">
        <div>
          <h3 class="text-2xl font-black text-on-surface">Script Google Apps Script</h3>
          <p class="text-on-surface-variant text-sm">Formulaire: {selectedForm?.name}</p>
        </div>
        <button onclick={() => showScriptModal = false} class="w-10 h-10 rounded-full flex items-center justify-center hover:bg-surface-hover transition-colors">
          <Papicon icon="x" size={24} />
        </button>
      </div>
      
      <div class="p-8 space-y-6">
        <div class="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex gap-4 text-amber-400">
          <Papicon icon="info" size={20} class="shrink-0" />
          <div class="text-sm">
            <p class="font-bold mb-1">Instructions d'installation</p>
            <ol class="list-decimal list-inside space-y-1 text-amber-400/80">
              <li>Ouvrez votre Google Form</li>
              <li>Cliquez sur "Extensions" > "Apps Script"</li>
              <li>Supprimez tout code existant</li>
              <li>Collez ce script</li>
              <li>Sauvegardez (Ctrl+S)</li>
              <li>Ajoutez un trigger: onSubmit > From form > On form submit</li>
            </ol>
          </div>
        </div>

        <div class="relative">
          <pre class="bg-surface-container rounded-2xl p-6 text-xs font-mono overflow-x-auto whitespace-pre-wrap text-on-surface">{generatedScript}</pre>
          <button 
            onclick={() => navigator.clipboard.writeText(generatedScript)}
            class="absolute top-4 right-4 px-4 py-2 rounded-xl bg-primary text-white text-xs font-black uppercase tracking-wider hover:bg-primary/90 transition-all"
          >
            Copier
          </button>
        </div>
      </div>
      
      <div class="p-8 bg-surface-container-low border-t border-outline-variant/20">
        <button onclick={() => showScriptModal = false} class="w-full py-4 rounded-xl font-bold bg-surface hover:bg-surface-hover transition-colors">Fermer</button>
      </div>
    </div>
  </div>
{/if}

<!-- API Key Success Modal -->
{#if showKeyModal}
  <div class="fixed inset-0 z-9999 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
    <div class="bg-surface border border-outline-variant/30 rounded-[3rem] w-full max-w-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 font-inter">
      <div class="p-8 border-b border-outline-variant/20 flex items-center justify-between bg-emerald-500/5">
        <div>
          <h3 class="text-2xl font-black text-emerald-500 flex items-center gap-2">
            <Papicon icon="check_circle" size={24} />
            Clé API Générée
          </h3>
          <p class="text-on-surface-variant text-sm">Conservez-la précieusement</p>
        </div>
        <button onclick={() => showKeyModal = false} class="w-10 h-10 rounded-full flex items-center justify-center hover:bg-surface-hover transition-colors">
          <Papicon icon="x" size={24} />
        </button>
      </div>
      
      <div class="p-8 space-y-6">
        <div class="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex gap-4 text-amber-400">
          <Papicon icon="warning" size={20} class="shrink-0" />
          <div class="text-sm leading-relaxed font-medium">
            <p class="font-bold mb-1">Attention sécurité</p>
            <p>Pour votre sécurité, cette clé API ne sera **plus jamais affichée**. Copiez-la immédiatement et collez-la dans votre Google Apps Script.</p>
          </div>
        </div>

        <div class="relative">
          <div class="bg-surface-container rounded-2xl p-6 text-sm font-mono break-all pr-24 border border-outline-variant/20 select-all text-on-surface">
            {newlyGeneratedKey}
          </div>
          <button 
            onclick={copyKeyToClipboard}
            class="absolute top-1/2 -translate-y-1/2 right-4 px-4 py-2.5 rounded-xl {keyCopied ? 'bg-emerald-500 text-white' : 'bg-primary text-white'} text-xs font-black uppercase tracking-wider hover:bg-primary/90 transition-all shadow-md active:scale-95"
          >
            {keyCopied ? 'Copié !' : 'Copier'}
          </button>
        </div>
      </div>
      
      <div class="p-8 bg-surface-container-low border-t border-outline-variant/20">
        <button onclick={() => showKeyModal = false} class="w-full py-4 rounded-xl font-bold bg-primary text-on-primary hover:bg-primary/90 transition-colors">J'ai copié la clé</button>
      </div>
    </div>
  </div>
{/if}

