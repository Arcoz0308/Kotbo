<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
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
    endTestingPeriod,
    fetchFeatureConfigurations,
    updateFeatureConfiguration,
    createTestingPeriod,
    fetchStaffMembers,
    fetchStaffRoles
  } from '../lib/api';
  import { createAsyncActionState } from '../lib/asyncAction.svelte';
  import RolePermissionSettings from '../lib/components/RolePermissionSettings.svelte';

  let createTutoringModalOpen = $state(false);
  let createTutoringForm = $state({
    staffUserId: '',
    mentorId: '',
    plannedDurationDays: 14,
    targetGrade: ''
  });
  let allStaffMembers = $state<any[]>([]);
  let allStaffRoles = $state<any[]>([]);
  let loadingStaffInfo = $state(false);

  async function openCreateTutoringModal() {
    createTutoringModalOpen = true;
    loadingStaffInfo = true;
    try {
      const [membersData, rolesData] = await Promise.all([
        fetchStaffMembers().catch(() => ({ members: [] })),
        fetchStaffRoles().catch(() => ({ roles: [] }))
      ]);
      allStaffMembers = membersData?.members || [];
      allStaffRoles = rolesData?.roles || [];
      
      // Select default values
      const potentialApprentices = allStaffMembers.filter(m => !tutorApprentices.some(a => a.staffMember?.userId === m.userId));
      if (potentialApprentices.length > 0) {
        createTutoringForm.staffUserId = potentialApprentices[0].userId;
      } else if (allStaffMembers.length > 0) {
        createTutoringForm.staffUserId = allStaffMembers[0].userId;
      }
      
      const tutors = allStaffMembers.filter(m => m.isTutor);
      if (tutors.length > 0) {
        createTutoringForm.mentorId = tutors[0].userId;
      } else {
        createTutoringForm.mentorId = '';
      }
      
      if (allStaffRoles.length > 0) {
        createTutoringForm.targetGrade = allStaffRoles[0].name;
      } else {
        createTutoringForm.targetGrade = '';
      }
      
      if (config) {
        createTutoringForm.plannedDurationDays = config.minTestDays || 14;
      }
    } catch (err) {
      console.error('Error fetching staff info for tutoring creation:', err);
    } finally {
      loadingStaffInfo = false;
    }
  }

  async function submitCreateTutoring() {
    if (!createTutoringForm.staffUserId) {
      alert('Veuillez sélectionner un apprenti.');
      return;
    }
    try {
      const ok = await createTestingPeriod({
        staffUserId: createTutoringForm.staffUserId,
        mentorId: createTutoringForm.mentorId || undefined,
        plannedDurationDays: Number(createTutoringForm.plannedDurationDays),
        targetGrade: createTutoringForm.targetGrade || undefined
      });
      if (!ok) throw new Error('Erreur de l\'API');
      createTutoringModalOpen = false;
      fetchData();
    } catch (err: any) {
      console.error('Error creating tutoring relation:', err);
      alert(err.message || 'Erreur lors de la création du tutorat.');
    }
  }
  
  let activeTab = $state('dashboard'); // dashboard, progress, config
  let config = $state<any>(null);
  let tutoringItems = $state<any[]>([]);
  let tutorApprentices = $state<any[]>([]);
  let apprenticeProgress = $state<any>(null);
  let loading = $state(true);

  // Modal states
  let reportModalOpen = $state(false);
  let itemModalOpen = $state(false);
  let selectedApprentice = $state<any>(null);
  let selectedItem = $state<any>(null);
  let reportType = $state('POSITIVE');
  let reportContent = $state('');

  // Item Modal form states
  let itemForm = $state({
    id: '',
    title: '',
    description: '',
    category: 'TOOLS',
    sortOrder: 0
  });

  let endTutoringModalOpen = $state(false);
  let endTutoringStatus = $state<'PASSED' | 'FAILED'>('PASSED');
  let endTutoringNotes = $state('');
  let endTutoringForce = $state(false);
  let endTutoringError = $state<string | null>(null);
  let canForce = $state(false);

  // Confirmation Modal state
  let confirmModal = $state({
    open: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const saveAction = createAsyncActionState();

  let featureConfig = $state<any>(null);
  let loadingConfig = $state(false);

  async function loadFeatureConfig() {
    loadingConfig = true;
    try {
      const configs = await fetchFeatureConfigurations();
      featureConfig = configs?.features?.find((c: any) => c.featureKey === 'tutoring') || null;
    } catch (err) {
      console.error('Error fetching tutoring config:', err);
    } finally {
      loadingConfig = false;
    }
  }

  function showConfirm(title: string, message: string, onConfirm: () => void) {
    confirmModal = { open: true, title, message, onConfirm };
  }

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
      else if (authStore.isAdmin || tutorApprentices.length > 0) activeTab = 'config';

    } catch (err) {
      console.error('Error fetching tutoring data:', err);
    } finally {
      loading = false;
    }
  }

  onMount(async () => {
    await Promise.all([
      fetchData(),
      loadFeatureConfig()
    ]);
  });

  async function saveConfig() {
    await saveAction.run(async () => {
      const ok = await updateTutoringConfig(config);
      if (!ok) throw new Error('Erreur API');

      if (featureConfig) {
        // Sync to feature config as well
        await updateFeatureConfiguration('tutoring', {
          metadata: {
            reportIntervalDays: config.reportIntervalDays,
            reminderDaysBefore: config.reminderDaysBefore,
            minTestDays: config.minTestDays,
            showVocalActivity: config.showVocalActivity,
            showAbsences: config.showAbsences,
            remindersEnabled: config.remindersEnabled
          }
        });
      }

      await dashboardStore.refresh();
      return true;
    }, { successMessage: 'Configuration enregistrée.' });
  }

  async function setChecklistState(periodId: string, itemId: string, targetState: string, currentState: string | undefined) {
    const newState = currentState === targetState ? 'UNCHECKED' : targetState;
    
    try {
      await updateTutoringChecklist(periodId, itemId, newState);
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
    
    let totalScore = 0;
    progress.forEach(p => {
      if (p.state === 'KNOWN') totalScore += 1;
      else if (p.state === 'ACQUIRED') totalScore += 2;
    });
    
    const maxScore = tutoringItems.length * 2;
    return Math.round((totalScore / maxScore) * 100);
  }

  async function handleDeleteTutoring(periodId: string) {
    showConfirm(
      'Supprimer le tutorat',
      'Êtes-vous sûr de vouloir supprimer ce tutorat ? Cette action est irréversible.',
      async () => {
        try {
          await deleteTestingPeriod(periodId);
          fetchData();
        } catch (err) {
          console.error('Error deleting tutoring:', err);
        }
      }
    );
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

  function openItemModal(item = null) {
    if (item) {
      itemForm = {
        id: item.id,
        title: item.title,
        description: item.description,
        category: item.category,
        sortOrder: item.sortOrder || 0
      };
      selectedItem = item;
    } else {
      itemForm = {
        id: '',
        title: '',
        description: '',
        category: 'TOOLS',
        sortOrder: tutoringItems.length
      };
      selectedItem = null;
    }
    itemModalOpen = true;
  }

  async function saveItem() {
    if (!itemForm.title.trim()) return;
    try {
      await upsertTutoringItem(itemForm);
      itemModalOpen = false;
      fetchData();
    } catch (err) {
      console.error('Error saving tutoring item:', err);
    }
  }

  async function deleteItem(itemId: string) {
    showConfirm(
      'Supprimer l\'item',
      'Êtes-vous sûr de vouloir supprimer cet item de la checklist ?',
      async () => {
        try {
          await deleteTutoringItem(itemId);
          fetchData();
        } catch (err) {
          console.error('Error deleting tutoring item:', err);
        }
      }
    );
  }

  import ModulePage from '../lib/components/ModulePage.svelte';
</script>

<ModulePage 
  title="Système de Tutorat" 
  description="Accompagnement, transmission et suivi des nouveaux arrivants." 
  icon="book"
  featureKey="tutoring"
>
  {#snippet actions()}
    <div class="flex items-center gap-4">
      <div class="flex items-center gap-2 p-1 bg-surface-container-high/50 rounded-lg border border-outline-variant/20 relative">
        <button 
          onclick={() => activeTab = 'dashboard'}
          class="tab-button {activeTab === 'dashboard' ? 'active' : ''}"
        >
          <Papicon icon="grid" size={18} />
          <span class="text-sm font-bold">Dashboard Tuteur</span>
        </button>
        <button 
          onclick={() => activeTab = 'progress'}
          class="tab-button {activeTab === 'progress' ? 'active' : ''}"
        >
          <Papicon icon="trending-up" size={18} />
          <span class="text-sm font-bold">Ma Progression</span>
        </button>
        {#if authStore.isAdmin || tutorApprentices.length > 0}
          <button 
            onclick={() => activeTab = 'config'}
            class="tab-button {activeTab === 'config' ? 'active' : ''}"
          >
            <Papicon icon="settings" size={18} />
            <span class="text-sm font-bold">Configuration</span>
          </button>
        {/if}
      </div>

      {#if authStore.isAdmin}
        <button 
          onclick={openCreateTutoringModal}
          class="flex items-center gap-2 px-5 py-3 rounded-lg transition-all duration-300 bg-primary text-white hover: active:scale-[0.98]"
        >
          <Papicon icon="plus" size={18} />
          <span class="text-sm font-semibold uppercase tracking-wider">Créer un tutorat</span>
        </button>
      {/if}
    </div>
  {/snippet}

  {#if loading}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each Array(3) as _}
        <div class="h-64 bg-surface-container rounded-xl animate-pulse"></div>
      {/each}
    </div>
  {:else}
    <!-- Content based on tab -->
    {#if activeTab === 'dashboard'}
      <div class="grid grid-cols-1 gap-8">
        {#if tutorApprentices.length === 0}
          <div class="flex flex-col items-center justify-center py-20 bg-surface-container-low/40 rounded-xl border border-dashed border-outline-variant/50">
            <Papicon icon="user-plus" size={48} class="text-on-surface-variant/30 mb-4" />
            <p class="text-on-surface-variant font-medium">Vous n'avez pas d'apprentis sous votre tutorat actuellement.</p>
          </div>
        {:else}
          {#each tutorApprentices as apprentice}
            <div class="bg-surface-container-low/60 rounded-xl border border-outline-variant/30 overflow-hidden">
              <div class="p-8 flex flex-col md:flex-row gap-8">
                <!-- Apprentice Sidebar -->
                <div class="w-full md:w-64 flex flex-col gap-4">
                  <div class="flex flex-col items-center gap-4 p-6 bg-surface-container rounded-xl">
                    <div class="w-20 h-20 rounded-lg bg-primary/10 flex items-center justify-center border-2 border-primary/20 overflow-hidden shadow-inner">
                      {#if apprentice.staffMember.avatarUrl}
                        <img src={apprentice.staffMember.avatarUrl} alt={apprentice.staffMember.username} class="w-full h-full object-cover" />
                      {:else}
                        <Papicon icon="user" size={40} class="text-primary" />
                      {/if}
                    </div>
                    <div class="text-center">
                      <h3 class="font-semibold text-on-surface">{apprentice.staffMember.username}</h3>
                      {#if apprentice.mentor && apprentice.mentor.userId !== authStore.user?.id}
                        <p class="text-[10px] font-bold text-primary uppercase tracking-wider">Tuteur: {apprentice.mentor.username}</p>
                      {/if}
                      <p class="text-xs text-on-surface-variant">Apprenti depuis {new Date(apprentice.startDate).toLocaleDateString()}</p>
                    </div>
                  </div>
                  
                  <div class="flex flex-col gap-2">
                    <div class="flex justify-between text-[13px] font-medium text-on-surface-variant/70 px-2">
                      <span>Progression</span>
                      <span>{getProgressPercentage(apprentice.checklistProgress)}%</span>
                    </div>
                    <div class="h-3 bg-surface-container-high rounded-full overflow-hidden border border-outline-variant/20 p-0.5">
                      <div 
                        class="h-full bg-primary/10 rounded-full transition-all duration-1000" 
                        style="width: {getProgressPercentage(apprentice.checklistProgress)}%"
                      ></div>
                    </div>
                  </div>

                  <div class="mt-4 p-4 bg-primary/5 rounded-lg border border-primary/10">
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
                        class="flex-1 py-3 bg-success/10 text-success rounded-xl text-xs font-semibold hover:bg-success/20 transition-all"
                      >
                        Valider
                      </button>
                      <button 
                         onclick={() => { selectedApprentice = apprentice; endTutoringStatus = 'FAILED'; endTutoringModalOpen = true; endTutoringError = null; canForce = false; }}
                        class="flex-1 py-3 bg-error/10 text-error rounded-xl text-xs font-semibold hover:bg-error/20 transition-all"
                      >
                        Échec
                      </button>
                    </div>
                    {#if authStore.isAdmin}
                      <button 
                        onclick={() => handleDeleteTutoring(apprentice.id)}
                        class="w-full py-2 text-on-surface-variant/50 hover:text-error text-xs font-medium transition-all"
                      >
                        Supprimer le tutorat
                      </button>
                    {/if}
                  </div>
                </div>

                <!-- Main Content -->
                <div class="flex-1 flex flex-col gap-6">
                  {#if (config?.showVocalActivity || config?.showAbsences) && (apprentice.vocalStats || (apprentice.absences && apprentice.absences.length > 0))}
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {#if config?.showVocalActivity && apprentice.vocalStats}
                        <div class="p-4 bg-primary/5 rounded-lg border border-primary/10 flex items-center gap-4">
                          <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                            <Papicon icon="mic" size={20} />
                          </div>
                          <div>
                            <div class="text-[10px] font-semibold uppercase text-primary tracking-widest">Activité Vocale</div>
                            <div class="text-lg font-semibold text-on-surface">
                              {Math.round(apprentice.vocalStats.voiceTimeSeconds / 3600)}h {Math.round((apprentice.vocalStats.voiceTimeSeconds % 3600) / 60)}m
                            </div>
                            <div class="text-[11px] text-on-surface-variant">{apprentice.vocalStats.voiceSessionCount} sessions au total</div>
                          </div>
                        </div>
                      {/if}

                      {#if config?.showAbsences && apprentice.absences && apprentice.absences.length > 0}
                        <div class="p-4 bg-warning/5 rounded-lg border border-warning/10 flex items-center gap-4">
                          <div class="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center text-warning">
                            <Papicon icon="calendar-off" size={20} />
                          </div>
                          <div class="flex-1 overflow-hidden">
                            <div class="text-[10px] font-semibold uppercase text-warning tracking-widest">Absences à venir</div>
                            <div class="flex flex-col gap-0.5">
                              {#each apprentice.absences as absence}
                                <div class="text-[10px] font-bold text-on-surface truncate">
                                  {new Date(absence.startDate).toLocaleDateString()} - {new Date(absence.endDate).toLocaleDateString()}
                                </div>
                              {/each}
                            </div>
                          </div>
                        </div>
                      {/if}
                    </div>
                  {/if}

                  <div class="flex items-center justify-between border-b border-outline-variant/30 pb-4">
                    <h2 class="text-xl font-semibold text-on-surface">Checklist de Transmission</h2>
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
                      <div class="flex items-start gap-4 p-4 bg-surface-container/30 rounded-lg border border-outline-variant/20 hover:border-primary/30 transition-all group">
                        <div class="flex-1">
                          <div class="flex items-center justify-between mb-1">
                            <div class="flex items-center gap-2">
                              <span class="font-bold text-sm text-on-surface">{item.title}</span>
                              <Papicon 
                                icon={categories.find(c => c.id === item.category)?.icon || 'info'} 
                                size={12} 
                                class="text-on-surface-variant/40" 
                              />
                            </div>
                            
                            <div class="flex gap-2">
                              <button 
                                onclick={() => setChecklistState(apprentice.id, item.id, 'KNOWN', progress?.state)}
                                class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all text-[10px] font-semibold uppercase tracking-wider
 {progress?.state === 'KNOWN' ? 'bg-primary/10 border-primary/30 text-primary shadow-sm shadow-primary/5' : 
                                   progress?.state === 'ACQUIRED' ? 'bg-surface-container-highest/30 border-outline-variant/20 text-on-surface-variant/30 cursor-not-allowed' :
                                   'bg-surface-container border-outline-variant/30 text-on-surface-variant hover:border-primary/50'}"
                                disabled={progress?.state === 'ACQUIRED'}
                              >
                                <Papicon icon="eye" size={12} />
                                <span>Connu</span>
                              </button>
                              
                              <button 
                                onclick={() => setChecklistState(apprentice.id, item.id, 'ACQUIRED', progress?.state)}
                                class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all text-[10px] font-semibold uppercase tracking-wider
 {progress?.state === 'ACQUIRED' ? 'bg-success/10 border-success/30 text-success shadow-sm shadow-success/5' : 
                                   'bg-surface-container border-outline-variant/30 text-on-surface-variant hover:border-success/50'}"
                              >
                                <Papicon icon="check" size={12} />
                                <span>Acquis</span>
                              </button>
                            </div>
                          </div>
                          
                          <p class="text-xs text-on-surface-variant leading-relaxed mb-2">{item.description}</p>
                          
                          {#if progress?.completedAt}
                            <div class="flex items-center gap-1 text-[11px] font-medium text-primary/60">
                              <Papicon icon="clock" size={10} />
                              <span>Validé le {new Date(progress.completedAt).toLocaleDateString()} par {apprentice.mentor?.username || 'un tuteur'}</span>
                            </div>
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
        <div class="flex flex-col items-center justify-center py-20 bg-surface-container-low/40 rounded-xl border border-dashed border-outline-variant/50">
          <Papicon icon="award" size={48} class="text-on-surface-variant/30 mb-4" />
          <p class="text-on-surface-variant font-medium">Vous n'êtes pas en période de tutorat actuellement.</p>
        </div>
      {:else}
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <!-- Progress Stats -->
          <div class="lg:col-span-2 flex flex-col gap-8">
            <div class="bg-surface-container-low/60 p-8 rounded-xl border border-outline-variant/30 relative overflow-hidden">
               <div class="absolute top-0 right-0 p-8">
                <div class="w-32 h-32 rounded-full border-10 border-surface-container-high relative flex items-center justify-center">
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
                    <span class="text-2xl font-semibold text-on-surface">{getProgressPercentage(apprenticeProgress.checklistProgress)}%</span>
                  </div>
                </div>
              </div>

              <h2 class="text-2xl font-semibold text-on-surface mb-2">Ma Progression</h2>
              <p class="text-on-surface-variant mb-8 max-w-md">Continuez à valider vos acquis avec votre tuteur {apprenticeProgress.mentor?.username || 'attitré'}.</p>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                {#each categories as cat}
                  {@const items = tutoringItems.filter(i => i.category === cat.id)}
                  {@const score = apprenticeProgress.checklistProgress.filter(p => items.find(i => i.id === p.itemId)).reduce((acc, p) => acc + (p.state === 'ACQUIRED' ? 2 : p.state === 'KNOWN' ? 1 : 0), 0)}
                  {@const catProgress = Math.round((score / (items.length * 2)) * 100)}
                  <div class="p-6 bg-surface-container/50 rounded-xl border border-outline-variant/20">
                    <div class="flex items-center gap-3 mb-4">
                      <div class="w-10 h-10 rounded-xl bg-{cat.color}/10 flex items-center justify-center">
                        <Papicon icon={cat.icon} size={20} class="text-{cat.color}" />
                      </div>
                      <div>
                        <div class="text-xs font-semibold uppercase text-on-surface-variant/60">{cat.label}</div>
                        <div class="text-lg font-semibold text-on-surface">{catProgress}%</div>
                      </div>
                    </div>
                    <div class="h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                      <div 
                        class="h-full bg-{cat.color} transition-all duration-700" 
                        style="width: {catProgress}%"
                      ></div>
                    </div>
                  </div>
                {/each}
              </div>
            </div>

            <!-- Logbook -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              {#if config?.showVocalActivity && apprenticeProgress.vocalStats}
                <div class="bg-surface-container-low/60 p-8 rounded-xl border border-outline-variant/30 flex items-center gap-6">
                  <div class="w-16 h-16 rounded-lg bg-primary/10 flex items-center justify-center text-primary shadow-sm">
                    <Papicon icon="mic" size={32} />
                  </div>
                  <div>
                    <h3 class="text-xs font-semibold uppercase text-primary tracking-widest mb-1">Mon Activité Vocale</h3>
                    <div class="text-lg font-semibold text-on-surface leading-none mb-1">
                      {Math.round(apprenticeProgress.vocalStats.voiceTimeSeconds / 3600)}h {Math.round((apprenticeProgress.vocalStats.voiceTimeSeconds % 3600) / 60)}m
                    </div>
                    <p class="text-[10px] font-medium text-on-surface-variant uppercase tracking-wider">{apprenticeProgress.vocalStats.voiceSessionCount} sessions enregistrées</p>
                  </div>
                </div>
              {/if}

              {#if config?.showAbsences && apprenticeProgress.absences && apprenticeProgress.absences.length > 0}
                <div class="bg-surface-container-low/60 p-8 rounded-xl border border-outline-variant/30 flex items-center gap-6">
                  <div class="w-16 h-16 rounded-lg bg-warning/10 flex items-center justify-center text-warning shadow-lg shadow-warning/5">
                    <Papicon icon="calendar-off" size={32} />
                  </div>
                  <div class="flex-1 overflow-hidden">
                    <h3 class="text-xs font-semibold uppercase text-warning tracking-widest mb-1">Mes Absences</h3>
                    <div class="flex flex-col gap-1">
                      {#each apprenticeProgress.absences.slice(0, 2) as absence}
                        <div class="flex items-center justify-between">
                          <span class="text-sm font-bold text-on-surface">{new Date(absence.startDate).toLocaleDateString()}</span>
                          <span class="text-[10px] font-medium text-on-surface-variant">→ {new Date(absence.endDate).toLocaleDateString()}</span>
                        </div>
                      {/each}
                    </div>
                  </div>
                </div>
              {/if}
            </div>

            <div class="bg-surface-container-low/60 p-8 rounded-xl border border-outline-variant/30">
              <h2 class="text-2xl font-semibold text-on-surface mb-6">Carnet de Bord</h2>
              
              <div class="flex flex-col gap-6">
                <div class="flex gap-4">
                  <input 
                    type="text" 
                    placeholder="Qu'avez-vous appris aujourd'hui ?" 
                    class="flex-1 bg-surface-container px-6 py-4 rounded-lg border border-outline-variant/30 focus:outline-none focus:border-primary transition-all text-on-surface"
                    onkeydown={(e) => { if(e.key === 'Enter') { addLog(apprenticeProgress.id, e.currentTarget.value); e.currentTarget.value = ''; } }}
                  />
                  <button 
                    class="bg-primary text-white px-8 rounded-lg font-semibold active:scale-[0.98] transition-all"
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
                    <div class="p-6 bg-surface-container/30 rounded-xl border border-outline-variant/20 flex gap-4 animate-in slide-in-from-left-2 duration-300">
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
            <div class="bg-surface-container-low/60 p-8 rounded-xl border border-outline-variant/30 text-center">
              <div class="w-24 h-24 mx-auto bg-primary/10 rounded-xl flex items-center justify-center shadow-sm shadow-primary/20 mb-6">
                <Papicon icon="user-check" size={40} class="text-white" />
              </div>
              <h3 class="text-xl font-semibold text-on-surface mb-1">Mon Tuteur</h3>
              <p class="text-on-surface-variant font-medium mb-6">{apprenticeProgress.mentor?.username || 'En attente...'}</p>
              
              <div class="flex flex-col gap-3">
                <button class="w-full py-4 rounded-lg border-2 border-primary/20 text-primary font-semibold hover:bg-primary/5 transition-all">
                  Contacter sur Discord
                </button>
              </div>
            </div>

            <div class="bg-surface-container-low/60 p-8 rounded-xl border border-outline-variant/30">
              <h3 class="font-semibold text-on-surface mb-4">Dernier Retour</h3>
              {#if apprenticeProgress.reports.length > 0}
                {@const lastReport = apprenticeProgress.reports[0]}
                <div class="flex items-center gap-2 mb-3">
                  <div class="px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase {lastReport.type === 'POSITIVE' ? 'bg-success/10 text-success' : lastReport.type === 'NEGATIVE' ? 'bg-error/10 text-error' : 'bg-warning/10 text-warning'}">
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
        <div class="lg:col-span-1 bg-surface-container-low/60 p-8 rounded-xl border border-outline-variant/30 flex flex-col gap-6">
          <h2 class="text-2xl font-semibold text-on-surface mb-4">Paramètres</h2>
          
          {#if !config}
            <div class="p-6 bg-surface-container rounded-xl border border-dashed border-outline-variant/50 flex flex-col items-center justify-center text-center">
              <Papicon icon="alert-circle" size={32} class="text-on-surface-variant/30 mb-2" />
              <p class="text-xs text-on-surface-variant font-medium">Impossible de charger la configuration.</p>
            </div>
          {:else}
            <div class="flex flex-col gap-2">
              <label for="reportIntervalDays" class="text-xs font-semibold uppercase text-on-surface-variant tracking-widest pl-2">Intervalle des Rapports (jours)</label>
              <input 
                id="reportIntervalDays"
                type="number" 
                bind:value={config.reportIntervalDays}
                class="bg-surface-container px-6 py-4 rounded-lg border border-outline-variant/30 focus:border-primary outline-none transition-all"
              />
            </div>

          <div class="flex flex-col gap-2">
            <label for="reminderDaysBefore" class="text-xs font-semibold uppercase text-on-surface-variant tracking-widest pl-2">Rappels avant échéance (jours)</label>
            <input 
              id="reminderDaysBefore"
              type="number" 
              bind:value={config.reminderDaysBefore}
              class="bg-surface-container px-6 py-4 rounded-lg border border-outline-variant/30 focus:border-primary outline-none transition-all"
            />
          </div>

          <div class="flex flex-col gap-2">
            <label for="minTestDays" class="text-xs font-semibold uppercase text-on-surface-variant tracking-widest pl-2">Temps minimum en test (jours)</label>
            <input 
              id="minTestDays"
              type="number" 
              bind:value={config.minTestDays}
              class="bg-surface-container px-6 py-4 rounded-lg border border-outline-variant/30 focus:border-primary outline-none transition-all"
            />
          </div>

            <div class="flex items-center justify-between p-4 bg-surface-container/50 rounded-lg border border-outline-variant/20">
              <div class="flex flex-col">
                <span class="font-bold text-on-surface text-sm">Activité Vocale</span>
                <span class="text-[10px] text-on-surface-variant">Afficher les stats vocales</span>
              </div>
              <button 
                onclick={() => config.showVocalActivity = !config.showVocalActivity}
                class="w-10 h-5 rounded-full transition-all relative {config.showVocalActivity ? 'bg-primary' : 'bg-outline-variant'}"
                aria-label="Toggle vocal activity"
              >
                <div class="absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-all {config.showVocalActivity ? 'translate-x-5' : ''}"></div>
              </button>
            </div>

            <div class="flex items-center justify-between p-4 bg-surface-container/50 rounded-lg border border-outline-variant/20">
              <div class="flex flex-col">
                <span class="font-bold text-on-surface text-sm">Absences</span>
                <span class="text-[10px] text-on-surface-variant">Afficher les absences</span>
              </div>
              <button 
                onclick={() => config.showAbsences = !config.showAbsences}
                class="w-10 h-5 rounded-full transition-all relative {config.showAbsences ? 'bg-primary' : 'bg-outline-variant'}"
                aria-label="Toggle absences"
              >
                <div class="absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-all {config.showAbsences ? 'translate-x-5' : ''}"></div>
              </button>
            </div>

            <div class="flex items-center justify-between p-4 bg-surface-container/50 rounded-lg border border-outline-variant/20 mt-2">
              <div class="flex flex-col">
                <span class="font-bold text-on-surface text-sm">Notifications DM</span>
                <span class="text-[10px] text-on-surface-variant">Rappels automatiques aux tuteurs</span>
              </div>
              <button 
                onclick={() => config.remindersEnabled = !config.remindersEnabled}
                class="w-10 h-5 rounded-full transition-all relative {config.remindersEnabled ? 'bg-primary' : 'bg-outline-variant'}"
                aria-label="Toggle DM notifications"
              >
                <div class="absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-all {config.remindersEnabled ? 'translate-x-5' : ''}"></div>
              </button>
            </div>

          <button 
            class="w-full py-4 mt-4 bg-primary text-white rounded-lg font-semibold shadow-sm shadow-primary/20 active:scale-[0.98] transition-all disabled:opacity-50"
            onclick={saveConfig}
            disabled={saveAction.state.loading}
          >
            {saveAction.state.loading ? 'Enregistrement...' : 'Sauvegarder'}
          </button>
          {/if}

          {#if featureConfig}
            <div class="pt-6 border-t border-outline-variant/10">
              <RolePermissionSettings 
                featureKey="tutoring" 
                roleAccess={featureConfig.roleAccessByRole} 
              />
            </div>
          {/if}
        </div>

        <!-- Checklist Items Management -->
        <div class="lg:col-span-2 bg-surface-container-low/60 p-8 rounded-xl border border-outline-variant/30">
          <div class="flex items-center justify-between mb-8">
            <h2 class="text-2xl font-semibold text-on-surface">Checklist de Formation</h2>
            <button 
              onclick={() => openItemModal()}
              class="bg-primary/10 text-primary px-6 py-2.5 rounded-xl font-bold hover:bg-primary/20 transition-all flex items-center gap-2"
            >
              <Papicon icon="plus" size={18} />
              Nouvel Item
            </button>
          </div>

          <div class="flex flex-col gap-4">
            {#each tutoringItems as item}
              <div class="p-6 bg-surface-container/30 rounded-xl border border-outline-variant/20 flex items-center justify-between group">
                <div class="flex items-center gap-4">
                  <div class="w-12 h-12 rounded-lg bg-surface-container-high flex items-center justify-center text-on-surface-variant group- transition-all">
                    <Papicon icon={categories.find(c => c.id === item.category)?.icon || 'help-circle'} size={24} />
                  </div>
                  <div>
                    <div class="flex items-center gap-2">
                      <span class="font-semibold text-on-surface">{item.title}</span>
                      <span class="text-[10px] font-semibold uppercase px-2 py-0.5 bg-primary/5 text-primary rounded-md">{item.category}</span>
                    </div>
                    <p class="text-sm text-on-surface-variant line-clamp-1">{item.description}</p>
                  </div>
                </div>
                <div class="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                  <button 
                    onclick={() => openItemModal(item)}
                    class="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-on-surface-variant hover:text-primary transition-all"
                    aria-label="Modifier l'item"
                  >
                    <Papicon icon="edit-2" size={18} />
                  </button>
                  <button 
                    onclick={() => deleteItem(item.id)}
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

{#if reportModalOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-container-lowest/80 animate-in fade-in duration-300">
    <div class="w-full max-w-lg bg-surface-container-low rounded-[31px] border border-outline-variant/30 shadow-sm overflow-hidden animate-in zoom-in-95 duration-300">
      <div class="p-8">
        <h2 class="text-2xl font-semibold text-on-surface mb-2">Nouveau Rapport</h2>
        <p class="text-on-surface-variant mb-6 font-medium">Postez un rapport sur l'évolution de **{selectedApprentice?.staffMember?.username}**.</p>
        
        <div class="flex flex-col gap-6">
          <div class="flex gap-2 p-1 bg-surface-container rounded-lg border border-outline-variant/20">
            {#each ['POSITIVE', 'NEUTRAL', 'NEGATIVE'] as type}
              <button 
                onclick={() => reportType = type}
                class="flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all {reportType === type ? 'bg-primary text-white ' : 'text-on-surface-variant hover:bg-surface-hover'}"
              >
                {type}
              </button>
            {/each}
          </div>

          <textarea 
            placeholder="Détails du rapport..." 
            bind:value={reportContent}
            rows="6"
            class="w-full bg-surface-container px-6 py-4 rounded-lg border border-outline-variant/30 focus:border-primary outline-none transition-all text-on-surface resize-none"
          ></textarea>

          <div class="flex gap-4">
            <button 
              onclick={() => reportModalOpen = false}
              class="flex-1 py-4 rounded-lg border-2 border-outline-variant/30 text-on-surface-variant font-semibold hover:bg-surface-hover transition-all"
            >
              Annuler
            </button>
            <button 
              onclick={submitReport}
              class="flex-1 py-4 bg-primary text-white rounded-lg font-semibold shadow-sm shadow-primary/20 active:scale-[0.98] transition-all"
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
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-container-lowest/80 animate-in fade-in duration-300">
    <div class="w-full max-w-lg bg-surface-container-low rounded-[31px] border border-outline-variant/30 shadow-sm overflow-hidden animate-in zoom-in-95 duration-300">
      <div class="p-8">
        <h2 class="text-2xl font-semibold text-on-surface mb-2">
          {endTutoringStatus === 'PASSED' ? 'Valider le Tutorat' : 'Échec du Tutorat'}
        </h2>
        <p class="text-on-surface-variant mb-6 font-medium text-sm">
          {endTutoringStatus === 'PASSED' 
            ? `Vous êtes sur le point de valider officiellement le tutorat de ${selectedApprentice?.staffMember?.username}.`
            : `Vous allez marquer le tutorat de ${selectedApprentice?.staffMember?.username} comme ayant échoué.`}
        </p>
        
        <div class="flex flex-col gap-6">
          <div class="p-4 bg-surface-container/50 rounded-lg border border-outline-variant/20 flex items-center justify-between">
            <div class="flex flex-col">
              <span class="text-xs font-semibold uppercase text-on-surface-variant tracking-widest">Durée actuelle</span>
              <span class="font-bold text-on-surface">{getDaysInTest(selectedApprentice?.startDate)} jours</span>
            </div>
            <div class="flex flex-col items-end">
              <span class="text-xs font-semibold uppercase text-on-surface-variant tracking-widest">Requis</span>
              <span class="font-bold text-on-surface">{config?.minTestDays ?? 14} jours</span>
            </div>
          </div>

          {#if endTutoringError}
            <div class="p-4 bg-error/10 border border-error/20 rounded-lg flex gap-3 animate-in shake duration-500">
              <Papicon icon="alert-triangle" size={20} class="text-error mt-0.5" />
              <div class="flex-1">
                <p class="text-sm font-bold text-error leading-tight">{endTutoringError}</p>
                {#if canForce && authStore.isAdmin}
                  <button 
                    onclick={() => { endTutoringForce = true; endTutoringError = null; }}
                    class="mt-2 text-xs font-semibold uppercase text-error underline underline-offset-4 hover:text-error/80 transition-all"
                  >
                    Cliquer ici pour forcer la validation
                  </button>
                {/if}
              </div>
            </div>
          {/if}

          <div class="flex flex-col gap-2">
            <label for="notes" class="text-xs font-semibold uppercase text-on-surface-variant tracking-widest pl-2">Notes finales (facultatif)</label>
            <textarea 
              id="notes"
              placeholder="Commentaires sur la période..." 
              bind:value={endTutoringNotes}
              rows="4"
              class="w-full bg-surface-container px-6 py-4 rounded-lg border border-outline-variant/30 focus:border-primary outline-none transition-all text-on-surface resize-none"
            ></textarea>
          </div>

          {#if endTutoringForce}
            <div class="p-4 bg-warning/10 border border-warning/20 rounded-lg flex items-center justify-between">
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
              class="flex-1 py-4 rounded-lg border-2 border-outline-variant/30 text-on-surface-variant font-semibold hover:bg-surface-hover transition-all"
            >
              Annuler
            </button>
            <button 
              onclick={submitEndTutoring}
              class="flex-1 py-4 {endTutoringStatus === 'PASSED' ? 'bg-success' : 'bg-error'} text-white rounded-lg font-semibold shadow-sm transition-all active:scale-[0.98]"
            >
              Confirmer
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

{#if itemModalOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-container-lowest/80 animate-in fade-in duration-300">
    <div class="w-full max-w-lg bg-surface-container-low rounded-[31px] border border-outline-variant/30 shadow-sm overflow-hidden animate-in zoom-in-95 duration-300">
      <div class="p-8">
        <h2 class="text-2xl font-semibold text-on-surface mb-2">{selectedItem ? 'Modifier' : 'Nouvel'} Item de Checklist</h2>
        <p class="text-on-surface-variant mb-6 font-medium text-sm">Définissez un objectif de formation pour les apprentis.</p>
        
        <div class="flex flex-col gap-6">
          <div class="flex flex-col gap-2">
            <label for="item-title" class="text-xs font-semibold uppercase text-on-surface-variant tracking-widest pl-2">Titre de l'objectif</label>
            <input 
              id="item-title"
              type="text" 
              placeholder="Ex: Utilisation de la console admin" 
              bind:value={itemForm.title}
              class="bg-surface-container px-6 py-4 rounded-lg border border-outline-variant/30 focus:border-primary outline-none transition-all text-on-surface"
            />
          </div>

          <div class="flex flex-col gap-2">
            <label for="item-category" class="text-xs font-semibold uppercase text-on-surface-variant tracking-widest pl-2">Catégorie</label>
            <select 
              id="item-category"
              bind:value={itemForm.category}
              class="bg-surface-container px-6 py-4 rounded-lg border border-outline-variant/30 focus:border-primary outline-none transition-all text-on-surface"
            >
              {#each categories as cat}
                <option value={cat.id}>{cat.label}</option>
              {/each}
            </select>
          </div>

          <div class="flex flex-col gap-2">
            <label for="item-desc" class="text-xs font-semibold uppercase text-on-surface-variant tracking-widest pl-2">Description détaillée</label>
            <textarea 
              id="item-desc"
              placeholder="Expliquez ce que l'apprenti doit savoir faire..." 
              bind:value={itemForm.description}
              rows="4"
              class="w-full bg-surface-container px-6 py-4 rounded-lg border border-outline-variant/30 focus:border-primary outline-none transition-all text-on-surface resize-none"
            ></textarea>
          </div>

          <div class="flex gap-4">
            <button 
              onclick={() => itemModalOpen = false}
              class="flex-1 py-4 rounded-lg border-2 border-outline-variant/30 text-on-surface-variant font-semibold hover:bg-surface-hover transition-all"
            >
              Annuler
            </button>
            <button 
              onclick={saveItem}
              class="flex-1 py-4 bg-primary text-white rounded-lg font-semibold shadow-sm shadow-primary/20 active:scale-[0.98] transition-all"
            >
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

{#if createTutoringModalOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-container-lowest/80 animate-in fade-in duration-300">
    <div class="w-full max-w-lg bg-surface-container-low rounded-[31px] border border-outline-variant/30 shadow-sm overflow-hidden animate-in zoom-in-95 duration-300">
      <div class="p-8">
        <h2 class="text-2xl font-semibold text-on-surface mb-2">Créer un nouveau Tutorat</h2>
        <p class="text-on-surface-variant mb-6 font-medium text-sm">Assignez un tuteur à un membre du staff en période de test.</p>
        
        {#if loadingStaffInfo}
          <div class="flex flex-col items-center justify-center py-10">
            <div class="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            <p class="text-sm text-on-surface-variant mt-4 font-medium">Chargement des membres du staff...</p>
          </div>
        {:else}
          <div class="flex flex-col gap-6">
            <div class="flex flex-col gap-2">
              <label for="apprentice" class="text-xs font-semibold uppercase text-on-surface-variant tracking-widest pl-2">Apprenti (Membre Staff)</label>
              <select 
                id="apprentice"
                bind:value={createTutoringForm.staffUserId}
                class="bg-surface-container px-6 py-4 rounded-lg border border-outline-variant/30 focus:border-primary outline-none transition-all text-on-surface"
              >
                <option value="">-- Choisir un apprenti --</option>
                {#each allStaffMembers as member}
                  <option value={member.userId}>
                    {member.displayName || member.username} ({member.grade})
                  </option>
                {/each}
              </select>
            </div>

            <div class="flex flex-col gap-2">
              <label for="mentor" class="text-xs font-semibold uppercase text-on-surface-variant tracking-widest pl-2">Tuteur (Facultatif)</label>
              <select 
                id="mentor"
                bind:value={createTutoringForm.mentorId}
                class="bg-surface-container px-6 py-4 rounded-lg border border-outline-variant/30 focus:border-primary outline-none transition-all text-on-surface"
              >
                <option value="">-- Aucun tuteur (Période autonome) --</option>
                {#each allStaffMembers.filter(m => m.isTutor) as member}
                  <option value={member.userId}>
                    {member.displayName || member.username}
                  </option>
                {/each}
              </select>
            </div>

            <div class="flex flex-col gap-2">
              <label for="target-grade" class="text-xs font-semibold uppercase text-on-surface-variant tracking-widest pl-2">Grade Visé (Facultatif)</label>
              <select 
                id="target-grade"
                bind:value={createTutoringForm.targetGrade}
                class="bg-surface-container px-6 py-4 rounded-lg border border-outline-variant/30 focus:border-primary outline-none transition-all text-on-surface"
              >
                <option value="">-- Aucun --</option>
                {#each allStaffRoles as role}
                  <option value={role.name}>{role.name}</option>
                {/each}
              </select>
            </div>

            <div class="flex flex-col gap-2">
              <label for="duration" class="text-xs font-semibold uppercase text-on-surface-variant tracking-widest pl-2">Durée planifiée (jours)</label>
              <input 
                id="duration"
                type="number" 
                bind:value={createTutoringForm.plannedDurationDays}
                min="1"
                class="bg-surface-container px-6 py-4 rounded-lg border border-outline-variant/30 focus:border-primary outline-none transition-all text-on-surface"
              />
            </div>

            <div class="flex gap-4">
              <button 
                onclick={() => createTutoringModalOpen = false}
                class="flex-1 py-4 rounded-lg border-2 border-outline-variant/30 text-on-surface-variant font-semibold hover:bg-surface-hover transition-all"
              >
                Annuler
              </button>
              <button 
                onclick={submitCreateTutoring}
                class="flex-1 py-4 bg-primary text-white rounded-lg font-semibold shadow-sm shadow-primary/20 active:scale-[0.98] transition-all"
              >
                Créer
              </button>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

{#if confirmModal.open}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-container-lowest/80 animate-in fade-in duration-300">
    <div class="w-full max-w-md bg-surface-container-low rounded-[31px] border border-outline-variant/30 shadow-sm overflow-hidden animate-in zoom-in-95 duration-300">
      <div class="p-8">
        <div class="w-16 h-16 bg-error/10 rounded-lg flex items-center justify-center text-error mb-6 mx-auto">
          <Papicon icon="alert-triangle" size={32} />
        </div>
        
        <h2 class="text-2xl font-semibold text-on-surface text-center mb-2">{confirmModal.title}</h2>
        <p class="text-on-surface-variant text-center mb-8 font-medium">{confirmModal.message}</p>
        
        <div class="flex gap-4">
          <button 
            onclick={() => confirmModal.open = false}
            class="flex-1 py-4 rounded-lg border-2 border-outline-variant/30 text-on-surface-variant font-semibold hover:bg-surface-hover transition-all"
          >
            Annuler
          </button>
          <button 
            onclick={() => { confirmModal.onConfirm(); confirmModal.open = false; }}
            class="flex-1 py-4 bg-error text-white rounded-lg font-semibold shadow-sm shadow-error/20 active:scale-[0.98] transition-all"
          >
            Confirmer
          </button>
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

</ModulePage>
 
 