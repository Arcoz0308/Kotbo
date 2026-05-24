<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import { router } from 'tinro';
  import ModulePage from '../lib/components/ModulePage.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import FormInput from '../lib/components/FormInput.svelte';
  import FormTextarea from '../lib/components/FormTextarea.svelte';
  import { toast } from '../lib/stores/toast.svelte';
  import { API_BASE_URL } from '../lib/api';

  const { eventId } = $props<{ eventId: string }>();

  let event = $state<any>(null);
  let isFetching = $state(false);
  let isSaving = $state(false);

  onMount(async () => {
    await loadEvent();
  });

  async function loadEvent() {
    isFetching = true;
    try {
      const guildId = authStore.selectedGuildId;
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/events/${eventId}`, {
        headers: { 'Authorization': `Bearer ${authStore.token}` }
      });
      const data = await res.json();
      event = data.event;
    } catch (err) {
      toast.error('Erreur chargement événement');
    } finally {
      isFetching = false;
    }
  }

  function addQuestion() {
    if (!event.questions) event.questions = [];
    event.questions = [...event.questions, {
      text: 'Nouvelle question',
      options: ['Option 1', 'Option 2'],
      correctOptionIndex: 0,
      imageUrl: ''
    }];
  }

  function removeQuestion(index: number) {
    event.questions = event.questions.filter((_: any, i: number) => i !== index);
  }

  function addOption(qIdx: number) {
    event.questions[qIdx].options = [...event.questions[qIdx].options, `Option ${event.questions[qIdx].options.length + 1}`];
  }

  function removeOption(qIdx: number, oIdx: number) {
    event.questions[qIdx].options = event.questions[qIdx].options.filter((_: any, i: number) => i !== oIdx);
  }

  async function save() {
    isSaving = true;
    try {
      const guildId = authStore.selectedGuildId;
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/events/${eventId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authStore.token}`
        },
        body: JSON.stringify(event)
      });
      if (res.ok) {
        toast.success('Événement enregistré');
        await loadEvent();
      } else {
        toast.error('Erreur lors de l\'enregistrement');
      }
    } catch (err) {
      toast.error('Erreur réseau');
    } finally {
      isSaving = false;
    }
  }

  async function publish() {
    await save();
    try {
      const guildId = authStore.selectedGuildId;
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/events/${eventId}/publish`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authStore.token}` }
      });
      if (res.ok) {
        toast.success('Événement publié sur Discord !');
        router.goto('/events');
      } else {
        const data = await res.json();
        toast.error(data.error || 'Erreur publication');
      }
    } catch (err) {
      toast.error('Erreur réseau');
    }
  }
  function handleCsvImport(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files?.length) return;

    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = (readerEvent) => {
      const text = readerEvent.target?.result as string;
      if (!text) return;

      const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
      if (lines.length < 2) return;

      // Detect separator (tab or semicolon or comma)
      const header = lines[0];
      const sep = header.includes('\t') ? '\t' : (header.includes(';') ? ';' : ',');
      const columns = header.split(sep).map(c => c.trim().toLowerCase());

      const questionCol = columns.findIndex(c => c.includes('question'));
      const responseCol = columns.findIndex(c => c.includes('réponse') || c.includes('reponse'));
      const optionCols = columns.map((c, i) => ({ name: c, index: i }))
        .filter(c => c.name.startsWith('option'));

      if (questionCol === -1 || responseCol === -1 || optionCols.length === 0) {
        alert("Format CSV invalide. Assurez-vous d'avoir au moins les colonnes 'Question', 'Option X' et 'Bonne Réponse'.");
        return;
      }

      const newQuestions = lines.slice(1).map(line => {
        const cells = line.split(sep).map(c => c.trim());
        const options = optionCols.map(oc => cells[oc.index]).filter(val => val !== undefined && val !== '');
        
        // Map correct answer (A, B, C... or index 1, 2, 3...)
        const rawAnswer = (cells[responseCol] || '').toUpperCase();
        let correctIndex = 0;
        if (/^[A-Z]$/.test(rawAnswer)) {
          correctIndex = rawAnswer.charCodeAt(0) - 65;
        } else {
          correctIndex = parseInt(rawAnswer) - 1;
        }

        return {
          text: cells[questionCol] || 'Nouvelle Question',
          imageUrl: '',
          options: options.length > 0 ? options : ['Option 1', 'Option 2'],
          correctOptionIndex: isNaN(correctIndex) ? 0 : Math.max(0, Math.min(correctIndex, options.length - 1))
        };
      });

      if (!event) return;
      if (!event.questions) event.questions = [];
      event.questions = [...event.questions, ...newQuestions];
      input.value = ''; // Reset for next import
    };

    reader.readAsText(file);
  }

  function triggerImport() {
    document.getElementById('csvInput')?.click();
  }
</script>

<ModulePage 
  title="Éditeur de Quiz" 
  description="Préparez vos questions et publiez l'événement sur Discord." 
  icon="Edit3"
  featureKey="events"
>
  {#snippet actions()}
    <div class="flex gap-3">
      <button 
        onclick={() => router.goto('/events')}
        class="px-5 py-2.5 bg-surface-container-high rounded-xl font-black text-[10px] uppercase tracking-widest border border-outline-variant/10 hover:bg-surface-container-highest transition-colors"
      >
        Retour
      </button>
      <button
        onclick={save}
        disabled={isSaving}
        class="px-5 py-2.5 bg-surface-container-highest text-on-surface rounded-xl font-black text-[10px] uppercase tracking-widest border border-outline-variant/10 hover:scale-105 transition-transform"
      >
        {isSaving ? 'Enregistrement...' : 'Enregistrer'}
      </button>
      <button
        onclick={publish}
        class="px-5 py-2.5 bg-primary text-on-primary rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-105 transition-transform"
      >
        Publier sur Discord
      </button>
    </div>
  {/snippet}

  {#if event}
    <div class="space-y-10 pb-20">
      <section class="bg-surface-container-low/30 rounded-[3rem] p-10 border border-outline-variant/10 space-y-8">
        <div class="flex items-center gap-4 mb-2">
          <div class="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Papicon icon="Settings" size={20} />
          </div>
          <h3 class="text-xl font-black text-on-surface">Configuration Générale</h3>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div class="space-y-2">
            <label for="event-title" class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 ml-4">Titre de l'événement</label>
            <FormInput 
              id="event-title"
              bind:value={event.title} 
              placeholder="Quiz Culture G" 
              className="w-full bg-surface-container-high/50 border border-outline-variant/10 rounded-2xl px-6 py-4 text-sm font-bold focus:outline-none focus:border-primary/30 transition-all text-on-surface"
            />
          </div>
          <div class="space-y-2">
            <label for="event-channel-id" class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 ml-4">ID du Salon Discord</label>
            <FormInput 
              id="event-channel-id"
              bind:value={event.channelId} 
              placeholder="1234567890..." 
              className="w-full bg-surface-container-high/50 border border-outline-variant/10 rounded-2xl px-6 py-4 text-sm font-bold focus:outline-none focus:border-primary/30 transition-all text-on-surface"
            />
          </div>
        </div>

        <div class="space-y-2">
          <label for="event-description" class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 ml-4">Description</label>
          <FormTextarea 
            id="event-description"
            bind:value={event.description} 
            placeholder="Participez à notre quiz hebdomadaire !" 
            className="w-full bg-surface-container-high/50 border border-outline-variant/10 rounded-2xl px-6 py-4 text-sm font-bold focus:outline-none focus:border-primary/30 transition-all text-on-surface resize-none"
            rows={4}
          />
        </div>
      </section>

      <section class="space-y-8">
        <div class="flex items-center justify-between px-2">
          <h3 class="text-xl font-black text-on-surface">Questions du Quiz ({event.questions?.length || 0})</h3>
          <div class="flex items-center gap-4">
            <input 
              type="file" 
              id="csvInput" 
              accept=".csv,.txt" 
              class="hidden" 
              onchange={handleCsvImport}
            />
            <button 
              onclick={triggerImport} 
              class="px-4 py-2 bg-surface-container-high text-on-surface-variant rounded-xl font-bold text-[10px] uppercase tracking-widest border border-outline-variant/10 hover:bg-surface-container-highest transition-colors flex items-center gap-2"
            >
              <Papicon icon="FileUp" size={14} /> Importer CSV
            </button>
            <button onclick={addQuestion} class="text-primary font-black uppercase text-[10px] tracking-widest flex items-center gap-2">
              <Papicon icon="Plus" size={14} /> Ajouter une question
            </button>
          </div>
        </div>

        <div class="space-y-8">
          {#each event.questions || [] as question, qIdx}
            <div class="bg-surface-container-low/30 rounded-[3rem] border border-outline-variant/10 p-10 space-y-8 relative overflow-hidden group">
              <div class="absolute top-0 left-0 w-2 h-full bg-primary/20"></div>
              
              <div class="flex flex-col md:flex-row gap-8">
                <div class="flex-1 space-y-6">
                  <div class="flex items-center justify-between">
                    <span class="text-[10px] font-black uppercase tracking-widest text-primary">Question #{qIdx + 1}</span>
                    <button onclick={() => removeQuestion(qIdx)} class="text-rose-500 hover:text-rose-600 transition-colors">
                      <Papicon icon="Trash2" size={16} />
                    </button>
                  </div>
                  
                  <div class="space-y-2">
                    <label for={`question-${qIdx}-text`} class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 ml-4">Énoncé de la question</label>
                    <FormInput 
                      id={`question-${qIdx}-text`}
                      bind:value={question.text} 
                      placeholder="Quelle est la capitale de la France ?" 
                      className="w-full bg-surface-container-high/50 border border-outline-variant/10 rounded-2xl px-6 py-4 text-sm font-bold focus:outline-none focus:border-primary/30 transition-all text-on-surface"
                    />
                  </div>
                  <div class="space-y-2">
                    <label for={`question-${qIdx}-image-url`} class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 ml-4">URL de l'image (optionnel)</label>
                    <FormInput 
                      id={`question-${qIdx}-image-url`}
                      bind:value={question.imageUrl} 
                      placeholder="https://..." 
                      className="w-full bg-surface-container-high/50 border border-outline-variant/10 rounded-2xl px-6 py-4 text-sm font-bold focus:outline-none focus:border-primary/30 transition-all text-on-surface"
                    />
                  </div>
                </div>

                <div class="flex-1 space-y-6">
                  <div class="flex items-center justify-between">
                    <span class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Options de réponse</span>
                    <button onclick={() => addOption(qIdx)} class="text-[10px] font-black uppercase tracking-widest text-primary hover:underline">
                      + Ajouter option
                    </button>
                  </div>

                  <div class="space-y-3">
                    {#each question.options as option, oIdx}
                      <div class="flex items-center gap-3">
                        <button 
                          onclick={() => question.correctOptionIndex = oIdx}
                          class="w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all {question.correctOptionIndex === oIdx ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-outline-variant/20 text-transparent'}"
                        >
                          <Papicon icon="Check" size={12} />
                        </button>
                        <input 
                          type="text" 
                          bind:value={question.options[oIdx]} 
                          class="flex-1 bg-surface-container-high/50 border border-outline-variant/10 rounded-xl px-4 py-2.5 text-sm font-bold text-on-surface focus:outline-none focus:border-primary/50 transition-colors"
                        />
                        <button onclick={() => removeOption(qIdx, oIdx)} class="text-on-surface-variant/20 hover:text-rose-500 transition-colors">
                          <Papicon icon="X" size={14} />
                        </button>
                      </div>
                    {/each}
                  </div>
                  <p class="text-[9px] font-bold text-on-surface-variant/30 italic">Cochez le cercle à gauche de la bonne réponse.</p>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </section>
    </div>
  {:else}
    <div class="flex items-center justify-center py-40">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
    </div>
  {/if}
</ModulePage>
