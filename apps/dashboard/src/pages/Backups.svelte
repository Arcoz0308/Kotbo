<script lang="ts">
  import { onMount } from 'svelte';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import { createAsyncActionState } from '../lib/asyncAction.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import InlineFeedback from '../lib/components/InlineFeedback.svelte';
  import ActionButton from '../lib/components/ActionButton.svelte';
  import Modal from '../lib/components/Modal.svelte';
  import Skeleton from '../lib/components/Skeleton.svelte';
  import MemberCaseModal from '../lib/components/MemberCaseModal.svelte';
  import { fetchBackups, createBackup, deleteBackup, exportBackup, importBackup, restoreBackup, fetchMemberCase } from '../lib/api';

  const createAction = createAsyncActionState();
  const deleteAction = createAsyncActionState();
  const exportAction = createAsyncActionState();
  const importAction = createAsyncActionState();
  const restoreAction = createAsyncActionState();

  let loading = $state(false);
  let backups = $state<any[]>([]);
  let showCreateModal = $state(false);
  let showDeleteModal = $state(false);
  let showImportModal = $state(false);
  let showRestoreModal = $state(false);
  let selectedBackup = $state<any>(null);
  let importFile = $state<File | null>(null);

  // Member modal state
  let memberModalOpen = $state(false);
  let memberModalUserId = $state<string | null>(null);
  let memberModalUserName = $state('');
  let memberCaseData = $state<any>(null);
  let memberCaseLoading = $state(false);
  let memberCaseError = $state('');
  let creatingBackup = $state<{
    name: string;
    description: string;
    progress: number;
    statusText: string;
  } | null>(null);

  const canManageBackups = $derived(
    !!dashboardStore.state.access?.canManageSettings
  );

  let createOptions = $state({
    name: '',
    description: '',
    includeMessages: false,
    includeMembers: true,
    includeRoles: true,
    includeChannels: true,
    includeEmojis: true,
    includeStickers: true,
  });

  onMount(async () => {
    await loadBackups();
  });

  async function loadBackups() {
    loading = true;
    try {
      const data = await fetchBackups(authStore.selectedGuildId ?? '');
      backups = data || [];
    } catch (error) {
      console.error('Erreur lors du chargement des backups:', error);
    }
    loading = false;
  }

  async function handleCreateBackup() {
    const backupName = createOptions.name || `Sauvegarde - ${new Date().toLocaleDateString('fr-FR')} ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    const backupDesc = createOptions.description;
    
    // Close modal immediately
    showCreateModal = false;
    
    // Set active creating state
    creatingBackup = {
      name: backupName,
      description: backupDesc || 'Création de la sauvegarde en cours...',
      progress: 0,
      statusText: 'Initialisation de la sauvegarde...'
    };
    
    // Start progress simulation
    let progressInterval = setInterval(() => {
      if (!creatingBackup) return;
      if (creatingBackup.progress < 30) {
        creatingBackup.progress += 5;
        creatingBackup.statusText = 'Connexion à Discord...';
      } else if (creatingBackup.progress < 70) {
        creatingBackup.progress += 3;
        creatingBackup.statusText = 'Extraction des rôles & salons...';
      } else if (creatingBackup.progress < 90) {
        creatingBackup.progress += 1.5;
        creatingBackup.statusText = 'Traitement des permissions & emojis...';
      } else if (creatingBackup.progress < 98) {
        creatingBackup.progress += 0.2;
        creatingBackup.statusText = 'Sauvegarde en base de données...';
      }
    }, 150);
    
    const optionsToCreate = { ...createOptions, name: backupName };
    
    // Reset options form
    createOptions = {
      name: '',
      description: '',
      includeMessages: false,
      includeMembers: true,
      includeRoles: true,
      includeChannels: true,
      includeEmojis: true,
      includeStickers: true,
    };
    
    await createAction.run(async () => {
      try {
        await createBackup(optionsToCreate, authStore.selectedGuildId ?? '');
        clearInterval(progressInterval);
        
        if (creatingBackup) {
          creatingBackup.progress = 100;
          creatingBackup.statusText = 'Sauvegarde complétée !';
        }
        
        // Wait 800ms at 100% for the user to see the success before reloading
        await new Promise(resolve => setTimeout(resolve, 800));
        creatingBackup = null;
        await loadBackups();
        return true;
      } catch (error) {
        clearInterval(progressInterval);
        creatingBackup = null;
        throw error;
      }
    }, {
      successMessage: 'Sauvegarde créée avec succès.'
    });
  }

  async function handleDeleteBackup() {
    if (!selectedBackup) return;
    await deleteAction.run(async () => {
      const ok = await deleteBackup(selectedBackup.id, authStore.selectedGuildId ?? '');
      if (!ok) return false;
      showDeleteModal = false;
      selectedBackup = null;
      await loadBackups();
      return true;
    }, {
      successMessage: 'Sauvegarde supprimée avec succès.'
    });
  }

  async function handleRestoreBackup() {
    if (!selectedBackup) return;
    await restoreAction.run(async () => {
      await restoreBackup(selectedBackup.id, authStore.selectedGuildId ?? '');
      showRestoreModal = false;
      selectedBackup = null;
      return true;
    }, {
      successMessage: 'Restauration lancée avec succès. Le serveur va être restauré.'
    });
  }

  async function openMemberCase(backup: any) {
    if (!backup.createdByUserId) return;
    memberModalUserId = backup.createdByUserId;
    memberModalUserName = backup.createdByUsername || 'Membre';
    memberModalOpen = true;
    memberCaseLoading = true;
    memberCaseError = '';
    memberCaseData = null;
    try {
      memberCaseData = await fetchMemberCase(backup.createdByUserId, authStore.selectedGuildId ?? '');
      if (memberCaseData?.profile) {
        memberModalUserName = memberCaseData.profile.displayName || memberCaseData.profile.username || memberModalUserName;
      }
    } catch (error) {
      memberCaseError = error instanceof Error ? error.message : 'Impossible de charger le dossier';
    } finally {
      memberCaseLoading = false;
    }
  }

  async function handleExportBackup(backup: any) {
    await exportAction.run(async () => {
      const response = await exportBackup(backup.id, authStore.selectedGuildId ?? '');
      if (!response) return false;
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${backup.name.replace(/[^a-zA-Z0-9]/g, '_')}_backup.json`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      return true;
    }, {
      successMessage: 'Sauvegarde exportée avec succès.'
    });
  }

  async function handleImportBackup() {
    if (!importFile) return;
    const backupName = createOptions.name || `Import - ${importFile.name.replace('.json', '')}`;
    
    // Close modal immediately
    showImportModal = false;
    
    // Set active creating state
    creatingBackup = {
      name: backupName,
      description: 'Importation depuis le fichier JSON...',
      progress: 0,
      statusText: 'Chargement du fichier...'
    };
    
    let progressInterval = setInterval(() => {
      if (!creatingBackup) return;
      if (creatingBackup.progress < 40) {
        creatingBackup.progress += 10;
        creatingBackup.statusText = 'Lecture du JSON...';
      } else if (creatingBackup.progress < 85) {
        creatingBackup.progress += 5;
        creatingBackup.statusText = 'Vérification de la limite de sauvegardes...';
      } else if (creatingBackup.progress < 98) {
        creatingBackup.progress += 2;
        creatingBackup.statusText = 'Création en base de données...';
      }
    }, 100);
    
    const fileToImport = importFile;
    const nameToImport = createOptions.name || undefined;
    
    // Reset inputs
    importFile = null;
    createOptions.name = '';
    
    await importAction.run(async () => {
      const reader = new FileReader();
      return new Promise<boolean>((resolve, reject) => {
        reader.onload = async (e) => {
          try {
            const fileContent = e.target?.result as string;
            if (!fileContent) {
              clearInterval(progressInterval);
              creatingBackup = null;
              resolve(false);
              return;
            }
            await importBackup(fileContent, nameToImport, authStore.selectedGuildId ?? '');
            clearInterval(progressInterval);
            
            if (creatingBackup) {
              creatingBackup.progress = 100;
              creatingBackup.statusText = 'Importation complétée !';
            }
            
            await new Promise(res => setTimeout(res, 800));
            creatingBackup = null;
            await loadBackups();
            resolve(true);
          } catch (error) {
            clearInterval(progressInterval);
            creatingBackup = null;
            reject(error);
          }
        };
        reader.onerror = () => {
          clearInterval(progressInterval);
          creatingBackup = null;
          resolve(false);
        };
        reader.readAsText(fileToImport);
      });
    }, {
      successMessage: 'Sauvegarde importée avec succès.'
    });
  }

  function formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  function formatDate(date: string): string {
    return new Date(date).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
</script>

<div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12">
  <!-- Hero Header -->
  <header class="relative overflow-hidden flex flex-col md:flex-row md:items-center gap-6 bg-surface-container-low/40 backdrop-blur-3xl p-8 rounded-4xl border border-outline-variant/30">
    <div class="absolute inset-0 pointer-events-none">
      <div class="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-primary/5 blur-3xl"></div>
      <div class="absolute -bottom-8 -left-8 w-40 h-40 rounded-full bg-secondary/5 blur-2xl"></div>
    </div>
    <div class="relative flex items-center gap-6 flex-1">
      <div class="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shadow-inner shrink-0">
        <Papicon icon="archive" size={32} />
      </div>
      <div>
        <h1 class="text-3xl font-black tracking-tight leading-tight">Sauvegardes du serveur</h1>
        <p class="text-on-surface-variant/70 font-medium mt-1">
          Gérez et restaurez les configurations, salons, rôles et membres de votre serveur Discord.
        </p>
      </div>
    </div>
    {#if canManageBackups}
      <div class="relative shrink-0">
        <ActionButton onClick={() => showCreateModal = true} variant="primary" label="Nouvelle sauvegarde" icon="plus" />
      </div>
    {/if}
  </header>

  <!-- Grid Layout -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {#if loading}
      {#each Array(3) as _}
        <div class="bg-surface-container-low/30 border border-outline-variant/10 rounded-3xl p-6 h-[320px]">
          <Skeleton height="100%" radius="1.5rem" />
        </div>
      {/each}
    {:else if backups.length === 0 && !creatingBackup}
      <div class="col-span-full bg-surface-container-low/30 border border-outline-variant/10 rounded-[2.5rem] p-12 flex flex-col items-center justify-center text-center space-y-4">
        <div class="w-16 h-16 bg-surface-container-high/40 rounded-full flex items-center justify-center text-on-surface-variant/40 border border-outline-variant/10">
          <Papicon icon="archive" size={32} />
        </div>
        <div class="space-y-1">
          <h3 class="text-xl font-black">Aucune sauvegarde</h3>
          <p class="text-sm text-on-surface-variant/70 font-medium">Créez votre première sauvegarde pour sécuriser votre serveur.</p>
        </div>
        {#if canManageBackups}
          <ActionButton onClick={() => showCreateModal = true} variant="primary" label="Créer une sauvegarde" icon="plus" />
        {/if}
      </div>
    {:else}
      {#if creatingBackup}
        <div class="relative overflow-hidden bg-surface-container-low/35 border-2 border-primary/30 rounded-4xl p-6 flex flex-col justify-between transition-all duration-300 shadow-xl shadow-primary/5">
          <div>
            <div class="flex items-center gap-4 mb-4 relative">
              <div class="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 overflow-hidden flex items-center justify-center text-primary animate-bounce">
                <Papicon icon="archive" size={24} />
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="text-base font-black truncate leading-snug text-primary">{creatingBackup.name}</h3>
                <p class="text-xs text-on-surface-variant/60 font-semibold mt-0.5">Sauvegarde en cours...</p>
              </div>
              <span class="px-2.5 py-1 bg-primary/10 border border-primary/20 text-primary text-[10px] font-black rounded-lg uppercase tracking-wider shrink-0">
                {Math.round(creatingBackup.progress)}%
              </span>
            </div>

            {#if creatingBackup.description}
              <p class="text-xs text-on-surface-variant/80 font-medium leading-relaxed mb-4 line-clamp-2">{creatingBackup.description}</p>
            {/if}

            <div class="space-y-2.5 bg-surface-container-high/10 border border-outline-variant/5 p-4 rounded-2xl">
              <div class="flex justify-between text-xs font-bold text-on-surface-variant">
                <span class="truncate pr-2">{creatingBackup.statusText}</span>
                <span class="shrink-0">{Math.round(creatingBackup.progress)}%</span>
              </div>
              
              <!-- Progress Bar -->
              <div class="w-full bg-surface-container-high/40 rounded-full h-2 overflow-hidden border border-outline-variant/10">
                <div 
                  class="bg-linear-to-r from-primary to-secondary h-full rounded-full transition-all duration-150" 
                  style="width: {creatingBackup.progress}%"
                ></div>
              </div>
            </div>
          </div>

          <div class="flex items-center justify-between pt-3 border-t border-outline-variant/10 mt-6">
            <p class="text-[10px] text-on-surface-variant/50 font-bold">
              Traitement en tâche de fond...
            </p>
            <div class="flex items-center justify-center shrink-0">
              <div class="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
            </div>
          </div>
        </div>
      {/if}

      {#each backups as backup}
        <div class="relative overflow-hidden bg-surface-container-low/30 border border-outline-variant/10 hover:border-primary/30 rounded-4xl p-6 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5">
          <div>
            <div class="flex items-center gap-4 mb-4 relative">
              <div class="w-12 h-12 rounded-xl bg-surface-container-high/50 border border-outline-variant/10 overflow-hidden flex items-center justify-center text-on-surface-variant">
                {#if backup.serverIcon}
                  <img src={backup.serverIcon} alt={backup.serverName} class="w-full h-full object-cover" />
                {:else}
                  <Papicon icon="server" size={24} />
                {/if}
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="text-base font-black truncate leading-snug">{backup.name}</h3>
                <p class="text-xs text-on-surface-variant/60 font-semibold mt-0.5">{formatDate(backup.createdAt)}</p>
              </div>
              {#if backup.isPreset}
                <span class="px-2.5 py-1 bg-primary/10 border border-primary/20 text-primary text-[10px] font-black rounded-lg uppercase tracking-wider shrink-0">Preset</span>
              {/if}
            </div>

            {#if backup.description}
              <p class="text-xs text-on-surface-variant/80 font-medium leading-relaxed mb-4 line-clamp-2">{backup.description}</p>
            {/if}

            <!-- Statistics Grid -->
            <div class="grid grid-cols-2 gap-2.5 mb-4 bg-surface-container-high/15 border border-outline-variant/5 p-4 rounded-2xl">
              <div class="flex items-center gap-2 text-xs font-semibold text-on-surface-variant">
                <div class="text-primary/70 shrink-0"><Papicon icon="role" size={16} /></div>
                <span class="truncate">{backup.rolesCount} rôles</span>
              </div>
              <div class="flex items-center gap-2 text-xs font-semibold text-on-surface-variant">
                <div class="text-primary/70 shrink-0"><Papicon icon="channel" size={16} /></div>
                <span class="truncate">{backup.channelsCount} salons</span>
              </div>
              <div class="flex items-center gap-2 text-xs font-semibold text-on-surface-variant">
                <div class="text-primary/70 shrink-0"><Papicon icon="user" size={16} /></div>
                <span class="truncate">{backup.membersCount} membres</span>
              </div>
              <div class="flex items-center gap-2 text-xs font-semibold text-on-surface-variant">
                <div class="text-primary/70 shrink-0"><Papicon icon="emoji" size={16} /></div>
                <span class="truncate">{backup.emojisCount} emojis</span>
              </div>
              <div class="flex items-center gap-2 text-xs font-semibold text-on-surface-variant col-span-2 border-t border-outline-variant/5 pt-2 mt-1">
                <div class="text-primary/70 shrink-0"><Papicon icon="sticker" size={16} /></div>
                <span class="truncate">{backup.stickersCount} stickers ({formatSize(backup.sizeBytes)})</span>
              </div>
            </div>

            <!-- Enabled options list -->
            <div class="flex flex-wrap gap-1.5 mb-4">
              {#if backup.includeMessages}
                <span class="text-[9px] font-bold bg-surface-container-high/40 border border-outline-variant/10 text-on-surface-variant px-2 py-0.5 rounded-lg">Messages</span>
              {/if}
              {#if backup.includeMembers}
                <span class="text-[9px] font-bold bg-surface-container-high/40 border border-outline-variant/10 text-on-surface-variant px-2 py-0.5 rounded-lg">Membres</span>
              {/if}
              {#if backup.includeRoles}
                <span class="text-[9px] font-bold bg-surface-container-high/40 border border-outline-variant/10 text-on-surface-variant px-2 py-0.5 rounded-lg">Rôles</span>
              {/if}
              {#if backup.includeChannels}
                <span class="text-[9px] font-bold bg-surface-container-high/40 border border-outline-variant/10 text-on-surface-variant px-2 py-0.5 rounded-lg">Salons</span>
              {/if}
              {#if backup.includeEmojis}
                <span class="text-[9px] font-bold bg-surface-container-high/40 border border-outline-variant/10 text-on-surface-variant px-2 py-0.5 rounded-lg">Emojis</span>
              {/if}
              {#if backup.includeStickers}
                <span class="text-[9px] font-bold bg-surface-container-high/40 border border-outline-variant/10 text-on-surface-variant px-2 py-0.5 rounded-lg">Stickers</span>
              {/if}
            </div>
          </div>

          <div class="flex items-center justify-between pt-3 border-t border-outline-variant/10 mt-2">
            {#if backup.createdByUserId}
              <button
                onclick={() => openMemberCase(backup)}
                class="text-[10px] text-on-surface-variant/50 font-bold truncate max-w-[50%] hover:text-primary transition-colors text-left cursor-pointer"
                title="Voir le dossier de {backup.createdByUsername}"
              >
                Par {backup.createdByUsername}#{backup.createdByTag || '0000'}
              </button>
            {:else}
              <p class="text-[10px] text-on-surface-variant/50 font-bold truncate max-w-[50%]">
                Par {backup.createdByUsername}#{backup.createdByTag || '0000'}
              </p>
            {/if}
            <div class="flex gap-2">
              <ActionButton onClick={() => handleExportBackup(backup)} variant="muted" size="sm" label="Exporter" icon="download" />
              {#if canManageBackups}
                <ActionButton onClick={() => { selectedBackup = backup; showRestoreModal = true; }} variant="muted" size="sm" label="Restaurer" icon="rotate-ccw" />
                <ActionButton onClick={() => { selectedBackup = backup; showDeleteModal = true; }} variant="danger" size="sm" label="Supprimer" icon="trash" />
              {/if}
            </div>
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <!-- Import Section -->
  {#if canManageBackups}
    <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-[2.5rem] flex flex-col md:flex-row md:items-center justify-between gap-6">
      <div class="space-y-1">
        <h3 class="text-xl font-black">Importer une sauvegarde</h3>
        <p class="text-sm text-on-surface-variant/70 font-medium">Vous avez un fichier de sauvegarde au format JSON ? Importez-le directement sur le serveur.</p>
      </div>
      <ActionButton onClick={() => showImportModal = true} variant="muted" label="Importer un fichier" icon="upload" />
    </section>
  {/if}
</div>

<!-- Modal de création de backup -->
<Modal bind:open={showCreateModal} title="Créer une sauvegarde">
  <div class="space-y-6">
    <div class="space-y-2">
      <span class="block text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Nom de la sauvegarde</span>
      <input 
        type="text" 
        bind:value={createOptions.name} 
        placeholder="Laisser vide pour le nom par défaut" 
        class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all text-on-surface focus:outline-none"
      />
    </div>
    
    <div class="space-y-2">
      <span class="block text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Description</span>
      <input 
        type="text" 
        bind:value={createOptions.description} 
        placeholder="Description optionnelle" 
        class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all text-on-surface focus:outline-none"
      />
    </div>

    <div class="space-y-3">
      <span class="block text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Éléments à inclure</span>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 bg-surface-container-high/20 border border-outline-variant/5 p-4 rounded-2xl">
        <label class="flex items-center gap-3 cursor-pointer group">
          <input 
            type="checkbox" 
            bind:checked={createOptions.includeMessages} 
            class="w-5 h-5 rounded-lg border-2 border-outline-variant/20 text-primary focus:ring-primary/40 transition-all checked:bg-primary checked:border-primary cursor-pointer accent-primary" 
          />
          <span class="text-xs font-semibold text-on-surface-variant group-hover:text-on-surface transition-colors">Messages (désactivé par défaut)</span>
        </label>
        <label class="flex items-center gap-3 cursor-pointer group">
          <input 
            type="checkbox" 
            bind:checked={createOptions.includeMembers} 
            class="w-5 h-5 rounded-lg border-2 border-outline-variant/20 text-primary focus:ring-primary/40 transition-all checked:bg-primary checked:border-primary cursor-pointer accent-primary" 
          />
          <span class="text-xs font-semibold text-on-surface-variant group-hover:text-on-surface transition-colors">Membres</span>
        </label>
        <label class="flex items-center gap-3 cursor-pointer group">
          <input 
            type="checkbox" 
            bind:checked={createOptions.includeRoles} 
            class="w-5 h-5 rounded-lg border-2 border-outline-variant/20 text-primary focus:ring-primary/40 transition-all checked:bg-primary checked:border-primary cursor-pointer accent-primary" 
          />
          <span class="text-xs font-semibold text-on-surface-variant group-hover:text-on-surface transition-colors">Rôles</span>
        </label>
        <label class="flex items-center gap-3 cursor-pointer group">
          <input 
            type="checkbox" 
            bind:checked={createOptions.includeChannels} 
            class="w-5 h-5 rounded-lg border-2 border-outline-variant/20 text-primary focus:ring-primary/40 transition-all checked:bg-primary checked:border-primary cursor-pointer accent-primary" 
          />
          <span class="text-xs font-semibold text-on-surface-variant group-hover:text-on-surface transition-colors">Salons</span>
        </label>
        <label class="flex items-center gap-3 cursor-pointer group">
          <input 
            type="checkbox" 
            bind:checked={createOptions.includeEmojis} 
            class="w-5 h-5 rounded-lg border-2 border-outline-variant/20 text-primary focus:ring-primary/40 transition-all checked:bg-primary checked:border-primary cursor-pointer accent-primary" 
          />
          <span class="text-xs font-semibold text-on-surface-variant group-hover:text-on-surface transition-colors">Emojis</span>
        </label>
        <label class="flex items-center gap-3 cursor-pointer group">
          <input 
            type="checkbox" 
            bind:checked={createOptions.includeStickers} 
            class="w-5 h-5 rounded-lg border-2 border-outline-variant/20 text-primary focus:ring-primary/40 transition-all checked:bg-primary checked:border-primary cursor-pointer accent-primary" 
          />
          <span class="text-xs font-semibold text-on-surface-variant group-hover:text-on-surface transition-colors">Stickers</span>
        </label>
      </div>
    </div>

    <div class="flex justify-end gap-3 pt-2">
      <ActionButton onClick={() => showCreateModal = false} variant="muted" label="Annuler" />
      <ActionButton onClick={handleCreateBackup} variant="primary" label="Créer la sauvegarde" />
    </div>
    <InlineFeedback state={createAction} />
  </div>
</Modal>

<!-- Modal de suppression -->
<Modal bind:open={showDeleteModal} title="Supprimer la sauvegarde">
  <div class="space-y-4">
    <p class="text-sm font-medium">Êtes-vous sûr de vouloir supprimer la sauvegarde <strong class="text-on-surface">{selectedBackup?.name}</strong> ?</p>
    <p class="text-xs text-error font-bold bg-error/10 border border-error/20 px-4 py-3 rounded-2xl flex items-center gap-2">
      <Papicon icon="AlertTriangle" size={16} />
      Cette action est irréversible.
    </p>
    <div class="flex justify-end gap-3 pt-2">
      <ActionButton onClick={() => showDeleteModal = false} variant="muted" label="Annuler" />
      <ActionButton onClick={handleDeleteBackup} variant="danger" label="Supprimer" />
    </div>
    <InlineFeedback state={deleteAction} />
  </div>
</Modal>

<!-- Modal d'import -->
<Modal bind:open={showImportModal} title="Importer une sauvegarde">
  <div class="space-y-6">
    <div class="space-y-2">
      <span class="block text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Fichier JSON</span>
      <input 
        type="file" 
        accept=".json" 
        onchange={(e) => importFile = (e.currentTarget as HTMLInputElement).files?.[0] || null} 
        class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all text-on-surface focus:outline-none file:mr-4 file:py-1.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-primary file:text-on-primary hover:file:bg-primary/90 file:cursor-pointer file:transition-all"
      />
    </div>
    
    <div class="space-y-2">
      <span class="block text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Nom de la sauvegarde (optionnel)</span>
      <input 
        type="text" 
        bind:value={createOptions.name} 
        placeholder="Laisser vide pour le nom par défaut" 
        class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all text-on-surface focus:outline-none"
      />
    </div>

    <div class="flex justify-end gap-3 pt-2">
      <ActionButton onClick={() => showImportModal = false} variant="muted" label="Annuler" />
      <ActionButton onClick={handleImportBackup} variant="primary" label="Importer" disabled={!importFile} />
    </div>
    <InlineFeedback state={importAction} />
  </div>
</Modal>

<!-- Modal de restauration -->
<Modal bind:open={showRestoreModal} title="Restaurer la sauvegarde">
  <div class="space-y-4">
    <p class="text-sm font-medium">Voulez-vous restaurer la sauvegarde <strong class="text-on-surface">{selectedBackup?.name}</strong> sur ce serveur ?</p>
    <p class="text-xs text-amber-500 font-bold bg-amber-500/10 border border-amber-500/20 px-4 py-3 rounded-2xl flex items-center gap-2">
      <Papicon icon="AlertTriangle" size={16} />
      Cette action écrasera la configuration actuelle du serveur avec les données de la sauvegarde. Le bot va appliquer les rôles, salons et permissions sauvegardés.
    </p>
    <div class="flex justify-end gap-3 pt-2">
      <ActionButton onClick={() => showRestoreModal = false} variant="muted" label="Annuler" />
      <ActionButton onClick={handleRestoreBackup} variant="primary" label="Restaurer" icon="rotate-ccw" />
    </div>
    <InlineFeedback state={restoreAction} />
  </div>
</Modal>

<!-- Modal dossier membre (auteur du backup) -->
<MemberCaseModal
  open={memberModalOpen}
  userId={memberModalUserId}
  userName={memberModalUserName}
  caseData={memberCaseData}
  loading={memberCaseLoading}
  error={memberCaseError}
  onClose={() => {
    memberModalOpen = false;
    memberModalUserId = null;
  }}
/>
