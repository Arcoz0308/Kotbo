<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import { 
    fetchTutoringConfig, 
    fetchTutoringItems, 
    fetchTutorDashboard, 
    fetchApprenticeProgress,
    updateTutoringConfig,
    updateTutoringChecklist,
    addTutoringLog,
    deleteTutoringItem,
    upsertTutoringItem,
    deleteTestingPeriod,
    addMentorReport,
    endTestingPeriod
  } from '../lib/api';
  
  let activeTab = $state('dashboard'); // dashboard, progress, config
  let config = $state<any>(null);
  let tutoringItems = $state<any[]>([]);
  let tutorApprentices = $state<any[]>([]);
  let apprenticeProgress = $state<any>(null);
  let loading = $state(true);

  // Modal states
  let reportModalOpen = $state(false);
  let selectedApprentice = $state<any>(null);
  let reportType = $state('POSITIVE');
  let reportContent = $state('');

  let endTutoringModalOpen = $state(false);
  let endTutoringStatus = $state<'PASSED' | 'FAILED'>('PASSED');
  let endTutoringNotes = $state('');
  let endTutoringForce = $state(false);
  let endTutoringError = $state<string | null>(null);
  let canForce = $state(false);

  async function fetchData() {
    loading = true;
    try {
      const [configData, itemsData, tutorData, apprenticeData] = await Promise.all([
        fetchTutoringConfig().catch(() => ({ config: null })),
        fetchTutoringItems().catch(() => ({ items: [] })),
        fetchTutorDashboard().catch(() => ({ apprentices: [] })),
        fetchApprenticeProgress().catch(() => ({ progress: null }))
      ]);

      config = configData?.config;
      tutoringItems = itemsData?.items || [];
      tutorApprentices = tutorData?.apprentices || [];
      apprenticeProgress = apprenticeData?.progress;

      // Default tab based on role
      if (tutorApprentices.length > 0) activeTab = 'dashboard';
      else if (apprenticeProgress) activeTab = 'progress';
      else if (authStore.isAdmin) activeTab = 'config';

    } catch (err) {
      console.error('Error fetching tutoring data:', err);
    } finally {
      loading = false;
    }
  }

  onMount(fetchData);

  async function saveConfig() {
    try {
      await updateTutoringConfig(config);
    } catch (err) {
      console.error('Error saving config:', err);
    }
  }

  async function toggleChecklist(periodId: string, itemId: string, completed: boolean) {
    try {
      await updateTutoringChecklist(periodId, itemId, completed);
      fetchData();
    } catch (err) {
      console.error('Error updating checklist:', err);
    }
  }

  async function addLog(periodId: string, content: string) {
    if (!content.trim()) return;
    try {
      await addTutoringLog(periodId, content);
      fetchData();
    } catch (err) {
      console.error('Error adding log:', err);
    }
  }

  function getProgressPercentage(progress: any[]) {
    if (!tutoringItems.length) return 0;
    const completed = progress.filter(p => p.completed).length;
    return Math.round((completed / tutoringItems.length) * 100);
  }

  async function handleDeleteTutoring(periodId: string) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce tutorat ? Cette action est irréversible.')) return;
    try {
      await deleteTestingPeriod(periodId);
      fetchData();
    } catch (err) {
      console.error('Error deleting tutoring:', err);
    }
  }

  async function submitReport() {
    if (!reportContent.trim() || !selectedApprentice) return;
    try {
      await addMentorReport(selectedApprentice.id, reportType, reportContent);
      reportModalOpen = false;
      reportContent = '';
      fetchData();
    } catch (err) {
      console.error('Error submitting report:', err);
    }
  }

  async function submitEndTutoring() {
    if (!selectedApprentice) return;
    endTutoringError = null;
    try {
      await endTestingPeriod(selectedApprentice.id, endTutoringStatus, endTutoringNotes, endTutoringForce);
      endTutoringModalOpen = false;
      endTutoringNotes = '';
      endTutoringForce = false;
      fetchData();
    } catch (err: any) {
      if (err.status === 403 && err.message.includes('trop courte')) {
        endTutoringError = err.message;
        canForce = true;
      } else {
        console.error('Error ending tutoring:', err);
        endTutoringError = "Une erreur est survenue lors de la validation.";
      }
    }
  }

  function getDaysInTest(startDate: string) {
    const start = new Date(startDate);
    const diff = Date.now() - start.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  // Visual helper for categories
  const categories = [
    { id: 'TOOLS', label: 'Outils', icon: 'tool', color: 'primary' },
    { id: 'KNOWLEDGE', label: 'Savoir', icon: 'book', color: 'secondary' },
    { id: 'ACCESS', label: 'Accès', icon: 'key', color: 'tertiary' }
  ];

</script>

<div class="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
  <!-- Header Section -->
  <header class="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-surface-container-low/40 backdrop-blur-3xl p-8 rounded-[2rem] border border-outline-variant/30 relative overflow-hidden group">
    <div class="absolute -top-24 -right-24 w-64 h-64 bg-primary/10 rounded-full blur-[80px] group-hover:bg-primary/20 transition-all duration-700"></div>
    <div class="absolute -bottom-24 -left-24 w-64 h-64 bg-secondary/10 rounded-full blur-[80px] group-hover:bg-secondary/20 transition-all duration-700"></div>

    <div class="flex items-center gap-6 relative">
      <div class="w-16 h-16 bg-gradient-to-br from-primary to-primary-container rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20">
        <Papicon icon="book-open" size={32} class="text-white" />
      </div>
      <div>
        <h1 class="text-3xl font-black tracking-tight text-on-surface font-headline leading-tight">Système de Tutorat</h1>
        <p class="text-on-surface-variant/80 font-medium tracking-wide">Accompagnement, transmission et suivi des nouveaux arrivants.</p>
      </div>
    </div>

    <div class="flex items-center gap-2 p-1 bg-surface-container-high/50 rounded-2xl border border-outline-variant/20 relative backdrop-blur-xl">
      <button 
        onclick={() => activeTab = 'dashboard'}
        class="flex items-center gap-2 px-5 py-2.5 rounded-xl transition-all duration-300 {activeTab === 'dashboard' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-on-surface-variant hover:bg-surface-hover hover:text-on-surface'}"
      >
        <Papicon icon="grid" size={18} />
        <span class="text-sm font-bold">Dashboard Tuteur</span>
      </button>
      <button 
        onclick={() => activeTab = 'progress'}
        class="flex items-center gap-2 px-5 py-2.5 rounded-xl transition-all duration-300 {activeTab === 'progress' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-on-surface-variant hover:bg-surface-hover hover:text-on-surface'}"
      >
        <Papicon icon="trending-up" size={18} />
        <span class="text-sm font-bold">Ma Progression</span>
      </button>
      {#if authStore.isAdmin}
        <button 
          onclick={() => activeTab = 'config'}
          class="flex items-center gap-2 px-5 py-2.5 rounded-xl transition-all duration-300 {activeTab === 'config' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-on-surface-variant hover:bg-surface-hover hover:text-on-surface'}"
        >
          <Papicon icon="settings" size={18} />
          <span class="text-sm font-bold">Configuration</span>
        </button>
      {/if}
    </div>
  </header>

  {#if loading}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each Array(3) as _}
        <div class="h-64 bg-surface-container rounded-[2rem] animate-pulse"></div>
      {/each}
    </div>
  {:else}
    <!-- Content based on tab -->
    {#if activeTab === 'dashboard'}
      <div class="grid grid-cols-1 gap-8">
        {#if tutorApprentices.length === 0}
          <div class="flex flex-col items-center justify-center py-20 bg-surface-container-low/40 rounded-[2rem] border border-dashed border-outline-variant/50">
            <Papicon icon="user-plus" size={48} class="text-on-surface-variant/30 mb-4" />
            <p class="text-on-surface-variant font-medium">Vous n'avez pas d'apprentis sous votre tutorat actuellement.</p>
          </div>
        {:else}
          {#each tutorApprentices as apprentice}
            <div class="bg-surface-container-low/60 rounded-[2rem] border border-outline-variant/30 overflow-hidden">
              <div class="p-8 flex flex-col md:flex-row gap-8">
                <!-- Apprentice Sidebar -->
                <div class="w-full md:w-64 flex flex-col gap-4">
                  <div class="flex flex-col items-center gap-4 p-6 bg-surface-container rounded-3xl">
                    <div class="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center border-2 border-primary/20 overflow-hidden">
                      <Papicon icon="user" size={40} class="text-primary" />
                    </div>
                    <div class="text-center">
                      <h3 class="font-black text-on-surface">{apprentice.staffMember.username}</h3>
                      {#if apprentice.mentor && apprentice.mentor.userId !== authStore.user?.id}
                        <p class="text-[10px] font-bold text-primary uppercase tracking-wider">Tuteur: {apprentice.mentor.username}</p>
                      {/if}
                      <p class="text-xs text-on-surface-variant">Apprenti depuis {new Date(apprentice.startDate).toLocaleDateString()}</p>
                    </div>
                  </div>
                  
                  <div class="flex flex-col gap-2">
                    <div class="flex justify-between text-xs font-bold uppercase tracking-wider text-on-surface-variant/70 px-2">
                      <span>Progression</span>
                      <span>{getProgressPercentage(apprentice.checklistProgress)}%</span>
                    </div>
                    <div class="h-3 bg-surface-container-high rounded-full overflow-hidden border border-outline-variant/20 p-0.5">
                      <div 
                        class="h-full bg-gradient-to-r from-primary to-primary-container rounded-full transition-all duration-1000" 
                        style="width: {getProgressPercentage(apprentice.checklistProgress)}%"
                      ></div>
                    </div>
                  </div>

                  <div class="mt-4 p-4 bg-primary/5 rounded-2xl border border-primary/10">
                    <div class="flex items-center gap-2 mb-2">
                      <Papicon icon="alert-circle" size={16} class="text-primary" />
                      <span class="text-xs font-bold text-primary">Prochain Rapport</span>
                    </div>
                    <p class="text-sm font-medium text-on-surface-variant mb-4">
                      {apprentice.lastReportAt ? 'Dans 12 jours' : 'À faire dès que possible'}
                    </p>
                    <button 
                      onclick={() => { selectedApprentice = apprentice; reportModalOpen = true; }}
                      class="w-full py-2 bg-primary/10 text-primary rounded-xl text-xs font-bold hover:bg-primary/20 transition-all flex items-center justify-center gap-2"
                    >
                      <Papicon icon="plus" size={14} />
                      Faire un Rapport
                    </button>
                  </div>

                  <div class="mt-auto flex flex-col gap-2">
                    <div class="flex gap-2">
                      <button 
                        onclick={() => { selectedApprentice = apprentice; endTutoringStatus = 'PASSED'; endTutoringModalOpen = true; endTutoringError = null; canForce = false; }}
                        class="flex-1 py-3 bg-success/10 text-success rounded-xl text-xs font-black hover:bg-success/20 transition-all"
                      >
                        Valider
                      </button>
                      <button 
                         onclick={() => { selectedApprentice = apprentice; endTutoringStatus = 'FAILED'; endTutoringModalOpen = true; endTutoringError = null; canForce = false; }}
                        class="flex-1 py-3 bg-error/10 text-error rounded-xl text-xs font-black hover:bg-error/20 transition-all"
                      >
                        Échec
                      </button>
                    </div>
                    {#if authStore.isAdmin}
                      <button 
                        onclick={() => handleDeleteTutoring(apprentice.id)}
                        class="w-full py-2 text-on-surface-variant/50 hover:text-error text-[10px] font-bold uppercase tracking-widest transition-all"
                      >
                        Supprimer le tutorat
                      </button>
                    {/if}
                  </div>
                </div>

                <!-- Main Content -->
                <div class="flex-1 flex flex-col gap-6">
                  <div class="flex items-center justify-between border-b border-outline-variant/30 pb-4">
                    <h2 class="text-xl font-black text-on-surface">Checklist de Transmission</h2>
                    <div class="flex gap-2">
                      {#each categories as cat}
                        <div class="flex items-center gap-1.5 px-3 py-1 rounded-full bg-{cat.color}/10 text-{cat.color} text-[10px] font-bold uppercase">
                          <Papicon icon={cat.icon} size={12} />
                          {cat.label}
                        </div>
                      {/each}
                    </div>
                  </div>

                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {#each tutoringItems as item}
                      {@const progress = apprentice.checklistProgress.find(p => p.itemId === item.id)}
                      <div class="flex items-start gap-4 p-4 bg-surface-container/30 rounded-2xl border border-outline-variant/20 hover:border-primary/30 transition-all group">
                        <button 
                          onclick={() => toggleChecklist(apprentice.id, item.id, !progress?.completed)}
                          class="mt-1 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all {progress?.completed ? 'bg-primary border-primary text-white' : 'border-outline group-hover:border-primary'}"
                          aria-label={progress?.completed ? "Marquer comme non acquis" : "Marquer comme acquis"}
                        >
                          {#if progress?.completed}
                            <Papicon icon="check" size={14} />
                          {/if}
                        </button>
                        <div class="flex-1">
                          <div class="flex items-center gap-2 mb-0.5">
                            <span class="font-bold text-sm text-on-surface">{item.title}</span>
                            <Papicon 
                              icon={categories.find(c => c.id === item.category)?.icon || 'info'} 
                              size={12} 
                              class="text-on-surface-variant/40" 
                            />
                          </div>
                          <p class="text-xs text-on-surface-variant leading-relaxed">{item.description}</p>
                          {#if progress?.completedAt}
                            <span class="text-[9px] font-medium text-primary/60 mt-1 block">Coché le {new Date(progress.completedAt).toLocaleDateString()}</span>
                          {/if}
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    {:else if activeTab === 'progress'}
      {#if !apprenticeProgress}
        <div class="flex flex-col items-center justify-center py-20 bg-surface-container-low/40 rounded-[2rem] border border-dashed border-outline-variant/50">
          <Papicon icon="award" size={48} class="text-on-surface-variant/30 mb-4" />
          <p class="text-on-surface-variant font-medium">Vous n'êtes pas en période de tutorat actuellement.</p>
        </div>
      {:else}
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <!-- Progress Stats -->
          <div class="lg:col-span-2 flex flex-col gap-8">
            <div class="bg-surface-container-low/60 p-8 rounded-[2rem] border border-outline-variant/30 relative overflow-hidden">
               <div class="absolute top-0 right-0 p-8">
                <div class="w-32 h-32 rounded-full border-[10px] border-surface-container-high relative flex items-center justify-center">
                  <svg class="w-full h-full -rotate-90">
                    <circle 
                      cx="64" cy="64" r="54" fill="none" 
                      stroke="currentColor" stroke-width="10" 
                      class="text-primary transition-all duration-1000" 
                      stroke-dasharray="339.29" 
                      stroke-dashoffset={339.29 * (1 - getProgressPercentage(apprenticeProgress.checklistProgress) / 100)}
                    />
                  </svg>
                  <div class="absolute inset-0 flex flex-col items-center justify-center">
                    <span class="text-2xl font-black text-on-surface">{getProgressPercentage(apprenticeProgress.checklistProgress)}%</span>
                  </div>
                </div>
              </div>

              <h2 class="text-2xl font-black text-on-surface mb-2">Ma Progression</h2>
              <p class="text-on-surface-variant mb-8 max-w-md">Continuez à valider vos acquis avec votre tuteur {apprenticeProgress.mentor?.username || 'attitré'}.</p>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                {#each categories as cat}
                  {@const items = tutoringItems.filter(i => i.category === cat.id)}
                  {@const completed = apprenticeProgress.checklistProgress.filter(p => p.completed && items.find(i => i.id === p.itemId)).length}
                  <div class="p-6 bg-surface-container/50 rounded-3xl border border-outline-variant/20">
                    <div class="flex items-center gap-3 mb-4">
                      <div class="w-10 h-10 rounded-xl bg-{cat.color}/10 flex items-center justify-center">
                        <Papicon icon={cat.icon} size={20} class="text-{cat.color}" />
                      </div>
                      <div>
                        <div class="text-xs font-black uppercase text-on-surface-variant/60">{cat.label}</div>
                        <div class="text-lg font-black text-on-surface">{completed} / {items.length}</div>
                      </div>
                    </div>
                    <div class="h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                      <div 
                        class="h-full bg-{cat.color} transition-all duration-700" 
                        style="width: {items.length ? (completed / items.length) * 100 : 0}%"
                      ></div>
                    </div>
                  </div>
                {/each}
              </div>
            </div>

            <!-- Logbook -->
            <div class="bg-surface-container-low/60 p-8 rounded-[2rem] border border-outline-variant/30">
              <h2 class="text-2xl font-black text-on-surface mb-6">Carnet de Bord</h2>
              
              <div class="flex flex-col gap-6">
                <div class="flex gap-4">
                  <input 
                    type="text" 
                    placeholder="Qu'avez-vous appris aujourd'hui ?" 
                    class="flex-1 bg-surface-container px-6 py-4 rounded-2xl border border-outline-variant/30 focus:outline-none focus:border-primary transition-all text-on-surface"
                    onkeydown={(e) => { if(e.key === 'Enter') { addLog(apprenticeProgress.id, e.currentTarget.value); e.currentTarget.value = ''; } }}
                  />
                  <button 
                    class="bg-primary text-white px-8 rounded-2xl font-black shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
                    onclick={() => { 
                      const input = document.querySelector('input') as HTMLInputElement;
                      addLog(apprenticeProgress.id, input.value);
                      input.value = '';
                    }}
                  >
                    Ajouter
                  </button>
                </div>

                <div class="flex flex-col gap-4">
                  {#each apprenticeProgress.logs as log}
                    <div class="p-6 bg-surface-container/30 rounded-3xl border border-outline-variant/20 flex gap-4 animate-in slide-in-from-left-2 duration-300">
                      <div class="w-1.5 bg-primary/20 rounded-full"></div>
                      <div class="flex-1">
                        <div class="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">{new Date(log.date).toLocaleDateString()}</div>
                        <p class="text-on-surface font-medium">{log.content}</p>
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            </div>
          </div>

          <!-- Mentor Sidebar -->
          <div class="flex flex-col gap-6">
            <div class="bg-surface-container-low/60 p-8 rounded-[2rem] border border-outline-variant/30 text-center">
              <div class="w-24 h-24 mx-auto bg-gradient-to-br from-primary to-primary-container rounded-[2rem] flex items-center justify-center shadow-xl shadow-primary/20 mb-6">
                <Papicon icon="user-check" size={40} class="text-white" />
              </div>
              <h3 class="text-xl font-black text-on-surface mb-1">Mon Tuteur</h3>
              <p class="text-on-surface-variant font-medium mb-6">{apprenticeProgress.mentor?.username || 'En attente...'}</p>
              
              <div class="flex flex-col gap-3">
                <button class="w-full py-4 rounded-2xl border-2 border-primary/20 text-primary font-black hover:bg-primary/5 transition-all">
                  Contacter sur Discord
                </button>
              </div>
            </div>

            <div class="bg-surface-container-low/60 p-8 rounded-[2rem] border border-outline-variant/30">
              <h3 class="font-black text-on-surface mb-4">Dernier Retour</h3>
              {#if apprenticeProgress.reports.length > 0}
                {@const lastReport = apprenticeProgress.reports[0]}
                <div class="flex items-center gap-2 mb-3">
                  <div class="px-2 py-0.5 rounded-md text-[10px] font-black uppercase {lastReport.type === 'POSITIVE' ? 'bg-success/10 text-success' : lastReport.type === 'NEGATIVE' ? 'bg-error/10 text-error' : 'bg-warning/10 text-warning'}">
                    {lastReport.type}
                  </div>
                  <span class="text-[10px] font-bold text-on-surface-variant">{new Date(lastReport.createdAt).toLocaleDateString()}</span>
                </div>
                <p class="text-sm text-on-surface-variant italic leading-relaxed">"{lastReport.content}"</p>
              {:else}
                <p class="text-sm text-on-surface-variant italic">Aucun rapport encore publié.</p>
              {/if}
            </div>
          </div>
        </div>
      {/if}
    {:else if activeTab === 'config'}
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <!-- Parameters -->
        <div class="lg:col-span-1 bg-surface-container-low/60 p-8 rounded-[2rem] border border-outline-variant/30 flex flex-col gap-6">
          <h2 class="text-2xl font-black text-on-surface mb-4">Paramètres</h2>
          
          {#if !config}
            <div class="p-6 bg-surface-container rounded-3xl border border-dashed border-outline-variant/50 flex flex-col items-center justify-center text-center">
              <Papicon icon="alert-circle" size={32} class="text-on-surface-variant/30 mb-2" />
              <p class="text-xs text-on-surface-variant font-medium">Impossible de charger la configuration.</p>
            </div>
          {:else}
            <div class="flex flex-col gap-2">
              <label for="reportIntervalDays" class="text-xs font-black uppercase text-on-surface-variant tracking-widest pl-2">Intervalle des Rapports (jours)</label>
              <input 
                id="reportIntervalDays"
                type="number" 
                bind:value={config.reportIntervalDays}
                class="bg-surface-container px-6 py-4 rounded-2xl border border-outline-variant/30 focus:border-primary outline-none transition-all"
              />
            </div>

          <div class="flex flex-col gap-2">
            <label for="reminderDaysBefore" class="text-xs font-black uppercase text-on-surface-variant tracking-widest pl-2">Rappels avant échéance (jours)</label>
            <input 
              id="reminderDaysBefore"
              type="number" 
              bind:value={config.reminderDaysBefore}
              class="bg-surface-container px-6 py-4 rounded-2xl border border-outline-variant/30 focus:border-primary outline-none transition-all"
            />
          </div>

          <div class="flex flex-col gap-2">
            <label for="minTestDays" class="text-xs font-black uppercase text-on-surface-variant tracking-widest pl-2">Temps minimum en test (jours)</label>
            <input 
              id="minTestDays"
              type="number" 
              bind:value={config.minTestDays}
              class="bg-surface-container px-6 py-4 rounded-2xl border border-outline-variant/30 focus:border-primary outline-none transition-all"
            />
          </div>

          <div class="flex items-center justify-between p-4 bg-surface-container/50 rounded-2xl border border-outline-variant/20 mt-4">
            <div class="flex flex-col">
              <span class="font-bold text-on-surface">Notifications DM</span>
              <span class="text-[10px] text-on-surface-variant">Rappels automatiques aux tuteurs</span>
            </div>
            <button 
              onclick={() => config.remindersEnabled = !config.remindersEnabled}
              class="w-12 h-6 rounded-full transition-all relative {config.remindersEnabled ? 'bg-primary' : 'bg-outline-variant'}"
              aria-label="Toggle DM notifications"
            >
              <div class="absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-all {config.remindersEnabled ? 'translate-x-6' : ''}"></div>
            </button>
          </div>

          <button 
            class="w-full py-4 mt-4 bg-primary text-white rounded-2xl font-black shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
            onclick={saveConfig}
          >
            Sauvegarder
          </button>
          {/if}
        </div>

        <!-- Checklist Items Management -->
        <div class="lg:col-span-2 bg-surface-container-low/60 p-8 rounded-[2rem] border border-outline-variant/30">
          <div class="flex items-center justify-between mb-8">
            <h2 class="text-2xl font-black text-on-surface">Checklist de Formation</h2>
            <button class="bg-primary/10 text-primary px-6 py-2.5 rounded-xl font-bold hover:bg-primary/20 transition-all flex items-center gap-2">
              <Papicon icon="plus" size={18} />
              Nouvel Item
            </button>
          </div>

          <div class="flex flex-col gap-4">
            {#each tutoringItems as item}
              <div class="p-6 bg-surface-container/30 rounded-3xl border border-outline-variant/20 flex items-center justify-between group">
                <div class="flex items-center gap-4">
                  <div class="w-12 h-12 rounded-2xl bg-surface-container-high flex items-center justify-center text-on-surface-variant group-hover:scale-110 transition-all">
                    <Papicon icon={categories.find(c => c.id === item.category)?.icon || 'help-circle'} size={24} />
                  </div>
                  <div>
                    <div class="flex items-center gap-2">
                      <span class="font-black text-on-surface">{item.title}</span>
                      <span class="text-[10px] font-black uppercase px-2 py-0.5 bg-primary/5 text-primary rounded-md">{item.category}</span>
                    </div>
                    <p class="text-sm text-on-surface-variant line-clamp-1">{item.description}</p>
                  </div>
                </div>
                <div class="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                  <button 
                    class="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-on-surface-variant hover:text-primary transition-all"
                    aria-label="Modifier l'item"
                  >
                    <Papicon icon="edit-2" size={18} />
                  </button>
                  <button 
                    class="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-on-surface-variant hover:text-error transition-all"
                    aria-label="Supprimer l'item"
                  >
                    <Papicon icon="trash-2" size={18} />
                  </button>
                </div>
              </div>
            {/each}
          </div>
        </div>
      </div>
    {/if}
  {/if}
</div>

{#if reportModalOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-container-lowest/80 backdrop-blur-md animate-in fade-in duration-300">
    <div class="w-full max-w-lg bg-surface-container-low rounded-[2rem] border border-outline-variant/30 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
      <div class="p-8">
        <h2 class="text-2xl font-black text-on-surface mb-2">Nouveau Rapport</h2>
        <p class="text-on-surface-variant mb-6 font-medium">Postez un rapport sur l'évolution de **{selectedApprentice?.staffMember?.username}**.</p>
        
        <div class="flex flex-col gap-6">
          <div class="flex gap-2 p-1 bg-surface-container rounded-2xl border border-outline-variant/20">
            {#each ['POSITIVE', 'NEUTRAL', 'NEGATIVE'] as type}
              <button 
                onclick={() => reportType = type}
                class="flex-1 py-2.5 rounded-xl text-xs font-black transition-all {reportType === type ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-on-surface-variant hover:bg-surface-hover'}"
              >
                {type}
              </button>
            {/each}
          </div>

          <textarea 
            placeholder="Détails du rapport..." 
            bind:value={reportContent}
            rows="6"
            class="w-full bg-surface-container px-6 py-4 rounded-2xl border border-outline-variant/30 focus:border-primary outline-none transition-all text-on-surface resize-none"
          ></textarea>

          <div class="flex gap-4">
            <button 
              onclick={() => reportModalOpen = false}
              class="flex-1 py-4 rounded-2xl border-2 border-outline-variant/30 text-on-surface-variant font-black hover:bg-surface-hover transition-all"
            >
              Annuler
            </button>
            <button 
              onclick={submitReport}
              class="flex-1 py-4 bg-primary text-white rounded-2xl font-black shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
            >
              Publier
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

{#if endTutoringModalOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-container-lowest/80 backdrop-blur-md animate-in fade-in duration-300">
    <div class="w-full max-w-lg bg-surface-container-low rounded-[2rem] border border-outline-variant/30 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
      <div class="p-8">
        <h2 class="text-2xl font-black text-on-surface mb-2">
          {endTutoringStatus === 'PASSED' ? 'Valider le Tutorat' : 'Échec du Tutorat'}
        </h2>
        <p class="text-on-surface-variant mb-6 font-medium text-sm">
          {endTutoringStatus === 'PASSED' 
            ? `Vous êtes sur le point de valider officiellement le tutorat de ${selectedApprentice?.staffMember?.username}.`
            : `Vous allez marquer le tutorat de ${selectedApprentice?.staffMember?.username} comme ayant échoué.`}
        </p>
        
        <div class="flex flex-col gap-6">
          <div class="p-4 bg-surface-container/50 rounded-2xl border border-outline-variant/20 flex items-center justify-between">
            <div class="flex flex-col">
              <span class="text-xs font-black uppercase text-on-surface-variant tracking-widest">Durée actuelle</span>
              <span class="font-bold text-on-surface">{getDaysInTest(selectedApprentice?.startDate)} jours</span>
            </div>
            <div class="flex flex-col items-end">
              <span class="text-xs font-black uppercase text-on-surface-variant tracking-widest">Requis</span>
              <span class="font-bold text-on-surface">{config?.minTestDays ?? 14} jours</span>
            </div>
          </div>

          {#if endTutoringError}
            <div class="p-4 bg-error/10 border border-error/20 rounded-2xl flex gap-3 animate-in shake duration-500">
              <Papicon icon="alert-triangle" size={20} class="text-error mt-0.5" />
              <div class="flex-1">
                <p class="text-sm font-bold text-error leading-tight">{endTutoringError}</p>
                {#if canForce && authStore.isAdmin}
                  <button 
                    onclick={() => { endTutoringForce = true; endTutoringError = null; }}
                    class="mt-2 text-xs font-black uppercase text-error underline underline-offset-4 hover:text-error/80 transition-all"
                  >
                    Cliquer ici pour forcer la validation
                  </button>
                {/if}
              </div>
            </div>
          {/if}

          <div class="flex flex-col gap-2">
            <label for="notes" class="text-xs font-black uppercase text-on-surface-variant tracking-widest pl-2">Notes finales (facultatif)</label>
            <textarea 
              id="notes"
              placeholder="Commentaires sur la période..." 
              bind:value={endTutoringNotes}
              rows="4"
              class="w-full bg-surface-container px-6 py-4 rounded-2xl border border-outline-variant/30 focus:border-primary outline-none transition-all text-on-surface resize-none"
            ></textarea>
          </div>

          {#if endTutoringForce}
            <div class="p-4 bg-warning/10 border border-warning/20 rounded-2xl flex items-center justify-between">
              <div class="flex flex-col">
                <span class="font-bold text-warning">Validation Forcée</span>
                <span class="text-[10px] text-on-surface-variant">Bypass du temps minimum</span>
              </div>
              <Papicon icon="shield-alert" size={24} class="text-warning" />
            </div>
          {/if}

          <div class="flex gap-4">
            <button 
              onclick={() => endTutoringModalOpen = false}
              class="flex-1 py-4 rounded-2xl border-2 border-outline-variant/30 text-on-surface-variant font-black hover:bg-surface-hover transition-all"
            >
              Annuler
            </button>
            <button 
              onclick={submitEndTutoring}
              class="flex-1 py-4 {endTutoringStatus === 'PASSED' ? 'bg-success' : 'bg-error'} text-white rounded-2xl font-black shadow-xl transition-all hover:scale-105 active:scale-95"
            >
              Confirmer
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  /* Custom colors if not in tailwind config */
  :global(.bg-primary) { background-color: rgb(var(--color-primary, 67 97 238)); }
  :global(.text-primary) { color: rgb(var(--color-primary, 67 97 238)); }
  :global(.border-primary) { border-color: rgb(var(--color-primary, 67 97 238)); }
  :global(.bg-secondary) { background-color: rgb(var(--color-secondary, 76 201 240)); }
  :global(.text-secondary) { color: rgb(var(--color-secondary, 76 201 240)); }
  :global(.bg-tertiary) { background-color: rgb(var(--color-tertiary, 114 9 183)); }
  :global(.text-tertiary) { color: rgb(var(--color-tertiary, 114 9 183)); }
</style>
