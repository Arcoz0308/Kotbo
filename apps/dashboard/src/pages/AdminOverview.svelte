<script lang="ts">
  import { onMount } from 'svelte';
  import { 
    fetchAdminStats, 
    fetchAdminGuilds, 
    fetchAdminShards,
    fetchAdminGuildInvite, 
    leaveAdminGuild, 
    fetchGlobalAdmins, 
    addGlobalAdmin, 
    removeGlobalAdmin, 
    fetchGlobalBlacklist, 
    addGlobalBlacklist, 
    removeGlobalBlacklist, 
    fetchMaintenanceConfig, 
    updateMaintenanceConfig, 
    fetchBotErrors, 
    clearBotErrors, 
    sendGlobalBroadcast,
    fetchActivationCodes,
    createActivationCode,
    deleteActivationCode,
    deactivateAdminGuild,
    activateAdminGuildAuto,
    fetchGlobalBannedWords,
    saveGlobalBannedWords,
    cleanupGlobalBannedWords,
    updateGlobalBannedWord,
    deleteGlobalBannedWord,
    restartAdminShard,
    restartAllAdminShards,
    reconfigureAdminShards,
  } from '../lib/api';
  import Papicon from '../lib/components/Papicon.svelte';
  import MetricCard from '../lib/components/MetricCard.svelte';
  import Skeleton from '../lib/components/Skeleton.svelte';
  import { toast } from '../lib/stores/toast.svelte';

  type BannedWordEntry = {
    id: string;
    word: string;
    category: string;
    enabled: boolean;
    guildId: string | null;
  };

  type ImportDraft = {
    id: string;
    word: string;
    category: string;
    enabled: boolean;
  };

  type ShardSnapshot = {
    shardId: number;
    status: 'online' | 'offline' | 'starting' | 'restarting';
    guildCount: number;
    memberCount: number;
    ping: number;
    uptime: number;
    readyAt: string | null;
    memoryUsage: {
      rss: number;
      heapUsed: number;
      heapTotal: number;
    };
  };

  type ShardingConfig = {
    mode: 'auto' | 'fixed';
    shardCount: number | null;
  };

  const BANNED_WORD_CATEGORIES = {
    custom: 'Personnalisé',
    racism: 'Racisme',
    threat: 'Menace',
    sexual: 'Sexuel',
    lgbtphobia: 'LGBTphobie',
    hate: 'Haine',
    insult: 'Insulte',
  } as const;

  const BANNED_WORD_CATEGORY_KEYS = Object.keys(BANNED_WORD_CATEGORIES) as Array<keyof typeof BANNED_WORD_CATEGORIES>;

  let stats = $state(null);
  let guilds = $state([]);
  let globalAdmins = $state([]);
  let globalBlacklist = $state([]);
  let globalBannedWords = $state<BannedWordEntry[]>([]);
  let globalBannedWordsLoading = $state(false);
  let globalBannedWordsLoaded = $state(false);
  let globalBannedWordsError = $state('');
  let globalBannedWordsPage = $state(1);
  let maintenanceMode = $state(false);
  let botErrors = $state([]);
  let activationCodes = $state([]);
  
  let newAdminId = $state('');
  let newBlacklistId = $state('');
  let newBlacklistReason = $state('');
  let broadcastMessage = $state('');
  let globalImportText = $state('');
  let globalImportFileName = $state('');
  let globalImportDrafts = $state<ImportDraft[]>([]);
  let globalImportError = $state('');
  let globalImportLoading = $state(false);
  let globalWordSavingId = $state('');
  const globalWordSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let globalCleanupLoading = $state(false);
  const GLOBAL_BANNED_WORDS_PAGE_SIZE = 12;
  let shardState = $state<{ config: ShardingConfig; shards: ShardSnapshot[]; onlineShardCount: number } | null>(null);
  let shardLoading = $state(true);
  let shardActionLoading = $state('');
  let shardMode = $state<'auto' | 'fixed'>('auto');
  let shardCount = $state('');

  const shardRows = $derived(shardState?.shards ?? []);
  const shardConfiguredCount = $derived(
    shardState?.config.mode === 'fixed'
      ? (shardState?.config.shardCount ?? shardRows.length)
      : shardRows.length,
  );
  const shardAveragePing = $derived(
    shardRows.length > 0
      ? Math.round(shardRows.reduce((sum, shard) => sum + shard.ping, 0) / shardRows.length)
      : 0,
  );
  const maxShardGuildCount = $derived(
    shardRows.length > 0 ? Math.max(...shardRows.map((shard) => shard.guildCount)) : 0,
  );

  const globalBannedWordsTotalPages = $derived(
    Math.max(1, Math.ceil(globalBannedWords.length / GLOBAL_BANNED_WORDS_PAGE_SIZE))
  );

  const paginatedGlobalBannedWords = $derived(
    globalBannedWords.slice(
      (globalBannedWordsPage - 1) * GLOBAL_BANNED_WORDS_PAGE_SIZE,
      globalBannedWordsPage * GLOBAL_BANNED_WORDS_PAGE_SIZE
    )
  );
  
  let activeTab = $state<'overview' | 'servers' | 'shards' | 'security' | 'content' | 'config' | 'activation'>('overview');
  
  let loading = $state(true);
  let error = $state(null);

  async function loadActivationCodes() {
    try {
      activationCodes = await fetchActivationCodes();
    } catch (err: any) {
      console.error('Erreur chargement codes activation:', err);
    }
  }

  async function loadGlobalBannedWords() {
    globalBannedWordsLoading = true;
    globalBannedWordsError = '';
    try {
      const data = await fetchGlobalBannedWords();
      globalBannedWords = data.words ?? [];
      globalBannedWordsLoaded = true;
      globalBannedWordsPage = 1;
    } catch (err: any) {
      globalBannedWordsError = err?.message || 'Impossible de charger les mots globaux.';
    } finally {
      globalBannedWordsLoading = false;
    }
  }

  $effect(() => {
    if (activeTab === 'content' && !globalBannedWordsLoaded && !globalBannedWordsLoading) {
      void loadGlobalBannedWords();
    }
  });

  $effect(() => {
    const maxPage = globalBannedWordsTotalPages;
    if (globalBannedWordsPage > maxPage) globalBannedWordsPage = maxPage;
    if (globalBannedWordsPage < 1) globalBannedWordsPage = 1;
  });

  onMount(async () => {
    try {
      const [statsData, guildsData, shardsData, adminsData, blacklistData, configData, errorsData] = await Promise.all([
        fetchAdminStats(),
        fetchAdminGuilds(),
        fetchAdminShards(),
        fetchGlobalAdmins(),
        fetchGlobalBlacklist(),
        fetchMaintenanceConfig(),
        fetchBotErrors(),
        loadActivationCodes()
      ]);
      stats = statsData;
      guilds = guildsData.guilds;
      shardState = {
        config: shardsData.config ?? { mode: 'auto', shardCount: null },
        shards: shardsData.shards ?? [],
        onlineShardCount: shardsData.onlineShardCount ?? 0,
      };
      shardMode = shardState.config.mode;
      shardCount = shardState.config.shardCount ? String(shardState.config.shardCount) : '';
      globalAdmins = adminsData.admins;
      globalBlacklist = blacklistData.blacklist;
      maintenanceMode = configData.maintenance;
      botErrors = errorsData.errors;
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
      shardLoading = false;
    }
  });

  function formatUptime(seconds) {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${d}j ${h}h ${m}m`;
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async function handleGetInvite(guildId) {
    try {
      const data = await fetchAdminGuildInvite(guildId);
      if (data.url) {
        window.open(data.url, '_blank');
      }
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleLeaveGuild(guildId, guildName) {
    if (!confirm(`Voulez-vous vraiment faire quitter le bot du serveur ${guildName} ?`)) return;
    try {
      await leaveAdminGuild(guildId);
      guilds = guilds.filter(g => g.id !== guildId);
      stats.guildCount--;
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleAddAdmin(e) {
    e.preventDefault();
    if (!newAdminId.trim()) return;
    try {
      await addGlobalAdmin(newAdminId.trim());
      newAdminId = '';
      const data = await fetchGlobalAdmins();
      globalAdmins = data.admins;
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleRemoveAdmin(userId, username) {
    if (!confirm(`Retirer l'accès global à ${username} ?`)) return;
    try {
      await removeGlobalAdmin(userId);
      globalAdmins = globalAdmins.filter(a => a.userId !== userId);
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleToggleMaintenance() {
    try {
      await updateMaintenanceConfig(!maintenanceMode);
      maintenanceMode = !maintenanceMode;
    } catch (err) { alert(err.message); }
  }

  async function handleAddBlacklist(e) {
    e.preventDefault();
    if (!newBlacklistId.trim()) return;
    try {
      await addGlobalBlacklist(newBlacklistId.trim(), newBlacklistReason.trim());
      newBlacklistId = '';
      newBlacklistReason = '';
      const data = await fetchGlobalBlacklist();
      globalBlacklist = data.blacklist;
    } catch (err) { alert(err.message); }
  }

  async function handleRemoveBlacklist(userId) {
    if (!confirm('Retirer cet utilisateur de la blacklist globale ?')) return;
    try {
      await removeGlobalBlacklist(userId);
      globalBlacklist = globalBlacklist.filter(b => b.userId !== userId);
    } catch (err) { alert(err.message); }
  }

  function normalizeGlobalWordValue(value: string) {
    return value.trim().toLowerCase().slice(0, 100);
  }

  function parseGlobalWordRows(text: string): ImportDraft[] {
    const source = text.trim();
    if (!source) return [];

    const drafts: ImportDraft[] = [];

    const addDraft = (word: string, category = 'custom', enabled = true) => {
      const normalizedWord = normalizeGlobalWordValue(word);
      if (!normalizedWord) return;

      const safeCategory = BANNED_WORD_CATEGORY_KEYS.includes(category as keyof typeof BANNED_WORD_CATEGORIES)
        ? category
        : 'custom';

      drafts.push({
        id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        word: normalizedWord,
        category: safeCategory,
        enabled,
      });
    };

    const parsedJson = (() => {
      try {
        return JSON.parse(source);
      } catch {
        return null;
      }
    })();

    if (parsedJson) {
      const rows = Array.isArray(parsedJson)
        ? parsedJson
        : Array.isArray(parsedJson?.words)
          ? parsedJson.words
          : [];

      for (const row of rows) {
        if (typeof row === 'string') {
          addDraft(row);
          continue;
        }

        if (row && typeof row === 'object') {
          addDraft(
            String((row as any).word ?? ''),
            String((row as any).category ?? 'custom'),
            (row as any).enabled !== false,
          );
        }
      }

      return drafts;
    }

    const rows = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

    for (const row of rows) {
      const line = row.replace(/^\uFEFF/, '');
      const parts = line.split(/[;,\t]/).map((part) => part.trim()).filter(Boolean);
      if (parts.length === 0) continue;
      if (/^word$/i.test(parts[0]) && parts.length > 1) continue;

      const enabledToken = parts[2];
      drafts.push({
        id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        word: normalizeGlobalWordValue(parts[0]),
        category: BANNED_WORD_CATEGORY_KEYS.includes((parts[1] ?? 'custom') as keyof typeof BANNED_WORD_CATEGORIES)
          ? (parts[1] ?? 'custom')
          : 'custom',
        enabled: enabledToken ? !/^(false|0|off|no|non)$/i.test(enabledToken) : true,
      });
    }

    return drafts.filter((draft) => draft.word.length > 0);
  }

  function ingestGlobalImport(text: string, fileName = '') {
    globalImportText = text;
    globalImportFileName = fileName;
    globalImportDrafts = parseGlobalWordRows(text);
    globalImportError = globalImportDrafts.length === 0 ? 'Aucun mot valide détecté.' : '';
  }

  async function handleImportFileChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    ingestGlobalImport(await file.text(), file.name);
    input.value = '';
  }

  function handleAnalyzeGlobalImport() {
    ingestGlobalImport(globalImportText, globalImportFileName);
  }

  function updateDraft(id: string, patch: Partial<ImportDraft>) {
    globalImportDrafts = globalImportDrafts.map((draft) => draft.id === id ? { ...draft, ...patch } : draft);
    globalImportError = globalImportDrafts.length > 0 ? '' : globalImportError;
  }

  function removeDraft(id: string) {
    globalImportDrafts = globalImportDrafts.filter((draft) => draft.id !== id);
    if (globalImportDrafts.length === 0) {
      globalImportError = 'Aucun mot valide détecté.';
    }
  }

  function resetGlobalImport() {
    globalImportText = '';
    globalImportFileName = '';
    globalImportDrafts = [];
    globalImportError = '';
  }

  async function handleSaveGlobalImport() {
    const payload = globalImportDrafts
      .map((draft) => ({ word: normalizeGlobalWordValue(draft.word), category: draft.category, enabled: draft.enabled }))
      .filter((draft) => draft.word.length > 0);

    if (payload.length === 0) {
      globalImportError = 'Ajoutez au moins un mot valide avant d\'enregistrer.';
      return;
    }

    globalImportLoading = true;
    try {
      const result = await saveGlobalBannedWords(payload);
      globalBannedWords = result.words ?? [];
      globalBannedWordsLoaded = true;
      globalBannedWordsPage = 1;
      toast.success(`Mots globaux mis à jour (${result.createdCount ?? 0} créés, ${result.updatedCount ?? 0} mis à jour).`);
      resetGlobalImport();
    } catch (err) {
      alert(err.message);
    } finally {
      globalImportLoading = false;
    }
  }

  function updateGlobalWordField(id: string, patch: Partial<BannedWordEntry>) {
    globalBannedWords = globalBannedWords.map((word) => word.id === id ? { ...word, ...patch } : word);
    const previousTimer = globalWordSaveTimers.get(id);
    if (previousTimer) clearTimeout(previousTimer);

    const timer = setTimeout(() => {
      void handleSaveGlobalWord(id);
    }, 650);

    globalWordSaveTimers.set(id, timer);
  }

  async function handleSaveGlobalWord(id: string) {
    const entry = globalBannedWords.find((word) => word.id === id);
    if (!entry) return;

    const nextWord = normalizeGlobalWordValue(entry.word);
    if (!nextWord) {
      globalImportError = 'Le mot ne peut pas être vide.';
      return;
    }

    const previousTimer = globalWordSaveTimers.get(id);
    if (previousTimer) {
      clearTimeout(previousTimer);
      globalWordSaveTimers.delete(id);
    }

    globalWordSavingId = id;
    try {
      const result = await updateGlobalBannedWord(id, {
        word: nextWord,
        category: entry.category,
        enabled: entry.enabled,
      });

      if (result?.word) {
        globalBannedWords = globalBannedWords.map((word) => word.id === id ? result.word : word);
      } else {
        const refreshed = await fetchGlobalBannedWords();
        globalBannedWords = refreshed.words ?? [];
      }

      globalBannedWordsLoaded = true;

      toast.success('Mot global mis à jour.');
    } catch (err) {
      globalImportError = err.message;
      const refreshed = await fetchGlobalBannedWords().catch(() => null);
      if (refreshed?.words) {
        globalBannedWords = refreshed.words;
        globalBannedWordsLoaded = true;
      }
    } finally {
      globalWordSavingId = '';
    }
  }

  async function handleDeleteGlobalWord(entry: BannedWordEntry) {
    if (!confirm(`Supprimer le mot global "${entry.word}" ?`)) return;
    try {
      const timer = globalWordSaveTimers.get(entry.id);
      if (timer) clearTimeout(timer);
      globalWordSaveTimers.delete(entry.id);
      await deleteGlobalBannedWord(entry.id);
      globalBannedWords = globalBannedWords.filter((word) => word.id !== entry.id);
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleCleanupGlobalWords() {
    if (!confirm('Nettoyer automatiquement tous les mots globaux et supprimer les doublons ?')) return;

    globalCleanupLoading = true;
    globalImportError = '';
    try {
      const result = await cleanupGlobalBannedWords();
      globalBannedWords = result.words ?? [];
      globalBannedWordsLoaded = true;
      globalBannedWordsPage = 1;
      toast.success(`Nettoyage terminé: ${result.cleanedCount ?? 0} mot(s) conservé(s), ${result.duplicateCount ?? 0} doublon(s) supprimé(s).`);
    } catch (err) {
      alert(err.message);
    } finally {
      globalCleanupLoading = false;
    }
  }

  async function handleBroadcast(e) {
    e.preventDefault();
    if (!broadcastMessage.trim()) return;
    if (!confirm('Êtes-vous sûr de vouloir envoyer ce message sur TOUS les serveurs ?')) return;
    try {
      const res = await sendGlobalBroadcast(broadcastMessage.trim());
      broadcastMessage = '';
      alert(`Broadcast envoyé !\nSuccès : ${res.successCount} serveurs\nÉchecs : ${res.failCount} serveurs`);
    } catch (err) { alert(err.message); }
  }

  async function handleClearErrors() {
    if (!confirm('Purger tous les logs d\'erreurs ?')) return;
    try {
      await clearBotErrors();
      botErrors = [];
    } catch (err) { alert(err.message); }
  }

  async function handleGenerateCode() {
    try {
      const newCode = await createActivationCode();
      toast.success(`Nouveau code généré : ${newCode.code}`);
      await loadActivationCodes();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleDeleteCode(codeId: string, code: string, usedBy: string | null) {
    const warning = usedBy 
      ? `ATTENTION: Ce code est utilisé par le serveur "${usedBy}". Supprimer ce code désactivera immédiatement ce serveur ! Continuer ?`
      : `Voulez-vous vraiment supprimer le code d'activation ${code} ?`;
    if (!confirm(warning)) return;
    try {
      await deleteActivationCode(codeId);
      toast.success("Code d'activation supprimé.");
      await loadActivationCodes();
      
      // Update global guilds and stats if deactivated
      if (usedBy) {
        const statsData = await fetchAdminStats();
        stats = statsData;
        const guildsData = await fetchAdminGuilds();
        guilds = guildsData.guilds;
      }
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleActivateGuildAuto(guildId: string, guildName: string) {
    if (!confirm(`Voulez-vous vraiment activer automatiquement le serveur "${guildName}" avec un nouveau code généré ?`)) return;
    try {
      const res = await activateAdminGuildAuto(guildId);
      toast.success(`Serveur activé ! Code généré : ${res.code}`);
      
      const guildsData = await fetchAdminGuilds();
      guilds = guildsData.guilds;
      await loadActivationCodes();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleDeactivateGuild(guildId: string, guildName: string) {
    if (!confirm(`Voulez-vous vraiment désactiver le serveur "${guildName}" ? Ses fonctionnalités et son dashboard seront immédiatement verrouillés.`)) return;
    try {
      await deactivateAdminGuild(guildId);
      toast.success("Serveur désactivé avec succès.");
      
      const guildsData = await fetchAdminGuilds();
      guilds = guildsData.guilds;
      await loadActivationCodes();
    } catch (err: any) {
      alert(err.message);
    }
  }

  function formatShardUptime(seconds: number) {
    if (!seconds || seconds <= 0) return '0m';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}j ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  function shardStatusLabel(status: ShardSnapshot['status']) {
    if (status === 'online') return 'En ligne';
    if (status === 'starting') return 'Démarrage';
    if (status === 'restarting') return 'Redémarrage';
    return 'Hors ligne';
  }

  function shardStatusTone(status: ShardSnapshot['status']) {
    if (status === 'online') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    if (status === 'starting') return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    if (status === 'restarting') return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    return 'bg-red-500/10 text-red-400 border-red-500/20';
  }

  async function refreshShards() {
    try {
      shardLoading = true;
      const data = await fetchAdminShards();
      shardState = {
        config: data.config ?? { mode: 'auto', shardCount: null },
        shards: data.shards ?? [],
        onlineShardCount: data.onlineShardCount ?? 0,
      };
      shardMode = shardState.config.mode;
      shardCount = shardState.config.shardCount ? String(shardState.config.shardCount) : '';
    } catch (err: any) {
      toast.error(err.message || 'Impossible de rafraîchir les shards.');
    } finally {
      shardLoading = false;
    }
  }

  async function handleRestartShard(shardId: number) {
    if (!confirm(`Redémarrer le shard ${shardId} ?`)) return;
    try {
      shardActionLoading = `restart:${shardId}`;
      await restartAdminShard(shardId);
      toast.success(`Shard ${shardId} redémarré.`);
      await refreshShards();
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors du redémarrage du shard.');
    } finally {
      shardActionLoading = '';
    }
  }

  async function handleRestartAllShards() {
    if (!confirm('Redémarrer tous les shards ?')) return;
    try {
      shardActionLoading = 'restart-all';
      await restartAllAdminShards();
      toast.success('Redémarrage global demandé.');
      await refreshShards();
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors du redémarrage global.');
    } finally {
      shardActionLoading = '';
    }
  }

  async function handleReconfigureShards() {
    try {
      const payload = {
        mode: shardMode,
        shardCount: shardMode === 'fixed' ? Number(shardCount) : null,
      };

      if (payload.mode === 'fixed' && (!Number.isInteger(payload.shardCount) || (payload.shardCount ?? 0) < 1)) {
        toast.error('Le nombre de shards doit être supérieur à zéro.');
        return;
      }

      shardActionLoading = 'reconfigure';
      await reconfigureAdminShards(payload);

      toast.success('Configuration de sharding enregistrée. Le conteneur va redémarrer.');
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de la reconfiguration des shards.');
    } finally {
      shardActionLoading = '';
    }
  }

  function goToGlobalBannedWordsPage(nextPage: number) {
    globalBannedWordsPage = Math.min(globalBannedWordsTotalPages, Math.max(1, nextPage));
  }
</script>

<div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12">
  
  <header class="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-surface-container-low/40 p-8 rounded-[2.5rem] border border-outline-variant/10 backdrop-blur-xl shadow-2xl shadow-primary/5">
    <div class="flex items-center gap-6">
      <div class="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center border border-primary/20 shadow-inner">
        <Papicon icon="Lock" size={40} class="text-primary" />
      </div>
      <div>
        <h1 class="text-4xl font-black font-headline tracking-tighter text-on-surface">Console Admin</h1>
        <p class="text-on-surface-variant/60 font-medium mt-1 uppercase tracking-widest text-[10px]">Gestion globale du bot Kotbo</p>
      </div>
    </div>
  </header>

  {#if loading}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <Skeleton height="120px" class="rounded-[2.25rem]" />
      <Skeleton height="120px" class="rounded-[2.25rem]" />
      <Skeleton height="120px" class="rounded-[2.25rem]" />
      <Skeleton height="120px" class="rounded-[2.25rem]" />
    </div>
  {:else if error}
    <div class="bg-error/10 border border-error/20 p-8 rounded-[2.25rem] text-center">
      <Papicon icon="AlertTriangle" size={48} class="text-error mx-auto mb-4" />
      <h2 class="text-xl font-bold text-on-error-container">Erreur de chargement</h2>
      <p class="text-on-error-container/70 mt-2">{error}</p>
    </div>
  {:else}
    <!-- Stats Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <MetricCard 
        label="Serveurs" 
        value={stats.guildCount} 
        icon="Server" 
        toneClass="bg-indigo-500/10 text-indigo-400"
      />
      <MetricCard 
        label="Utilisateurs" 
        value={stats.userCount.toLocaleString()} 
        icon="Users" 
        toneClass="bg-blue-500/10 text-blue-400"
      />
      <MetricCard 
        label="Sanctions" 
        value={stats.activeSanctions} 
        icon="ShieldAlert" 
        toneClass="bg-amber-500/10 text-amber-400"
      />
      <MetricCard 
        label="Exercices" 
        value={stats.dailyAlgoSubmissions} 
        icon="Code" 
        toneClass="bg-emerald-500/10 text-emerald-400"
      />
    </div>

    <!-- Tabs Navigation -->
    <div class="flex flex-wrap gap-2 p-2 bg-surface/50 rounded-2xl border border-outline-variant/10">
      <button 
        onclick={() => activeTab = 'overview'}
        class="flex-1 min-w-30 px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all {activeTab === 'overview' ? 'bg-primary text-on-primary shadow-lg shadow-primary/20' : 'text-on-surface-variant hover:bg-on-surface/5 hover:text-on-surface'}"
      >
        <Papicon icon="activity" size={20} /> Vue d'ensemble
      </button>
      <button 
        onclick={() => activeTab = 'servers'}
        class="flex-1 min-w-30 px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all {activeTab === 'servers' ? 'bg-primary text-on-primary shadow-lg shadow-primary/20' : 'text-on-surface-variant hover:bg-on-surface/5 hover:text-on-surface'}"
      >
        <Papicon icon="Server" size={20} /> Serveurs ({stats.guildCount})
      </button>
      <button 
        onclick={() => activeTab = 'shards'}
        class="flex-1 min-w-30 px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all {activeTab === 'shards' ? 'bg-primary text-on-primary shadow-lg shadow-primary/20' : 'text-on-surface-variant hover:bg-on-surface/5 hover:text-on-surface'}"
      >
        <Papicon icon="Activity" size={20} /> Shards
      </button>
      <button 
        onclick={() => activeTab = 'security'}
        class="flex-1 min-w-30 px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all {activeTab === 'security' ? 'bg-primary text-on-primary shadow-lg shadow-primary/20' : 'text-on-surface-variant hover:bg-on-surface/5 hover:text-on-surface'}"
      >
        <Papicon icon="ShieldCheck" size={20} /> Sécurité
      </button>
      <button 
        onclick={() => activeTab = 'content'}
        class="flex-1 min-w-30 px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all {activeTab === 'content' ? 'bg-primary text-on-primary shadow-lg shadow-primary/20' : 'text-on-surface-variant hover:bg-on-surface/5 hover:text-on-surface'}"
      >
        <Papicon icon="filter" size={20} /> Mots globaux
      </button>
      <button 
        onclick={() => activeTab = 'config'}
        class="flex-1 min-w-30 px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all {activeTab === 'config' ? 'bg-primary text-on-primary shadow-lg shadow-primary/20' : 'text-on-surface-variant hover:bg-on-surface/5 hover:text-on-surface'}"
      >
        <Papicon icon="Settings" size={20} /> Avancé
      </button>
      <button 
        onclick={() => activeTab = 'activation'}
        class="flex-1 min-w-30 px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all {activeTab === 'activation' ? 'bg-primary text-on-primary shadow-lg shadow-primary/20' : 'text-on-surface-variant hover:bg-on-surface/5 hover:text-on-surface'}"
      >
        <Papicon icon="Key" size={20} /> Codes d'activation
      </button>
    </div>

    <!-- Tab Content -->
    <div class="mt-8">
      {#if activeTab === 'overview'}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <!-- System Health -->
          <div class="space-y-6">
            <h2 class="text-xl font-black font-headline flex items-center gap-3 px-2">
              <Papicon icon="activity" size={24} class="text-indigo-400" />
              Santé Système
            </h2>
            
            <div class="premium-card rounded-[2.25rem] p-8 space-y-8 h-full">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-4">
                  <div class="p-3 bg-on-surface/5 rounded-2xl text-on-surface-variant">
                    <Papicon icon="Clock" size={20} />
                  </div>
                  <span class="font-bold text-on-surface">Uptime</span>
                </div>
                <span class="text-indigo-400 font-black font-mono text-lg">{formatUptime(stats.uptime)}</span>
              </div>

              <div class="flex items-center justify-between">
                <div class="flex items-center gap-4">
                  <div class="p-3 bg-on-surface/5 rounded-2xl text-on-surface-variant">
                    <Papicon icon="HardDrive" size={20} />
                  </div>
                  <span class="font-bold text-on-surface">Mémoire (RSS)</span>
                </div>
                <span class="text-blue-400 font-black font-mono text-lg">{formatBytes(stats.memoryUsage.rss)}</span>
              </div>

              <div class="pt-6 border-t border-outline-variant/10">
                <div class="flex items-center justify-between mb-3">
                  <span class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Heap Used</span>
                  <span class="text-xs font-bold text-on-surface-variant">{formatBytes(stats.memoryUsage.heapUsed)} / {formatBytes(stats.memoryUsage.heapTotal)}</span>
                </div>
                <div class="h-3 bg-on-surface/5 rounded-full overflow-hidden p-0.5 border border-on-surface/5">
                  <div 
                    class="h-full bg-linear-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-1000 ease-out shadow-lg shadow-indigo-500/20" 
                    style="width: {(stats.memoryUsage.heapUsed / stats.memoryUsage.heapTotal) * 100}%"
                  ></div>
                </div>
              </div>
            </div>
          </div>

          <!-- Broadcast -->
          <div class="space-y-6">
            <h2 class="text-xl font-black font-headline flex items-center gap-3 px-2">
              <Papicon icon="Megaphone" size={24} class="text-blue-400" />
              Annonce Globale (Broadcast)
            </h2>
            
            <div class="premium-card rounded-[2.25rem] p-8 h-full flex flex-col">
              <p class="text-sm text-on-surface-variant mb-6">
                Envoie un message officiel sur <strong>tous</strong> les serveurs connectés (dans leur canal public ou premier canal disponible).
              </p>
              
              <form onsubmit={handleBroadcast} class="flex flex-col flex-1 gap-4">
                <textarea 
                  bind:value={broadcastMessage}
                  placeholder="Écrivez votre message global ici..." 
                  class="flex-1 bg-surface/50 border border-outline-variant/20 rounded-xl px-4 py-4 text-sm focus:outline-none focus:border-blue-500/50 text-on-surface transition-colors resize-none min-h-30"
                  required
                ></textarea>
                <button 
                  type="submit" 
                  class="bg-blue-500 text-white px-6 py-4 rounded-xl font-bold hover:bg-blue-600 transition-all hover:scale-[1.02] flex items-center justify-center gap-2"
                >
                  <Papicon icon="Send" size={20} /> Envoyer à {stats.guildCount} serveurs
                </button>
              </form>
            </div>
          </div>
        </div>
      {/if}

      {#if activeTab === 'servers'}
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in">
          <!-- Stats Système (Col 1) -->
          <div class="lg:col-span-1 space-y-6">
        <h2 class="text-xl font-black font-headline flex items-center gap-3 px-2">
          <Papicon icon="activity" size={24} class="text-indigo-400" />
          Santé Système
        </h2>
        
        <div class="premium-card rounded-[2.25rem] p-8 space-y-8">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-4">
              <div class="p-3 bg-on-surface/5 rounded-2xl text-on-surface-variant">
                <Papicon icon="Clock" size={20} />
              </div>
              <span class="font-bold text-on-surface">Uptime</span>
            </div>
            <span class="text-indigo-400 font-black font-mono text-lg">{formatUptime(stats.uptime)}</span>
          </div>

          <div class="flex items-center justify-between">
            <div class="flex items-center gap-4">
              <div class="p-3 bg-on-surface/5 rounded-2xl text-on-surface-variant">
                <Papicon icon="HardDrive" size={20} />
              </div>
              <span class="font-bold text-on-surface">Mémoire (RSS)</span>
            </div>
            <span class="text-blue-400 font-black font-mono text-lg">{formatBytes(stats.memoryUsage.rss)}</span>
          </div>

          <div class="pt-6 border-t border-outline-variant/10">
            <div class="flex items-center justify-between mb-3">
              <span class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Heap Used</span>
              <span class="text-xs font-bold text-on-surface-variant">{formatBytes(stats.memoryUsage.heapUsed)} / {formatBytes(stats.memoryUsage.heapTotal)}</span>
            </div>
            <div class="h-3 bg-on-surface/5 rounded-full overflow-hidden p-0.5 border border-on-surface/5">
              <div 
                class="h-full bg-linear-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-1000 ease-out shadow-lg shadow-indigo-500/20" 
                style="width: {(stats.memoryUsage.heapUsed / stats.memoryUsage.heapTotal) * 100}%"
              ></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Guilds List -->
      <div class="lg:col-span-2 space-y-6">
        <h2 class="text-xl font-black font-headline flex items-center gap-3 px-2">
          <Papicon icon="Server" size={24} class="text-purple-400" />
          Serveurs Connectés
        </h2>

        <div class="premium-card rounded-[2.25rem] overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left">
              <thead class="bg-on-surface/5 text-on-surface-variant/40 text-[10px] font-black uppercase tracking-widest">
                <tr>
                  <th class="px-8 py-5">Serveur</th>
                  <th class="px-8 py-5">Membres</th>
                  <th class="px-8 py-5">Activation</th>
                  <th class="px-8 py-5">Rejoint le</th>
                  <th class="px-8 py-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-outline-variant/10">
                {#each guilds as guild}
                  <tr class="hover:bg-on-surface/5 transition-colors group">
                    <td class="px-8 py-5">
                      <div class="flex items-center gap-4">
                        {#if guild.icon}
                          <img src={guild.icon} alt={guild.name} class="h-10 w-10 rounded-2xl shadow-lg shadow-black/20" />
                        {:else}
                          <div class="h-10 w-10 rounded-2xl bg-on-surface/10 flex items-center justify-center text-sm font-black text-on-surface">
                            {guild.name.charAt(0)}
                          </div>
                        {/if}
                        <div>
                          <p class="font-bold text-on-surface">{guild.name}</p>
                          <p class="text-[10px] text-on-surface-variant/40 font-mono tracking-tighter">{guild.id}</p>
                        </div>
                      </div>
                    </td>
                    <td class="px-8 py-5 font-black text-on-surface">
                      {guild.memberCount.toLocaleString()}
                    </td>
                    <td class="px-8 py-5">
                      {#if guild.activated}
                        <div class="flex flex-col gap-1">
                          <span class="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full w-fit">
                            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                            Activé
                          </span>
                          {#if guild.activationCode}
                            <span class="text-[10px] text-on-surface-variant/50 font-mono tracking-wider ml-1">{guild.activationCode}</span>
                          {/if}
                        </div>
                      {:else}
                        <button 
                          onclick={() => handleActivateGuildAuto(guild.id, guild.name)}
                          class="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 px-3 py-1.5 rounded-xl border border-amber-500/20 hover:scale-105 transition-all shadow-lg shadow-amber-500/5 cursor-pointer"
                        >
                          <Papicon icon="Key" size={12} />
                          Activer (Auto)
                        </button>
                      {/if}
                    </td>
                    <td class="px-8 py-5 text-sm font-medium text-on-surface-variant/60">
                      {new Date(guild.joinedAt).toLocaleDateString('fr-FR')}
                    </td>
                    <td class="px-8 py-5 text-right">
                      <div class="flex items-center justify-end gap-2">
                        {#if guild.activated}
                          <button 
                            class="w-10 h-10 flex items-center justify-center hover:bg-amber-500/10 rounded-xl text-on-surface-variant hover:text-amber-500 transition-all group-hover:scale-110"
                            onclick={() => handleDeactivateGuild(guild.id, guild.name)}
                            title="Désactiver le serveur"
                          >
                            <Papicon icon="Unlock" size={18} />
                          </button>
                        {/if}
                        <button 
                          class="w-10 h-10 flex items-center justify-center hover:bg-primary/10 rounded-xl text-on-surface-variant hover:text-primary transition-all group-hover:scale-110"
                          onclick={() => handleGetInvite(guild.id)}
                          title="Créer une invitation"
                        >
                          <Papicon icon="ExternalLink" size={18} />
                        </button>
                        <button 
                          class="w-10 h-10 flex items-center justify-center hover:bg-error/10 rounded-xl text-on-surface-variant hover:text-error transition-all group-hover:scale-110"
                          onclick={() => handleLeaveGuild(guild.id, guild.name)}
                          title="Faire quitter le bot"
                        >
                          <Papicon icon="LogOut" size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  {/if}

      {#if activeTab === 'shards'}
        <div class="space-y-8 animate-in fade-in">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <MetricCard
              label="Shards configurés"
              value={shardConfiguredCount}
              icon="Server"
              toneClass="bg-indigo-500/10 text-indigo-400"
            />
            <MetricCard
              label="En ligne"
              value={shardState?.onlineShardCount ?? 0}
              icon="Wifi"
              toneClass="bg-emerald-500/10 text-emerald-400"
            />
            <MetricCard
              label="Ping moyen"
              value={`${shardAveragePing} ms`}
              icon="Activity"
              toneClass="bg-blue-500/10 text-blue-400"
            />
          </div>

          <div class="grid grid-cols-1 xl:grid-cols-3 gap-8">
            <div class="space-y-6 xl:col-span-1">
              <div class="premium-card rounded-[2.25rem] p-8 space-y-5 h-full">
                <div class="flex items-center justify-between gap-4">
                  <div>
                    <h2 class="text-xl font-black font-headline flex items-center gap-3">
                      <Papicon icon="Settings" size={22} class="text-primary" />
                      Configuration
                    </h2>
                    <p class="text-sm text-on-surface-variant mt-2">Le conteneur redémarre automatiquement après reconfiguration.</p>
                  </div>
                  <button
                    type="button"
                    onclick={refreshShards}
                    class="rounded-2xl border border-outline-variant/20 px-4 py-2 text-xs font-black uppercase tracking-[0.15em] text-on-surface-variant hover:bg-on-surface/5 transition-colors"
                    disabled={shardLoading}
                  >
                    {shardLoading ? '...' : 'Rafraîchir'}
                  </button>
                </div>

                <div class="grid gap-3 text-sm">
                  <div class="flex items-center justify-between rounded-2xl bg-surface/40 px-4 py-3">
                    <span class="text-on-surface-variant">Mode actuel</span>
                    <span class="font-black text-on-surface uppercase tracking-widest text-[10px]">{shardState?.config.mode ?? 'auto'}</span>
                  </div>
                  <div class="flex items-center justify-between rounded-2xl bg-surface/40 px-4 py-3">
                    <span class="text-on-surface-variant">Redondance</span>
                    <span class="font-black text-on-surface">{shardConfiguredCount} shard(s)</span>
                  </div>
                  <div class="flex items-center justify-between rounded-2xl bg-surface/40 px-4 py-3">
                    <span class="text-on-surface-variant">En ligne</span>
                    <span class="font-black text-emerald-400">{shardState?.onlineShardCount ?? 0}/{shardConfiguredCount}</span>
                  </div>
                </div>

                <div class="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onclick={handleRestartAllShards}
                    disabled={shardActionLoading === 'restart-all'}
                    class="rounded-2xl bg-amber-500 px-4 py-3 text-sm font-black text-white hover:bg-amber-500/90 transition-colors disabled:opacity-40"
                  >
                    {shardActionLoading === 'restart-all' ? 'Redémarrage...' : 'Redémarrer tout'}
                  </button>
                  <button
                    type="button"
                    onclick={handleReconfigureShards}
                    disabled={shardActionLoading === 'reconfigure'}
                    class="rounded-2xl bg-primary px-4 py-3 text-sm font-black text-white hover:bg-primary/90 transition-colors disabled:opacity-40"
                  >
                    {shardActionLoading === 'reconfigure' ? 'Enregistrement...' : 'Appliquer la config'}
                  </button>
                </div>

                <label class="space-y-2 block">
                  <span class="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60">Mode de sharding</span>
                  <select
                    bind:value={shardMode}
                    class="w-full rounded-2xl border border-outline-variant/20 bg-surface/60 px-4 py-3 text-sm text-on-surface focus:outline-none focus:border-primary/50"
                  >
                    <option value="auto">Automatique</option>
                    <option value="fixed">Fixe</option>
                  </select>
                </label>

                <label class="space-y-2 block">
                  <span class="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60">Nombre de shards</span>
                  <input
                    type="number"
                    min="1"
                    bind:value={shardCount}
                    placeholder="Auto si vide"
                    disabled={shardMode !== 'fixed'}
                    class="w-full rounded-2xl border border-outline-variant/20 bg-surface/60 px-4 py-3 text-sm text-on-surface focus:outline-none focus:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </label>
              </div>
            </div>

            <div class="space-y-6 xl:col-span-2">
              <div class="premium-card rounded-[2.25rem] p-8 space-y-6">
                <div class="flex items-center justify-between gap-4">
                  <div>
                    <h2 class="text-xl font-black font-headline flex items-center gap-3">
                      <Papicon icon="BarChart3" size={22} class="text-cyan-400" />
                      Répartition visuelle
                    </h2>
                    <p class="text-sm text-on-surface-variant mt-2">Lecture rapide de la charge par shard, pour repérer tout déséquilibre en un coup d'œil.</p>
                  </div>
                  <div class="text-right">
                    <p class="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/40">Latence moyenne</p>
                    <p class="text-2xl font-black text-on-surface">{shardAveragePing} ms</p>
                  </div>
                </div>

                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 items-end min-h-55">
                  {#each shardRows as shard (shard.shardId)}
                    <div class="flex flex-col items-center gap-3">
                      <div class="w-full h-48 rounded-3xl bg-surface/40 border border-outline-variant/10 p-3 flex items-end">
                        <div
                          class="w-full rounded-2xl transition-all duration-700 {shard.status === 'online' ? 'bg-linear-to-t from-emerald-500 to-cyan-400' : shard.status === 'starting' ? 'bg-linear-to-t from-amber-500 to-yellow-300' : shard.status === 'restarting' ? 'bg-linear-to-t from-blue-500 to-indigo-400' : 'bg-linear-to-t from-red-500 to-rose-400'}"
                          style="height: {maxShardGuildCount > 0 ? Math.max(12, (shard.guildCount / maxShardGuildCount) * 100) : 12}%"
                        ></div>
                      </div>
                      <div class="text-center">
                        <p class="text-sm font-black text-on-surface">Shard {shard.shardId}</p>
                        <p class="text-[10px] uppercase tracking-[0.2em] text-on-surface-variant/40">{shard.guildCount} serveurs · {shard.ping} ms</p>
                      </div>
                    </div>
                  {/each}
                </div>
              </div>

              <div class="premium-card rounded-[2.25rem] overflow-hidden">
                <div class="overflow-x-auto">
                  <table class="w-full text-left">
                    <thead class="bg-on-surface/5 text-on-surface-variant/40 text-[10px] font-black uppercase tracking-widest">
                      <tr>
                        <th class="px-6 py-5">Shard</th>
                        <th class="px-6 py-5">État</th>
                        <th class="px-6 py-5">Serveurs</th>
                        <th class="px-6 py-5">Membres</th>
                        <th class="px-6 py-5">Ping</th>
                        <th class="px-6 py-5">Uptime</th>
                        <th class="px-6 py-5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-outline-variant/10">
                      {#each shardRows as shard (shard.shardId)}
                        <tr class="hover:bg-on-surface/5 transition-colors group">
                          <td class="px-6 py-5">
                            <div class="font-black text-on-surface">#{shard.shardId}</div>
                            <p class="text-[10px] font-mono text-on-surface-variant/40 mt-1">{shard.readyAt ? new Date(shard.readyAt).toLocaleTimeString('fr-FR') : 'Jamais'}</p>
                          </td>
                          <td class="px-6 py-5">
                            <span class={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${shardStatusTone(shard.status)}`}>
                              <span class={`w-1.5 h-1.5 rounded-full ${shard.status === 'online' ? 'bg-emerald-400' : shard.status === 'starting' ? 'bg-amber-400' : shard.status === 'restarting' ? 'bg-blue-400' : 'bg-red-400'}`}></span>
                              {shardStatusLabel(shard.status)}
                            </span>
                          </td>
                          <td class="px-6 py-5 font-black text-on-surface">{shard.guildCount}</td>
                          <td class="px-6 py-5 font-black text-on-surface">{shard.memberCount.toLocaleString()}</td>
                          <td class="px-6 py-5 font-black text-on-surface">{shard.ping} ms</td>
                          <td class="px-6 py-5 font-black text-on-surface">{formatShardUptime(shard.uptime)}</td>
                          <td class="px-6 py-5 text-right">
                            <button
                              type="button"
                              onclick={() => handleRestartShard(shard.shardId)}
                              disabled={shardActionLoading === `restart:${shard.shardId}`}
                              class="rounded-xl border border-outline-variant/20 px-3 py-2 text-xs font-black uppercase tracking-[0.15em] text-on-surface-variant hover:bg-on-surface/5 transition-colors disabled:opacity-40"
                            >
                              {shardActionLoading === `restart:${shard.shardId}` ? '...' : 'Redémarrer'}
                            </button>
                          </td>
                        </tr>
                      {/each}
                      {#if shardRows.length === 0}
                        <tr>
                          <td colspan="7" class="px-6 py-10 text-center text-sm text-on-surface-variant/50">{shardLoading ? 'Chargement des shards...' : 'Aucun shard disponible.'}</td>
                        </tr>
                      {/if}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      {/if}

      {#if activeTab === 'security'}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in">
          <!-- Global Admins -->
          <div class="space-y-6">
            <h2 class="text-xl font-black font-headline flex items-center gap-3 px-2">
              <Papicon icon="ShieldCheck" size={24} class="text-emerald-400" />
              Administrateurs Globaux
            </h2>
            
            <div class="premium-card rounded-[2.25rem] p-8 space-y-6 h-full">
              <form onsubmit={handleAddAdmin} class="flex gap-2">
                <input 
                  type="text" 
                  bind:value={newAdminId}
                  placeholder="ID Discord (ex: 457...)" 
                  class="flex-1 bg-surface/50 border border-outline-variant/20 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50 text-on-surface transition-colors"
                  required
                />
                <button type="submit" class="bg-primary text-on-primary px-6 py-3 rounded-xl font-bold hover:bg-primary/90 transition-all hover:scale-105">Ajouter</button>
              </form>

              <div class="space-y-3">
                {#each globalAdmins as admin}
                  <div class="flex items-center justify-between p-4 bg-surface/30 rounded-xl border border-outline-variant/10">
                    <div class="flex items-center gap-3">
                      {#if admin.avatarUrl}
                        <img src={admin.avatarUrl} alt={admin.username} class="w-10 h-10 rounded-full shadow-md" />
                      {:else}
                        <div class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">{admin.username.charAt(0)}</div>
                      {/if}
                      <div>
                        <p class="font-bold text-sm text-on-surface">{admin.username}</p>
                        <p class="text-[10px] text-on-surface-variant/70 font-mono">{admin.userId}</p>
                      </div>
                    </div>
                    {#if admin.userId !== '457275321171968000'}
                      <button onclick={() => handleRemoveAdmin(admin.userId, admin.username)} class="p-2 text-error hover:bg-error/10 rounded-lg transition-colors" title="Révoquer l'accès"><Papicon icon="Trash" size={18} /></button>
                    {:else}
                      <div class="text-[10px] uppercase font-black tracking-widest text-emerald-500/70 bg-emerald-500/10 px-2 py-1 rounded-md">Créateur</div>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          </div>

          <!-- Global Blacklist -->
          <div class="space-y-6">
            <h2 class="text-xl font-black font-headline flex items-center gap-3 px-2">
              <Papicon icon="UserX" size={24} class="text-error" />
              Blacklist Universelle
            </h2>
            
            <div class="premium-card rounded-[2.25rem] p-8 space-y-6 h-full border-error/20">
              <form onsubmit={handleAddBlacklist} class="flex flex-col gap-3">
                <input 
                  type="text" 
                  bind:value={newBlacklistId}
                  placeholder="ID Discord à bloquer" 
                  class="w-full bg-surface/50 border border-outline-variant/20 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-error/50 text-on-surface transition-colors"
                  required
                />
                <div class="flex gap-2">
                  <input 
                    type="text" 
                    bind:value={newBlacklistReason}
                    placeholder="Raison (optionnel)" 
                    class="flex-1 bg-surface/50 border border-outline-variant/20 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-error/50 text-on-surface transition-colors"
                  />
                  <button type="submit" class="bg-error text-on-error px-6 py-3 rounded-xl font-bold hover:bg-error/90 transition-all hover:scale-105">Bannir</button>
                </div>
              </form>

              <div class="space-y-3">
                {#each globalBlacklist as user}
                  <div class="flex items-center justify-between p-4 bg-error/5 rounded-xl border border-error/10">
                    <div class="flex items-center gap-3">
                      {#if user.avatarUrl}
                        <img src={user.avatarUrl} alt={user.username} class="w-10 h-10 rounded-full shadow-md" />
                      {:else}
                        <div class="w-10 h-10 rounded-full bg-error/20 flex items-center justify-center text-error font-bold">{user.username.charAt(0)}</div>
                      {/if}
                      <div>
                        <p class="font-bold text-sm text-on-surface">{user.username} <span class="font-normal text-on-surface-variant text-xs">({user.userId})</span></p>
                        {#if user.reason}
                          <p class="text-xs text-error/80 mt-1">{user.reason}</p>
                        {/if}
                      </div>
                    </div>
                    <button onclick={() => handleRemoveBlacklist(user.userId)} class="p-2 text-on-surface-variant hover:text-success hover:bg-success/10 rounded-lg transition-colors" title="Pardonner"><Papicon icon="Unlock" size={18} /></button>
                  </div>
                {/each}
                {#if globalBlacklist.length === 0}
                  <p class="text-sm text-center text-on-surface-variant italic py-4">Aucun utilisateur dans la blacklist.</p>
                {/if}
              </div>
            </div>
          </div>
        </div>
      {/if}

      {#if activeTab === 'content'}
        <div class="grid grid-cols-1 gap-8 animate-in fade-in">
          <div class="space-y-6">
            <h2 class="text-xl font-black font-headline flex items-center gap-3 px-2">
              <Papicon icon="filter" size={24} class="text-cyan-400" />
              Importer des mots globaux
            </h2>

            <div class="premium-card rounded-[2.25rem] p-8 space-y-5 h-full">
              <div class="space-y-2">
                <p class="text-sm text-on-surface-variant leading-relaxed">
                  Collez un CSV, un JSON ou une liste de mots. Vous choisissez les catégories à la main, puis le système ne fait que nettoyer les doublons.
                </p>
                <p class="text-xs text-on-surface-variant/50">
                  Format accepté: <span class="font-mono">mot</span>, <span class="font-mono">mot,catégorie</span>, <span class="font-mono">mot,catégorie,true/false</span> ou JSON avec <span class="font-mono">word</span>, <span class="font-mono">category</span>, <span class="font-mono">enabled</span>.
                </p>
              </div>

              <input
                type="file"
                accept=".csv,.json,.txt,.tsv"
                onchange={handleImportFileChange}
                class="block w-full text-sm text-on-surface-variant file:mr-4 file:rounded-xl file:border-0 file:bg-primary file:px-4 file:py-2.5 file:text-sm file:font-bold file:text-white hover:file:bg-primary/90"
              />

              <textarea
                bind:value={globalImportText}
                rows="10"
                placeholder="word,category\nmenace,threat\ninsulte,insult"
                class="w-full rounded-2xl border border-outline-variant/20 bg-surface/60 px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/30 focus:outline-none focus:border-primary/50"
              ></textarea>

              <div class="flex flex-wrap gap-3">
                <button onclick={handleAnalyzeGlobalImport} class="px-5 py-3 rounded-2xl bg-primary text-white font-bold text-sm hover:bg-primary/90 transition-colors">Analyser</button>
                <button onclick={resetGlobalImport} class="px-5 py-3 rounded-2xl border border-outline-variant/20 text-sm font-bold text-on-surface-variant hover:bg-on-surface/5 transition-colors">Réinitialiser</button>
                <button onclick={handleSaveGlobalImport} disabled={globalImportLoading || globalImportDrafts.length === 0} class="px-5 py-3 rounded-2xl bg-emerald-500 text-white font-bold text-sm hover:bg-emerald-500/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  {globalImportLoading ? 'Enregistrement...' : 'Enregistrer les mots'}
                </button>
              </div>

              {#if globalImportFileName}
                <p class="text-xs text-on-surface-variant/50">Fichier chargé : {globalImportFileName}</p>
              {/if}

              {#if globalImportError}
                <div class="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-600">
                  {globalImportError}
                </div>
              {/if}
            </div>

            {#if globalImportDrafts.length > 0}
              <div class="premium-card rounded-[2.25rem] p-8 space-y-4">
                <div class="flex items-center justify-between gap-4">
                  <h3 class="text-lg font-black text-on-surface">Prévisualisation ({globalImportDrafts.length})</h3>
                  <p class="text-xs text-on-surface-variant/50">Modifiez les catégories avant validation.</p>
                </div>

                <div class="overflow-hidden rounded-2xl border border-outline-variant/10">
                  <table class="w-full text-sm">
                    <thead class="bg-surface/40 text-left text-[10px] uppercase tracking-[0.2em] text-on-surface-variant/50">
                      <tr>
                        <th class="px-4 py-3">Mot</th>
                        <th class="px-4 py-3">Catégorie</th>
                        <th class="px-4 py-3 text-center">Actif</th>
                        <th class="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-outline-variant/10">
                      {#each globalImportDrafts as draft (draft.id)}
                        <tr class="bg-surface/10">
                          <td class="px-4 py-3">
                            <input
                              type="text"
                              value={draft.word}
                              oninput={(event) => updateDraft(draft.id, { word: (event.currentTarget as HTMLInputElement).value })}
                              class="w-full rounded-xl border border-outline-variant/20 bg-surface/70 px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary/50"
                            />
                          </td>
                          <td class="px-4 py-3">
                            <select
                              value={draft.category}
                              onchange={(event) => updateDraft(draft.id, { category: (event.currentTarget as HTMLSelectElement).value })}
                              class="w-full rounded-xl border border-outline-variant/20 bg-surface/70 px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary/50"
                            >
                              {#each Object.entries(BANNED_WORD_CATEGORIES) as [key, label]}
                                <option value={key}>{label}</option>
                              {/each}
                            </select>
                          </td>
                          <td class="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={draft.enabled}
                              onchange={(event) => updateDraft(draft.id, { enabled: (event.currentTarget as HTMLInputElement).checked })}
                              class="h-4 w-4 rounded border-outline-variant/40 text-primary focus:ring-primary/30"
                            />
                          </td>
                          <td class="px-4 py-3 text-right">
                            <button onclick={() => removeDraft(draft.id)} class="rounded-xl p-2 text-on-surface-variant/40 hover:bg-error/10 hover:text-error transition-colors" title="Retirer">
                              <Papicon icon="Trash" size={16} />
                            </button>
                          </td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              </div>
            {/if}
          </div>

          <div class="space-y-6">
            <h2 class="text-xl font-black font-headline flex items-center gap-3 px-2">
              <Papicon icon="ShieldAlert" size={24} class="text-cyan-400" />
              Mots globaux actifs ({globalBannedWords.length})
            </h2>

            <div class="premium-card rounded-[2.25rem] p-8 space-y-4">
              <p class="text-sm text-on-surface-variant/70">
                Ces mots sont appliqués à tous les serveurs et peuvent être désactivés ou supprimés depuis cette interface d'administration.
              </p>

              <div class="flex flex-wrap gap-3">
                <button
                  type="button"
                  onclick={handleCleanupGlobalWords}
                  disabled={globalCleanupLoading}
                  class="inline-flex items-center gap-2 rounded-2xl bg-cyan-500 px-4 py-3 text-sm font-bold text-white hover:bg-cyan-500/90 transition-colors disabled:opacity-40"
                >
                  <Papicon icon="Sparkles" size={16} />
                  {globalCleanupLoading ? 'Nettoyage...' : 'Dédupliquer seulement'}
                </button>
                <button
                  type="button"
                    onclick={loadGlobalBannedWords}
                  class="inline-flex items-center gap-2 rounded-2xl border border-outline-variant/20 px-4 py-3 text-sm font-bold text-on-surface-variant hover:bg-on-surface/5 transition-colors"
                >
                  <Papicon icon="RefreshCw" size={16} />
                  Rafraîchir
                </button>
              </div>

                {#if globalBannedWordsLoading && !globalBannedWordsLoaded}
                  <div class="space-y-3 rounded-2xl border border-outline-variant/10 p-4">
                    {#each [1, 2, 3, 4, 5, 6] as _}
                      <Skeleton height="64px" class="rounded-xl" />
                    {/each}
                  </div>
                {:else if globalBannedWordsError}
                  <div class="rounded-2xl border border-error/20 bg-error/10 p-4 text-sm text-error flex items-center justify-between gap-4">
                    <span>{globalBannedWordsError}</span>
                    <button onclick={loadGlobalBannedWords} class="rounded-xl bg-error px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-error/90">
                      Réessayer
                    </button>
                  </div>
                {:else}
                  <div class="overflow-hidden rounded-2xl border border-outline-variant/10">
                    <table class="w-full text-sm">
                      <thead class="bg-surface/40 text-left text-[10px] uppercase tracking-[0.2em] text-on-surface-variant/50">
                        <tr>
                          <th class="px-4 py-3">Mot</th>
                          <th class="px-4 py-3">Catégorie</th>
                          <th class="px-4 py-3 text-center">Actif</th>
                          <th class="px-4 py-3"></th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-outline-variant/10">
                        {#each paginatedGlobalBannedWords as entry (entry.id)}
                          <tr class="{entry.enabled ? 'bg-surface/10' : 'bg-surface/5 opacity-60'}">
                            <td class="px-4 py-3">
                              <input
                                type="text"
                                value={entry.word}
                                oninput={(event) => updateGlobalWordField(entry.id, { word: (event.currentTarget as HTMLInputElement).value })}
                                class="w-full rounded-xl border border-outline-variant/20 bg-surface/70 px-3 py-2 text-sm font-mono font-semibold text-on-surface focus:outline-none focus:border-primary/50"
                                maxlength="100"
                              />
                            </td>
                            <td class="px-4 py-3">
                              <select
                                value={entry.category}
                                onchange={(event) => updateGlobalWordField(entry.id, { category: (event.currentTarget as HTMLSelectElement).value })}
                                class="w-full rounded-xl border border-outline-variant/20 bg-surface/70 px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary/50"
                              >
                                {#each Object.entries(BANNED_WORD_CATEGORIES) as [key, label]}
                                  <option value={key}>{label}</option>
                                {/each}
                              </select>
                            </td>
                            <td class="px-4 py-3 text-center">
                              <label class="inline-flex items-center gap-2 cursor-pointer text-xs font-bold {entry.enabled ? 'text-emerald-500' : 'text-on-surface-variant/40'}">
                                <input
                                  type="checkbox"
                                  checked={entry.enabled}
                                  onchange={(event) => updateGlobalWordField(entry.id, { enabled: (event.currentTarget as HTMLInputElement).checked })}
                                  class="h-4 w-4 rounded border-outline-variant/40 text-primary focus:ring-primary/30"
                                />
                                <span class="h-2.5 w-2.5 rounded-full {entry.enabled ? 'bg-emerald-500' : 'bg-on-surface-variant/30'}"></span>
                                {entry.enabled ? 'Actif' : 'Inactif'}
                              </label>
                            </td>
                            <td class="px-4 py-3 text-right whitespace-nowrap">
                              <div class="flex items-center justify-end gap-2">
                                <button onclick={() => handleDeleteGlobalWord(entry)} class="rounded-xl p-2 text-on-surface-variant/40 hover:bg-error/10 hover:text-error transition-colors" title="Supprimer">
                                  <Papicon icon="Trash" size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                  </div>

                  {#if globalBannedWords.length === 0}
                    <p class="py-4 text-center text-sm text-on-surface-variant/50">Aucun mot global configuré.</p>
                  {:else}
                    <div class="flex flex-col gap-3 rounded-2xl border border-outline-variant/10 bg-surface/20 px-4 py-3 md:flex-row md:items-center md:justify-between">
                      <p class="text-xs text-on-surface-variant/60">
                        Page {globalBannedWordsPage} sur {globalBannedWordsTotalPages} · {globalBannedWords.length} mot(s) global(aux)
                      </p>
                      {#if globalBannedWordsTotalPages > 1}
                        <div class="flex items-center gap-2">
                          <button
                            onclick={() => goToGlobalBannedWordsPage(globalBannedWordsPage - 1)}
                            disabled={globalBannedWordsPage === 1}
                            class="rounded-xl border border-outline-variant/20 px-3 py-2 text-xs font-bold text-on-surface-variant transition-colors hover:bg-on-surface/5 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Précédent
                          </button>
                          <button
                            onclick={() => goToGlobalBannedWordsPage(globalBannedWordsPage + 1)}
                            disabled={globalBannedWordsPage === globalBannedWordsTotalPages}
                            class="rounded-xl border border-outline-variant/20 px-3 py-2 text-xs font-bold text-on-surface-variant transition-colors hover:bg-on-surface/5 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Suivant
                          </button>
                        </div>
                      {/if}
                    </div>
                  {/if}
                {/if}
            </div>
          </div>
        </div>
      {/if}

      {#if activeTab === 'config'}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in">
          <!-- Kill Switch -->
          <div class="space-y-6">
            <h2 class="text-xl font-black font-headline flex items-center gap-3 px-2">
              <Papicon icon="Power" size={24} class="text-amber-500" />
              Kill Switch
            </h2>
            
            <div class="premium-card rounded-[2.25rem] p-8 flex flex-col justify-center items-center text-center space-y-6 h-full {maintenanceMode ? 'border-amber-500/50 bg-amber-500/5' : ''}">
              <div class="w-24 h-24 rounded-full flex items-center justify-center {maintenanceMode ? 'bg-amber-500/20 text-amber-500' : 'bg-surface-variant text-on-surface-variant'} shadow-inner">
                <Papicon icon="AlertOctagon" size={48} />
              </div>
              <div>
                <h3 class="text-xl font-bold text-on-surface mb-2">Mode Maintenance</h3>
                <p class="text-sm text-on-surface-variant">
                  {maintenanceMode 
                    ? "Le bot ignore actuellement toutes les commandes des utilisateurs normaux." 
                    : "Activez ceci pour bloquer l'accès au bot sur tous les serveurs instantanément."}
                </p>
              </div>
              <button 
                onclick={handleToggleMaintenance}
                class="px-8 py-4 rounded-xl font-black text-lg transition-all hover:scale-105 {maintenanceMode ? 'bg-success text-on-success shadow-success/20' : 'bg-amber-500 text-white shadow-amber-500/20'} shadow-lg"
              >
                {maintenanceMode ? "DÉSACTIVER (Retour Normal)" : "ACTIVER LA MAINTENANCE"}
              </button>
            </div>
          </div>

          <!-- Error Logs -->
          <div class="space-y-6">
            <h2 class="text-xl font-black font-headline flex items-center gap-3 px-2">
              <Papicon icon="Terminal" size={24} class="text-red-400" />
              Flux d'Erreurs
            </h2>
            
            <div class="premium-card rounded-[2.25rem] p-6 h-100 flex flex-col bg-[#0d1117] border-red-500/20">
              <div class="flex items-center justify-between mb-4 px-2">
                <span class="text-xs font-mono text-on-surface-variant">Dernières erreurs non interceptées</span>
                <button onclick={handleClearErrors} class="text-xs text-error hover:underline flex items-center gap-1">
                  <Papicon icon="Trash" size={12} /> Purger
                </button>
              </div>
              
              <div class="flex-1 overflow-y-auto space-y-3 font-mono text-xs p-2 rounded-xl bg-black/50 border border-white/5">
                {#each botErrors as err}
                  <div class="border-b border-white/5 pb-3">
                     <div class="flex justify-between text-[10px] text-white/40 mb-1">
                      <span>{new Date(err.createdAt).toLocaleString()}</span>
                      <span class="text-amber-400/80">{err.source || 'Inconnu'}</span>
                    </div>
                    <div class="text-red-400 wrap-break-word">{err.message}</div>
                  </div>
                {/each}
                {#if botErrors.length === 0}
                  <div class="h-full flex items-center justify-center text-success/70 italic">
                    Aucune erreur détectée ✅
                  </div>
                {/if}
              </div>
            </div>
          </div>
        </div>
      {/if}

      {#if activeTab === 'activation'}
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in">
          <!-- Generation Sidebar -->
          <div class="lg:col-span-1 space-y-6">
            <h2 class="text-xl font-black font-headline flex items-center gap-3 px-2">
              <Papicon icon="Lock" size={24} class="text-indigo-400" />
              Générateur
            </h2>
            
            <div class="premium-card rounded-[2.25rem] p-8 space-y-6 flex flex-col justify-between">
              <div class="space-y-4">
                <p class="text-sm text-on-surface-variant leading-relaxed">
                  Générez un nouveau code d'activation aléatoire unique. Ce code pourra être utilisé par les administrateurs de serveurs Discord pour activer le bot et débloquer leur accès au tableau de bord.
                </p>
                <div class="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400 font-bold flex items-start gap-3">
                  <Papicon icon="AlertTriangle" size={18} class="shrink-0 mt-0.5" />
                  <span>Chaque code ne peut être utilisé que pour un seul serveur Discord à la fois.</span>
                </div>
              </div>

              <button 
                onclick={handleGenerateCode}
                class="w-full py-4 rounded-xl bg-primary text-on-primary font-black uppercase tracking-widest text-xs transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-primary/20 flex items-center justify-center gap-3"
              >
                <Papicon icon="Unlock" size={16} />
                Générer un code
              </button>
            </div>
          </div>

          <!-- Codes List Table -->
          <div class="lg:col-span-2 space-y-6">
            <h2 class="text-xl font-black font-headline flex items-center gap-3 px-2">
              <Papicon icon="activity" size={24} class="text-purple-400" />
              Jetons d'activation ({activationCodes.length})
            </h2>

            <div class="premium-card rounded-[2.25rem] overflow-hidden">
              <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse border-spacing-0">
                  <thead class="bg-on-surface/5 text-on-surface-variant/40 text-[10px] font-black uppercase tracking-widest">
                    <tr>
                      <th class="px-8 py-5">Code d'activation</th>
                      <th class="px-8 py-5">Statut</th>
                      <th class="px-8 py-5">Utilisé par</th>
                      <th class="px-8 py-5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-outline-variant/10">
                    {#each activationCodes as item}
                      <tr class="hover:bg-on-surface/5 transition-colors group">
                        <td class="px-8 py-5">
                          <span class="font-mono text-sm font-black text-on-surface bg-surface-container-high px-3 py-1.5 rounded-lg border border-outline-variant/20 tracking-wider">
                            {item.code}
                          </span>
                        </td>
                        <td class="px-8 py-5">
                          {#if item.isActive}
                            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-success/10 text-success border border-success/20">
                              <span class="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span>
                              Disponible
                            </span>
                          {:else}
                            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-500 border border-amber-500/20">
                              <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                              Utilisé
                            </span>
                          {/if}
                        </td>
                        <td class="px-8 py-5 text-sm">
                          {#if item.usedByGuildId}
                            <div>
                              <p class="font-bold text-on-surface">{item.guildName || 'Serveur Actif'}</p>
                              <p class="text-[10px] text-on-surface-variant/40 font-mono tracking-tighter mt-0.5">{item.usedByGuildId}</p>
                            </div>
                          {:else}
                            <span class="text-xs text-on-surface-variant/40 italic">Aucun serveur</span>
                          {/if}
                        </td>
                        <td class="px-8 py-5 text-right">
                            <button 
                            class="w-10 h-10 inline-flex items-center justify-center hover:bg-error/10 rounded-xl text-on-surface-variant hover:text-error transition-all group-hover:scale-110"
                            onclick={() => handleDeleteCode(item.id, item.code, item.guildName)}
                            title={item.usedByGuildId ? "Révoquer et désactiver le serveur" : "Supprimer ce code"}
                          >
                            <Papicon icon="Trash" size={18} />
                          </button>
                        </td>
                      </tr>
                    {/each}
                    {#if activationCodes.length === 0}
                      <tr>
                        <td colspan="4" class="px-8 py-10 text-center text-on-surface-variant/40 italic text-sm">
                          Aucun code d'activation généré pour le moment.
                        </td>
                      </tr>
                    {/if}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  table {
    border-collapse: separate;
    border-spacing: 0;
  }
</style>

