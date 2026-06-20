<script lang="ts">
  import { onMount } from 'svelte';
  import { router } from 'tinro';
  import { authStore } from '../lib/stores/auth.svelte';
  import { API_BASE_URL } from '../lib/api';
  import Papicon from '../lib/components/Papicon.svelte';
  import { toast } from '../lib/stores/toast.svelte';

  // ── Props ──────────────────────────────────────────────────────────────────
  let { formId = null }: { formId?: string | null } = $props();

  // ── Types ──────────────────────────────────────────────────────────────────
  type FieldType =
    | 'short_text' | 'paragraph' | 'multiple_choice' | 'checkboxes'
    | 'dropdown' | 'linear_scale' | 'multiple_choice_grid' | 'checkbox_grid'
    | 'date' | 'time' | 'number' | 'email' | 'section_header';

  interface ConditionalLogic {
    fieldId: string;
    value: string;
    action: 'go_to_section';
    targetSectionIndex: number;
  }

  interface GridRow { id: string; label: string; }
  interface GridColumn { id: string; label: string; }

  interface FormField {
    id: string;
    type: FieldType;
    label: string;
    description?: string;
    required: boolean;
    placeholder?: string;
    options?: string[];
    rows?: GridRow[];
    columns?: GridColumn[];
    scaleMin?: number;
    scaleMax?: number;
    scaleMinLabel?: string;
    scaleMaxLabel?: string;
    validation?: { min?: number; max?: number; pattern?: string };
    logic?: ConditionalLogic[];
    sectionIndex: number;
  }

  interface Section {
    id: string;
    title: string;
    description?: string;
  }

  // ── State ──────────────────────────────────────────────────────────────────
  let formName = $state('Formulaire sans titre');
  let formDescription = $state('');
  let headerColor = $state('#6366f1');
  let sections = $state<Section[]>([{ id: 'section_0', title: 'Section 1', description: '' }]);
  let fields = $state<FormField[]>([]);
  let activeFieldId = $state<string | null>(null);
  let activeSection = $state(0);
  let showPreview = $state(false);
  let saving = $state(false);
  let loading = $state(true);
  let dragOverId = $state<string | null>(null);
  let dragSourceId = $state<string | null>(null);

  const PALETTE = ['#6366f1','#8b5cf6','#ec4899','#f43f5e','#f97316','#eab308','#22c55e','#14b8a6','#0ea5e9','#1d4ed8','#374151'];

  const FIELD_TYPES: { type: FieldType; label: string; icon: string }[] = [
    { type: 'short_text',           label: 'Texte court',         icon: 'short_text' },
    { type: 'paragraph',            label: 'Paragraphe',          icon: 'notes' },
    { type: 'multiple_choice',      label: 'Choix unique',        icon: 'radio_button_checked' },
    { type: 'checkboxes',           label: 'Cases à cocher',      icon: 'check_box' },
    { type: 'dropdown',             label: 'Liste déroulante',    icon: 'arrow_drop_down_circle' },
    { type: 'linear_scale',         label: 'Échelle linéaire',    icon: 'linear_scale' },
    { type: 'multiple_choice_grid', label: 'Grille (choix)',      icon: 'grid_on' },
    { type: 'checkbox_grid',        label: 'Grille (cases)',      icon: 'grid_view' },
    { type: 'date',                 label: 'Date',                icon: 'calendar_today' },
    { type: 'time',                 label: 'Heure',               icon: 'schedule' },
    { type: 'number',               label: 'Nombre',              icon: 'pin' },
    { type: 'email',                label: 'Email',               icon: 'email' },
    { type: 'section_header',       label: 'Titre de section',    icon: 'title' },
  ];

  // ── Derived ────────────────────────────────────────────────────────────────
  const isCustomFormMode = $derived(window.location.pathname.startsWith('/forms'));
  const activeField = $derived(fields.find(f => f.id === activeFieldId) ?? null);
  const sectionFields = $derived((sIdx: number) => fields.filter(f => f.sectionIndex === sIdx));
  const publicUrl = $derived(formId ? `${window.location.origin}/form/${formId}` : null);

  // ── Load ───────────────────────────────────────────────────────────────────
  onMount(async () => {
    if (formId && formId !== 'new') {
      try {
        const endpoint = isCustomFormMode
          ? `${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/custom-forms/${formId}`
          : `${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/recruitment/forms/${formId}`;
        const res = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${authStore.token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const form = data.form;
          const structure = form.structure as any;
          formName = form.name;
          formDescription = form.description || '';
          headerColor = structure.headerColor || '#6366f1';
          sections = structure.sections || [{ id: 'section_0', title: 'Section 1', description: '' }];
          fields = structure.fields || [];
        }
      } catch { /* ignore */ }
    }
    loading = false;
  });

  // ── Auto-save (debounce 2s) ────────────────────────────────────────────────
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    // Access reactive state to subscribe
    void formName; void formDescription; void headerColor;
    void JSON.stringify(sections); void JSON.stringify(fields);
    if (loading) return;
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => { void save(true); }, 2000);
  });

  // ── Actions ────────────────────────────────────────────────────────────────
  function uid() { return `f_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

  function addField(type: FieldType) {
    const defaults: Partial<FormField> = {};
    if (['multiple_choice','checkboxes','dropdown'].includes(type)) defaults.options = ['Option 1', 'Option 2'];
    if (type === 'linear_scale') { defaults.scaleMin = 1; defaults.scaleMax = 5; defaults.scaleMinLabel = ''; defaults.scaleMaxLabel = ''; }
    if (type === 'multiple_choice_grid' || type === 'checkbox_grid') {
      defaults.rows = [{ id: uid(), label: 'Ligne 1' }];
      defaults.columns = [{ id: uid(), label: 'Colonne 1' }, { id: uid(), label: 'Colonne 2' }];
    }
    const newField: FormField = {
      id: uid(), type, sectionIndex: activeSection,
      label: 'Nouvelle question', required: false, ...defaults,
    };
    fields = [...fields, newField];
    activeFieldId = newField.id;
  }

  function duplicateField(field: FormField) {
    const copy: FormField = { ...field, id: uid(), label: field.label + ' (copie)' };
    if (field.options) copy.options = [...field.options];
    const idx = fields.findIndex(f => f.id === field.id);
    fields = [...fields.slice(0, idx + 1), copy, ...fields.slice(idx + 1)];
    activeFieldId = copy.id;
  }

  function removeField(id: string) {
    fields = fields.filter(f => f.id !== id);
    if (activeFieldId === id) activeFieldId = null;
  }

  function addSection() {
    const idx = sections.length;
    sections = [...sections, { id: uid(), title: `Section ${idx + 1}`, description: '' }];
  }

  function removeSection(idx: number) {
    if (sections.length === 1) return;
    sections = sections.filter((_, i) => i !== idx);
    // Re-index fields
    fields = fields
      .filter(f => f.sectionIndex !== idx)
      .map(f => ({ ...f, sectionIndex: f.sectionIndex > idx ? f.sectionIndex - 1 : f.sectionIndex }));
    if (activeSection >= sections.length) activeSection = sections.length - 1;
  }

  function updateField<K extends keyof FormField>(id: string, key: K, value: FormField[K]) {
    fields = fields.map(f => f.id === id ? { ...f, [key]: value } : f);
  }

  function addOption(fieldId: string) {
    const field = fields.find(f => f.id === fieldId);
    if (!field?.options) return;
    updateField(fieldId, 'options', [...field.options, `Option ${field.options.length + 1}`]);
  }

  function removeOption(fieldId: string, optIdx: number) {
    const field = fields.find(f => f.id === fieldId);
    if (!field?.options) return;
    updateField(fieldId, 'options', field.options.filter((_, i) => i !== optIdx));
  }

  function updateOption(fieldId: string, optIdx: number, value: string) {
    const field = fields.find(f => f.id === fieldId);
    if (!field?.options) return;
    const opts = [...field.options];
    opts[optIdx] = value;
    updateField(fieldId, 'options', opts);
  }

  function addGridRow(fieldId: string) {
    const field = fields.find(f => f.id === fieldId);
    if (!field?.rows) return;
    updateField(fieldId, 'rows', [...field.rows, { id: uid(), label: `Ligne ${field.rows.length + 1}` }]);
  }

  function addGridColumn(fieldId: string) {
    const field = fields.find(f => f.id === fieldId);
    if (!field?.columns) return;
    updateField(fieldId, 'columns', [...field.columns, { id: uid(), label: `Colonne ${field.columns.length + 1}` }]);
  }

  function addLogicRule(fieldId: string) {
    const field = fields.find(f => f.id === fieldId);
    const existing = field?.logic || [];
    updateField(fieldId, 'logic', [...existing, {
      fieldId, value: '', action: 'go_to_section', targetSectionIndex: 0,
    }]);
  }

  // ── Drag-and-drop (native) ─────────────────────────────────────────────────
  function onDragStart(e: DragEvent, id: string) {
    dragSourceId = id;
    (e.dataTransfer as DataTransfer).effectAllowed = 'move';
  }

  function onDragOver(e: DragEvent, id: string) {
    e.preventDefault();
    dragOverId = id;
  }

  function onDrop(e: DragEvent, targetId: string) {
    e.preventDefault();
    if (!dragSourceId || dragSourceId === targetId) { dragOverId = null; return; }
    const srcIdx = fields.findIndex(f => f.id === dragSourceId);
    const tgtIdx = fields.findIndex(f => f.id === targetId);
    const reordered = [...fields];
    const [moved] = reordered.splice(srcIdx, 1);
    reordered.splice(tgtIdx, 0, moved);
    fields = reordered;
    dragOverId = null;
    dragSourceId = null;
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  async function save(silent = false) {
    if (!authStore.selectedGuildId) return;
    saving = true;
    const structure = { title: formName, description: formDescription, headerColor, sections, fields };
    try {
      if (formId && formId !== 'new') {
        // Update existing
        const endpoint = isCustomFormMode
          ? `${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/custom-forms/${formId}`
          : `${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/recruitment/forms/${formId}`;
        await fetch(endpoint, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${authStore.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: formName, description: formDescription, structure }),
        });
        if (!silent) toast.success('Formulaire enregistré !');
      } else {
        // Create new → navigate to edit URL
        const endpoint = isCustomFormMode
          ? `${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/custom-forms`
          : `${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/recruitment/forms`;
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { Authorization: `Bearer ${authStore.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: formName, description: formDescription, structure, template: 'custom' }),
        });
        if (res.ok) {
          const data = await res.json();
          const targetUrl = isCustomFormMode
            ? `/forms/builder/${data.form.id}`
            : `/recruitment-forms/builder/${data.form.id}`;
          router.goto(targetUrl);
          toast.success('Formulaire créé !');
        }
      }
    } catch {
      if (!silent) toast.error('Erreur lors de la sauvegarde');
    } finally {
      saving = false;
    }
  }

  function copyPublicUrl() {
    if (publicUrl) {
      navigator.clipboard.writeText(publicUrl);
      toast.success('URL copiée !');
    }
  }
</script>

{#if loading}
  <div class="flex items-center justify-center min-h-screen bg-surface">
    <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
  </div>
{:else if showPreview}
  <!-- ── PREVIEW MODE ───────────────────────────────────────────────────────── -->
  <div class="min-h-screen bg-surface/50">
    <div class="sticky top-0 z-50 bg-surface border-b border-outline-variant/20 px-6 py-3 flex items-center justify-between">
      <span class="font-black text-on-surface">Aperçu du formulaire</span>
      <button onclick={() => showPreview = false}
        class="px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold flex items-center gap-2">
        <Papicon icon="edit" size={16} /> Retour à l'édition
      </button>
    </div>
    <div class="max-w-2xl mx-auto p-6 space-y-4 pt-8">
      <!-- Header card -->
      <div class="rounded-2xl overflow-hidden shadow-lg">
        <div class="h-2" style="background:{headerColor}"></div>
        <div class="bg-surface border border-outline-variant/20 p-6 rounded-b-2xl">
          <h1 class="text-2xl font-black text-on-surface">{formName}</h1>
          {#if formDescription}<p class="text-on-surface-variant/70 mt-2 text-sm">{formDescription}</p>{/if}
        </div>
      </div>

      {#each sections as section, sIdx}
        {#if sIdx > 0}
          <div class="bg-surface border border-outline-variant/20 rounded-2xl p-5 shadow">
            <div class="h-1 rounded-full mb-4" style="background:{headerColor}"></div>
            <h2 class="text-lg font-black text-on-surface">{section.title}</h2>
            {#if section.description}<p class="text-sm text-on-surface-variant/70 mt-1">{section.description}</p>{/if}
          </div>
        {/if}
        {#each sectionFields(sIdx) as field (field.id)}
          {#if field.type !== 'section_header'}
            <div class="bg-surface border border-outline-variant/20 rounded-2xl p-5 shadow">
              <span class="block font-semibold text-on-surface mb-1">
                {field.label}{#if field.required}<span class="text-rose-500 ml-1">*</span>{/if}
              </span>
              {#if field.description}<p class="text-xs text-on-surface-variant/60 mb-3">{field.description}</p>{/if}

              {#if field.type === 'short_text' || field.type === 'email' || field.type === 'number'}
                <input type={field.type === 'email' ? 'email' : field.type === 'number' ? 'number' : 'text'}
                  placeholder={field.placeholder || ''}
                  class="w-full bg-surface-container rounded-xl px-4 py-2.5 text-sm border-b-2 border-primary/30 focus:border-primary outline-none transition-colors" />
              {:else if field.type === 'paragraph'}
                <textarea placeholder={field.placeholder || ''}
                  class="w-full bg-surface-container rounded-xl px-4 py-2.5 text-sm border-b-2 border-primary/30 focus:border-primary outline-none transition-colors resize-none h-24"></textarea>
              {:else if field.type === 'multiple_choice'}
                <div class="space-y-2">
                  {#each field.options || [] as opt}
                    <label class="flex items-center gap-3 cursor-pointer">
                      <input type="radio" name={field.id} class="accent-primary w-4 h-4" />
                      <span class="text-sm text-on-surface">{opt}</span>
                    </label>
                  {/each}
                </div>
              {:else if field.type === 'checkboxes'}
                <div class="space-y-2">
                  {#each field.options || [] as opt}
                    <label class="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" class="accent-primary w-4 h-4 rounded" />
                      <span class="text-sm text-on-surface">{opt}</span>
                    </label>
                  {/each}
                </div>
              {:else if field.type === 'dropdown'}
                <select class="w-full bg-surface-container rounded-xl px-4 py-2.5 text-sm outline-none border border-outline-variant/30">
                  <option value="">Sélectionner...</option>
                  {#each field.options || [] as opt}
                    <option>{opt}</option>
                  {/each}
                </select>
              {:else if field.type === 'linear_scale'}
                <div class="flex items-center gap-4 mt-2">
                  {#if field.scaleMinLabel}<span class="text-xs text-on-surface-variant/60">{field.scaleMinLabel}</span>{/if}
                  <div class="flex gap-3 flex-1 justify-center">
                    {#each Array.from({ length: (field.scaleMax ?? 5) - (field.scaleMin ?? 1) + 1 }, (_, i) => (field.scaleMin ?? 1) + i) as n}
                      <label class="flex flex-col items-center gap-1 cursor-pointer">
                        <input type="radio" name={field.id} class="accent-primary" />
                        <span class="text-xs">{n}</span>
                      </label>
                    {/each}
                  </div>
                  {#if field.scaleMaxLabel}<span class="text-xs text-on-surface-variant/60">{field.scaleMaxLabel}</span>{/if}
                </div>
              {:else if field.type === 'date'}
                <input type="date" class="w-full bg-surface-container rounded-xl px-4 py-2.5 text-sm outline-none border border-outline-variant/30" />
              {:else if field.type === 'time'}
                <input type="time" class="w-full bg-surface-container rounded-xl px-4 py-2.5 text-sm outline-none border border-outline-variant/30" />
              {:else if field.type === 'multiple_choice_grid' || field.type === 'checkbox_grid'}
                <div class="overflow-x-auto mt-2">
                  <table class="w-full text-sm">
                    <thead>
                      <tr>
                        <th class="text-left py-1 pr-4 text-on-surface-variant/60"></th>
                        {#each field.columns || [] as col}
                          <th class="text-center py-1 px-2 text-xs font-semibold text-on-surface-variant/70">{col.label}</th>
                        {/each}
                      </tr>
                    </thead>
                    <tbody>
                      {#each field.rows || [] as row}
                        <tr class="border-t border-outline-variant/10">
                          <td class="py-2 pr-4 text-on-surface/80">{row.label}</td>
                          {#each field.columns || [] as col}
                            <td class="py-2 px-2 text-center">
                              <input type={field.type === 'checkbox_grid' ? 'checkbox' : 'radio'} name={`${field.id}_${row.id}`} class="accent-primary" />
                            </td>
                          {/each}
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              {/if}
            </div>
          {:else}
            <div class="bg-surface border-l-4 rounded-2xl p-5 shadow" style="border-left-color:{headerColor}">
              <h3 class="font-black text-on-surface text-lg">{field.label}</h3>
              {#if field.description}<p class="text-sm text-on-surface-variant/70 mt-1">{field.description}</p>{/if}
            </div>
          {/if}
        {/each}
      {/each}

      <div class="flex justify-end pt-4">
        <button class="px-8 py-3 rounded-xl text-white font-black text-sm" style="background:{headerColor}">
          Envoyer
        </button>
      </div>
    </div>
  </div>

{:else}
  <!-- ── EDITOR MODE ────────────────────────────────────────────────────────── -->
  <div class="flex flex-col min-h-screen bg-surface">

    <!-- Top bar -->
    <div class="sticky top-0 z-50 bg-surface/95 backdrop-blur border-b border-outline-variant/20 px-4 py-2 flex items-center gap-3">
      <button onclick={() => router.goto(isCustomFormMode ? '/forms' : '/recruitment-forms')}
        class="p-2 rounded-xl hover:bg-surface-container transition-colors">
        <Papicon icon="arrow_back" size={20} />
      </button>
      <div class="flex-1 min-w-0">
        <input bind:value={formName}
          class="w-full bg-transparent text-lg font-black text-on-surface outline-none focus:border-b-2 focus:border-primary"
          placeholder="Titre du formulaire" />
      </div>

      <div class="flex items-center gap-2 ml-auto shrink-0">
        {#if publicUrl}
          <button onclick={copyPublicUrl}
            class="px-3 py-1.5 rounded-xl bg-surface-container text-xs font-bold flex items-center gap-1.5 hover:bg-surface-container-high transition-colors"
            title="Copier le lien public">
            <Papicon icon="link" size={14} />
            <span class="hidden sm:inline">Lien public</span>
          </button>
        {/if}
        <button onclick={() => showPreview = true}
          class="px-3 py-1.5 rounded-xl bg-surface-container text-xs font-bold flex items-center gap-1.5 hover:bg-surface-container-high transition-colors">
          <Papicon icon="visibility" size={14} />
          <span class="hidden sm:inline">Aperçu</span>
        </button>
        <button onclick={() => save(false)}
          class="px-4 py-1.5 rounded-xl bg-primary text-white text-xs font-black flex items-center gap-1.5 hover:bg-primary/90 transition-colors disabled:opacity-60"
          disabled={saving}>
          {#if saving}
            <div class="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
          {:else}
            <Papicon icon="save" size={14} />
          {/if}
          <span class="hidden sm:inline">Enregistrer</span>
        </button>
      </div>
    </div>

    <div class="flex flex-1 overflow-hidden">

      <!-- ── LEFT SIDEBAR: sections + question types ───────────────────────── -->
      <aside class="w-72 shrink-0 border-r border-outline-variant/20 flex flex-col bg-surface-container-low/40 overflow-y-auto">

        <!-- Header color picker -->
        <div class="p-4 border-b border-outline-variant/10">
          <p class="text-xs font-black uppercase tracking-widest text-on-surface-variant/60 mb-2">Couleur d'en-tête</p>
          <div class="flex flex-wrap gap-2">
            {#each PALETTE as color}
              <button onclick={() => headerColor = color}
                class="w-6 h-6 rounded-full transition-transform hover:scale-110 {headerColor === color ? 'ring-2 ring-offset-2 ring-offset-surface ring-primary scale-110' : ''}"
                style="background:{color}"
                aria-label="Sélectionner la couleur d'en-tête {color}"
              ></button>
            {/each}
          </div>
        </div>

        <!-- Sections -->
        <div class="p-4 border-b border-outline-variant/10">
          <div class="flex items-center justify-between mb-2">
            <p class="text-xs font-black uppercase tracking-widest text-on-surface-variant/60">Sections</p>
            <button onclick={addSection}
              class="p-1 rounded-lg hover:bg-surface-container transition-colors text-primary">
              <Papicon icon="add" size={16} />
            </button>
          </div>
          <div class="space-y-1">
            {#each sections as section, sIdx}
              <div class="flex items-center gap-2 group">
                <button onclick={() => activeSection = sIdx}
                  class="flex-1 text-left px-3 py-2 rounded-xl text-sm font-semibold transition-all {activeSection === sIdx ? 'bg-primary text-white' : 'hover:bg-surface-container text-on-surface/70'}">
                  {section.title || `Section ${sIdx + 1}`}
                </button>
                {#if sections.length > 1}
                  <button onclick={() => removeSection(sIdx)}
                    class="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-rose-500/20 text-rose-500 transition-all">
                    <Papicon icon="close" size={14} />
                  </button>
                {/if}
              </div>
            {/each}
          </div>
        </div>

        <!-- Add question types -->
        <div class="p-4 flex-1">
          <p class="text-xs font-black uppercase tracking-widest text-on-surface-variant/60 mb-3">Ajouter une question</p>
          <div class="grid grid-cols-1 gap-1">
            {#each FIELD_TYPES as ft}
              <button onclick={() => addField(ft.type)}
                class="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-surface-container text-left transition-colors group">
                <Papicon icon={ft.icon} size={16} class="text-primary/70 group-hover:text-primary transition-colors" />
                <span class="text-xs font-semibold text-on-surface/70 group-hover:text-on-surface transition-colors">{ft.label}</span>
              </button>
            {/each}
          </div>
        </div>
      </aside>

      <!-- ── CENTER: canvas ────────────────────────────────────────────────── -->
      <main class="flex-1 overflow-y-auto bg-surface/50 p-6">
        <div class="max-w-2xl mx-auto space-y-3">

          <!-- Form header card -->
          <div class="rounded-2xl overflow-hidden shadow-sm border border-outline-variant/20">
            <div class="h-2 transition-colors" style="background:{headerColor}"></div>
            <div class="bg-surface p-5">
              <input bind:value={formName}
                class="w-full bg-transparent text-xl font-black text-on-surface outline-none border-b-2 border-transparent focus:border-primary/50 pb-1 mb-2 transition-colors"
                placeholder="Titre du formulaire" />
              <input bind:value={formDescription}
                class="w-full bg-transparent text-sm text-on-surface-variant outline-none border-b border-transparent focus:border-primary/30 pb-1 transition-colors"
                placeholder="Description (optionnelle)" />
            </div>
          </div>

          <!-- Section header editor (active section > 0) -->
          {#if activeSection > 0}
            <div class="rounded-2xl border-l-4 border-primary bg-surface p-5 shadow-sm border border-outline-variant/20">
              <input bind:value={sections[activeSection].title}
                class="w-full bg-transparent text-lg font-black text-on-surface outline-none border-b-2 border-transparent focus:border-primary/50 pb-1 mb-2 transition-colors"
                placeholder="Titre de la section" />
              <input bind:value={sections[activeSection].description}
                class="w-full bg-transparent text-sm text-on-surface-variant outline-none border-b border-transparent focus:border-primary/30 pb-1 transition-colors"
                placeholder="Description de la section (optionnelle)" />
            </div>
          {/if}

          <!-- Fields -->
          {#each sectionFields(activeSection) as field (field.id)}
            {@const isActive = activeFieldId === field.id}
            <div
              role="button"
              tabindex="0"
              draggable="true"
              ondragstart={(e) => onDragStart(e, field.id)}
              ondragover={(e) => onDragOver(e, field.id)}
              ondrop={(e) => onDrop(e, field.id)}
              ondragleave={() => dragOverId = null}
              onclick={() => activeFieldId = field.id}
              onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') activeFieldId = field.id; }}
              class="rounded-2xl bg-surface border-2 shadow-sm cursor-pointer transition-all outline-none focus:ring-2 focus:ring-primary/40
                {isActive ? 'border-primary shadow-primary/10' : 'border-outline-variant/20 hover:border-outline-variant/40'}
                {dragOverId === field.id ? 'scale-[1.01] border-primary/60' : ''}">

              <!-- Drag handle row -->
              <div class="flex items-center gap-2 px-4 pt-4 pb-2 border-b border-outline-variant/10">
                <Papicon icon="drag_indicator" size={18} class="text-on-surface-variant/30 cursor-grab" />
                <span class="text-[10px] font-mono text-on-surface-variant/40 uppercase">
                  {FIELD_TYPES.find(t => t.type === field.type)?.label ?? field.type}
                </span>
                <div class="ml-auto flex gap-1">
                  <button onclick={(e) => { e.stopPropagation(); duplicateField(field); }}
                    class="p-1.5 rounded-lg hover:bg-surface-container transition-colors" title="Dupliquer">
                    <Papicon icon="content_copy" size={14} />
                  </button>
                  <button onclick={(e) => { e.stopPropagation(); removeField(field.id); }}
                    class="p-1.5 rounded-lg hover:bg-rose-500/10 text-rose-500 transition-colors" title="Supprimer">
                    <Papicon icon="delete" size={14} />
                  </button>
                </div>
              </div>

              <div class="p-4 space-y-3">
                {#if field.type === 'section_header'}
                  <input value={field.label} oninput={(e) => updateField(field.id, 'label', (e.target as HTMLInputElement).value)}
                    class="w-full text-lg font-black bg-transparent outline-none border-b-2 border-transparent focus:border-primary/50 pb-1"
                    placeholder="Titre de section" />
                  <input value={field.description || ''} oninput={(e) => updateField(field.id, 'description', (e.target as HTMLInputElement).value)}
                    class="w-full text-sm bg-transparent outline-none text-on-surface-variant border-b border-transparent focus:border-primary/30 pb-1"
                    placeholder="Description (optionnelle)" />
                {:else}
                  <!-- Label + required -->
                  <div class="flex items-start gap-3">
                    <input value={field.label} oninput={(e) => updateField(field.id, 'label', (e.target as HTMLInputElement).value)}
                      class="flex-1 text-base font-semibold bg-transparent outline-none border-b-2 border-transparent focus:border-primary/50 pb-1"
                      placeholder="Question" />
                    <label class="flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant/60 shrink-0 cursor-pointer mt-1">
                      <input type="checkbox" checked={field.required} onchange={(e) => updateField(field.id, 'required', (e.target as HTMLInputElement).checked)}
                        class="accent-primary" />
                      Obligatoire
                    </label>
                  </div>

                  <!-- Preview of field type -->
                  {#if field.type === 'short_text' || field.type === 'email' || field.type === 'number'}
                    <input disabled placeholder={field.placeholder || 'Réponse courte'}
                      class="w-full bg-surface-container/50 rounded-lg px-3 py-2 text-sm text-on-surface-variant/50 border-b border-outline-variant/30" />
                  {:else if field.type === 'paragraph'}
                    <div class="w-full bg-surface-container/50 rounded-lg px-3 py-2 text-sm text-on-surface-variant/40 border-b border-outline-variant/30 h-14">
                      Réponse longue...
                    </div>
                  {:else if field.type === 'date'}
                    <input type="date" disabled class="bg-surface-container/50 rounded-lg px-3 py-2 text-sm text-on-surface-variant/50 border border-outline-variant/20" />
                  {:else if field.type === 'time'}
                    <input type="time" disabled class="bg-surface-container/50 rounded-lg px-3 py-2 text-sm text-on-surface-variant/50 border border-outline-variant/20" />
                  {:else if field.type === 'linear_scale'}
                    <div class="flex items-center gap-2 text-xs text-on-surface-variant/60">
                      <span>{field.scaleMin ?? 1}</span>
                      <div class="flex-1 h-1 bg-primary/20 rounded-full"></div>
                      <span>{field.scaleMax ?? 5}</span>
                    </div>
                  {:else if field.type === 'multiple_choice' || field.type === 'checkboxes' || field.type === 'dropdown'}
                    <div class="space-y-1.5">
                      {#each field.options || [] as opt, optIdx}
                        <div class="flex items-center gap-2">
                          {#if field.type === 'multiple_choice'}<div class="w-3.5 h-3.5 rounded-full border-2 border-primary/40 shrink-0"></div>
                          {:else if field.type === 'checkboxes'}<div class="w-3.5 h-3.5 rounded border-2 border-primary/40 shrink-0"></div>
                          {:else}<span class="text-xs text-on-surface-variant/40 w-4">{optIdx + 1}.</span>{/if}
                          <input value={opt} oninput={(e) => updateOption(field.id, optIdx, (e.target as HTMLInputElement).value)}
                            class="flex-1 bg-transparent border-b border-outline-variant/20 focus:border-primary/50 outline-none text-sm pb-0.5"
                            placeholder={`Option ${optIdx + 1}`} />
                          <button onclick={() => removeOption(field.id, optIdx)}
                            class="p-0.5 rounded hover:bg-rose-500/10 text-rose-400 transition-colors">
                            <Papicon icon="close" size={12} />
                          </button>
                        </div>
                      {/each}
                      <button onclick={() => addOption(field.id)}
                        class="text-xs text-primary/70 hover:text-primary font-semibold ml-5 transition-colors">
                        + Ajouter une option
                      </button>
                    </div>
                  {:else if field.type === 'multiple_choice_grid' || field.type === 'checkbox_grid'}
                    <div class="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <p class="font-bold text-on-surface-variant/60 mb-1">Lignes</p>
                        {#each field.rows || [] as row}
                          <input value={row.label} oninput={(e) => { const rows = [...(field.rows||[])]; rows[rows.indexOf(row)].label = (e.target as HTMLInputElement).value; updateField(field.id,'rows',rows); }}
                            class="block w-full bg-transparent border-b border-outline-variant/20 focus:border-primary/50 outline-none py-0.5 mb-1" />
                        {/each}
                        <button onclick={() => addGridRow(field.id)} class="text-primary/70 hover:text-primary font-semibold">+ Ligne</button>
                      </div>
                      <div>
                        <p class="font-bold text-on-surface-variant/60 mb-1">Colonnes</p>
                        {#each field.columns || [] as col}
                          <input value={col.label} oninput={(e) => { const cols = [...(field.columns||[])]; cols[cols.indexOf(col)].label = (e.target as HTMLInputElement).value; updateField(field.id,'columns',cols); }}
                            class="block w-full bg-transparent border-b border-outline-variant/20 focus:border-primary/50 outline-none py-0.5 mb-1" />
                        {/each}
                        <button onclick={() => addGridColumn(field.id)} class="text-primary/70 hover:text-primary font-semibold">+ Colonne</button>
                      </div>
                    </div>
                  {/if}

                  <!-- Expanded options when active -->
                  {#if isActive}
                    <div class="border-t border-outline-variant/10 pt-3 mt-2 space-y-3">
                      <input value={field.description || ''} oninput={(e) => updateField(field.id, 'description', (e.target as HTMLInputElement).value)}
                        class="w-full text-xs bg-surface-container rounded-lg px-3 py-2 outline-none focus:ring-1 ring-primary/30"
                        placeholder="Aide / description (optionnel)" />
                      {#if field.type === 'short_text' || field.type === 'paragraph' || field.type === 'number' || field.type === 'email'}
                        <input value={field.placeholder || ''} oninput={(e) => updateField(field.id, 'placeholder', (e.target as HTMLInputElement).value)}
                          class="w-full text-xs bg-surface-container rounded-lg px-3 py-2 outline-none focus:ring-1 ring-primary/30"
                          placeholder="Texte de placeholder" />
                      {/if}
                      {#if field.type === 'number'}
                        <div class="flex gap-2">
                          <input type="number" value={field.validation?.min ?? ''} oninput={(e) => updateField(field.id,'validation',{...field.validation,min:+(e.target as HTMLInputElement).value})}
                            class="w-1/2 text-xs bg-surface-container rounded-lg px-3 py-2 outline-none" placeholder="Min" />
                          <input type="number" value={field.validation?.max ?? ''} oninput={(e) => updateField(field.id,'validation',{...field.validation,max:+(e.target as HTMLInputElement).value})}
                            class="w-1/2 text-xs bg-surface-container rounded-lg px-3 py-2 outline-none" placeholder="Max" />
                        </div>
                      {/if}
                      {#if field.type === 'linear_scale'}
                        <div class="flex gap-2 flex-wrap">
                          <input type="number" min="0" max="10" value={field.scaleMin ?? 1} oninput={(e) => updateField(field.id,'scaleMin',+(e.target as HTMLInputElement).value)}
                            class="w-20 text-xs bg-surface-container rounded-lg px-3 py-2 outline-none" placeholder="Min" />
                          <input type="number" min="1" max="10" value={field.scaleMax ?? 5} oninput={(e) => updateField(field.id,'scaleMax',+(e.target as HTMLInputElement).value)}
                            class="w-20 text-xs bg-surface-container rounded-lg px-3 py-2 outline-none" placeholder="Max" />
                          <input value={field.scaleMinLabel || ''} oninput={(e) => updateField(field.id,'scaleMinLabel',(e.target as HTMLInputElement).value)}
                            class="flex-1 text-xs bg-surface-container rounded-lg px-3 py-2 outline-none" placeholder="Label min" />
                          <input value={field.scaleMaxLabel || ''} oninput={(e) => updateField(field.id,'scaleMaxLabel',(e.target as HTMLInputElement).value)}
                            class="flex-1 text-xs bg-surface-container rounded-lg px-3 py-2 outline-none" placeholder="Label max" />
                        </div>
                      {/if}

                      <!-- Conditional logic (multiple_choice, dropdown) -->
                      {#if (field.type === 'multiple_choice' || field.type === 'dropdown') && sections.length > 1}
                        <div class="border-t border-outline-variant/10 pt-3">
                          <div class="flex items-center justify-between mb-2">
                            <span class="text-xs font-bold text-on-surface-variant/60">Logique conditionnelle</span>
                            <button onclick={() => addLogicRule(field.id)}
                              class="text-xs text-primary/70 hover:text-primary font-semibold transition-colors">+ Règle</button>
                          </div>
                          {#each field.logic || [] as rule, rIdx}
                            <div class="flex items-center gap-2 text-xs mb-2 flex-wrap">
                              <span class="text-on-surface-variant/60">Si réponse =</span>
                              <select value={rule.value} onchange={(e) => { const logic=[...(field.logic||[])]; logic[rIdx]={...rule,value:(e.target as HTMLSelectElement).value}; updateField(field.id,'logic',logic); }}
                                class="bg-surface-container rounded-lg px-2 py-1 outline-none text-xs">
                                {#each field.options || [] as opt}
                                  <option value={opt}>{opt}</option>
                                {/each}
                              </select>
                              <span class="text-on-surface-variant/60">→ aller à</span>
                              <select value={rule.targetSectionIndex} onchange={(e) => { const logic=[...(field.logic||[])]; logic[rIdx]={...rule,targetSectionIndex:+(e.target as HTMLSelectElement).value}; updateField(field.id,'logic',logic); }}
                                class="bg-surface-container rounded-lg px-2 py-1 outline-none text-xs">
                                {#each sections as s, si}
                                  <option value={si}>{s.title || `Section ${si+1}`}</option>
                                {/each}
                              </select>
                              <button onclick={() => { const logic=[...(field.logic||[])]; logic.splice(rIdx,1); updateField(field.id,'logic',logic); }}
                                class="text-rose-400 hover:text-rose-500 transition-colors">
                                <Papicon icon="close" size={12} />
                              </button>
                            </div>
                          {/each}
                        </div>
                      {/if}
                    </div>
                  {/if}
                {/if}
              </div>
            </div>
          {/each}

          {#if sectionFields(activeSection).length === 0}
            <div class="rounded-2xl border-2 border-dashed border-outline-variant/20 p-12 text-center text-on-surface-variant/30">
              <Papicon icon="add_circle" size={48} class="mb-3" />
              <p class="text-sm">Cliquez sur un type de question dans le panneau gauche pour commencer</p>
            </div>
          {/if}
        </div>
      </main>
    </div>
  </div>
{/if}
