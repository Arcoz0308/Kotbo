<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchAdminStats, fetchAdminGuilds, fetchAdminGuildInvite, leaveAdminGuild, fetchGlobalAdmins, addGlobalAdmin, removeGlobalAdmin, fetchGlobalBlacklist, addGlobalBlacklist, removeGlobalBlacklist, fetchMaintenanceConfig, updateMaintenanceConfig, fetchBotErrors, clearBotErrors, sendGlobalBroadcast } from '../lib/api';
  import Papicon from '../lib/components/Papicon.svelte';
  import MetricCard from '../lib/components/MetricCard.svelte';
  import Skeleton from '../lib/components/Skeleton.svelte';

  let stats = $state(null);
  let guilds = $state([]);
  let globalAdmins = $state([]);
  let globalBlacklist = $state([]);
  let maintenanceMode = $state(false);
  let botErrors = $state([]);
  
  let newAdminId = $state('');
  let newBlacklistId = $state('');
  let newBlacklistReason = $state('');
  let broadcastMessage = $state('');
  
  let activeTab = $state('overview'); // overview, servers, security, config
  
  let loading = $state(true);
  let error = $state(null);

  onMount(async () => {
    try {
      const [statsData, guildsData, adminsData, blacklistData, configData, errorsData] = await Promise.all([
        fetchAdminStats(),
        fetchAdminGuilds(),
        fetchGlobalAdmins(),
        fetchGlobalBlacklist(),
        fetchMaintenanceConfig(),
        fetchBotErrors()
      ]);
      stats = statsData;
      guilds = guildsData.guilds;
      globalAdmins = adminsData.admins;
      globalBlacklist = blacklistData.blacklist;
      maintenanceMode = configData.maintenance;
      botErrors = errorsData.errors;
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
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
        class="flex-1 min-w-[120px] px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all {activeTab === 'overview' ? 'bg-primary text-on-primary shadow-lg shadow-primary/20' : 'text-on-surface-variant hover:bg-on-surface/5 hover:text-on-surface'}"
      >
        <Papicon icon="activity" size={20} /> Vue d'ensemble
      </button>
      <button 
        onclick={() => activeTab = 'servers'}
        class="flex-1 min-w-[120px] px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all {activeTab === 'servers' ? 'bg-primary text-on-primary shadow-lg shadow-primary/20' : 'text-on-surface-variant hover:bg-on-surface/5 hover:text-on-surface'}"
      >
        <Papicon icon="Server" size={20} /> Serveurs ({stats.guildCount})
      </button>
      <button 
        onclick={() => activeTab = 'security'}
        class="flex-1 min-w-[120px] px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all {activeTab === 'security' ? 'bg-primary text-on-primary shadow-lg shadow-primary/20' : 'text-on-surface-variant hover:bg-on-surface/5 hover:text-on-surface'}"
      >
        <Papicon icon="ShieldCheck" size={20} /> Sécurité
      </button>
      <button 
        onclick={() => activeTab = 'config'}
        class="flex-1 min-w-[120px] px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all {activeTab === 'config' ? 'bg-primary text-on-primary shadow-lg shadow-primary/20' : 'text-on-surface-variant hover:bg-on-surface/5 hover:text-on-surface'}"
      >
        <Papicon icon="Settings" size={20} /> Avancé
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
                  class="flex-1 bg-surface/50 border border-outline-variant/20 rounded-xl px-4 py-4 text-sm focus:outline-none focus:border-blue-500/50 text-on-surface transition-colors resize-none min-h-[120px]"
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
                    <td class="px-8 py-5 text-sm font-medium text-on-surface-variant/60">
                      {new Date(guild.joinedAt).toLocaleDateString('fr-FR')}
                    </td>
                    <td class="px-8 py-5 text-right">
                      <div class="flex items-center justify-end gap-2">
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
            
            <div class="premium-card rounded-[2.25rem] p-6 h-[400px] flex flex-col bg-[#0d1117] border-red-500/20">
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
                    <div class="text-red-400 break-words">{err.message}</div>
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
    </div>
  {/if}
</div>

<style>
  table {
    border-collapse: separate;
    border-spacing: 0;
  }
</style>

