<script lang="ts">
  import { onMount } from 'svelte';
  import { toast } from '../../lib/stores/toast.svelte';
  import { fetchGlobalAdmins, addGlobalAdmin, removeGlobalAdmin, fetchGlobalBlacklist, addGlobalBlacklist, removeGlobalBlacklist } from '../../lib/api';
  import Papicon from '../../lib/components/Papicon.svelte';
  import Skeleton from '../../lib/components/Skeleton.svelte';
  import AdminLayout from '../../lib/components/AdminLayout.svelte';

  interface GlobalAdmin {
    userId: string;
    username: string;
    avatarUrl: string | null;
    addedBy: string;
    createdAt: string;
    expiresAt: string | null;
    remainingMinutes: number | null;
    isTemporary: boolean;
    reason: string | null;
  }

  interface BlacklistEntry {
    userId: string;
    username: string;
    avatarUrl: string | null;
    reason: string | null;
    addedBy: string;
    createdAt: string;
  }

  const OWNER_ID = '457275321171968000';

  let globalAdmins = $state<GlobalAdmin[]>([]);
  let globalBlacklist = $state<BlacklistEntry[]>([]);
  const DURATION_PRESETS = [
    { label: '30 min', minutes: 30 },
    { label: '1h', minutes: 60 },
    { label: '2h', minutes: 120 },
    { label: '6h', minutes: 360 },
    { label: '12h', minutes: 720 },
    { label: '24h', minutes: 1440 },
    { label: '3 jours', minutes: 4320 },
    { label: '7 jours', minutes: 10080 },
    { label: '30 jours', minutes: 43200 },
  ];

  let newAdminId = $state('');
  let newAdminDuration = $state(60);
  let newAdminReason = $state('');
  let newBlacklistId = $state('');
  let newBlacklistReason = $state('');
  let loading = $state(true);
  let error = $state<string | null>(null);
  let adminTab = $state<'admins' | 'blacklist'>('admins');

  function formatRemaining(minutes: number | null): string {
    if (minutes === null) return '';
    if (minutes <= 0) return 'Expiré';
    if (minutes < 60) return `${minutes}min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h < 24) return m > 0 ? `${h}h ${m}min` : `${h}h`;
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return rh > 0 ? `${d}j ${rh}h` : `${d}j`;
  }

  onMount(async () => {
    try {
      const [adminsData, blacklistData] = await Promise.all([
        fetchGlobalAdmins(),
        fetchGlobalBlacklist()
      ]);
      globalAdmins = adminsData.admins;
      globalBlacklist = blacklistData.blacklist;
    } catch (err: any) {
      error = err.message;
    } finally {
      loading = false;
    }
  });

  async function handleAddAdmin(e: Event) {
    e.preventDefault();
    if (!newAdminId.trim()) return;
    try {
      await addGlobalAdmin(newAdminId.trim(), newAdminDuration, newAdminReason.trim() || undefined);
      newAdminId = '';
      newAdminReason = '';
      newAdminDuration = 60;
      const data = await fetchGlobalAdmins();
      globalAdmins = data.admins;
      toast.success('Accès temporaire accordé.');
    } catch (err: any) { toast.error(err.message); }
  }

  async function handleRemoveAdmin(userId: string, username: string) {
    if (!confirm(`Retirer l'accès global à ${username} ?`)) return;
    try {
      await removeGlobalAdmin(userId);
      globalAdmins = globalAdmins.filter(a => a.userId !== userId);
      toast.success(`Accès révoqué pour ${username}.`);
    } catch (err: any) { toast.error(err.message); }
  }

  async function handleAddBlacklist(e: Event) {
    e.preventDefault();
    if (!newBlacklistId.trim()) return;
    try {
      await addGlobalBlacklist(newBlacklistId.trim(), newBlacklistReason.trim());
      newBlacklistId = '';
      newBlacklistReason = '';
      const data = await fetchGlobalBlacklist();
      globalBlacklist = data.blacklist;
      toast.success('Utilisateur ajouté à la blacklist.');
    } catch (err: any) { toast.error(err.message); }
  }

  async function handleRemoveBlacklist(userId: string) {
    if (!confirm('Retirer cet utilisateur de la blacklist globale ?')) return;
    try {
      await removeGlobalBlacklist(userId);
      globalBlacklist = globalBlacklist.filter(b => b.userId !== userId);
      toast.success('Utilisateur retiré de la blacklist.');
    } catch (err: any) { toast.error(err.message); }
  }
</script>

<AdminLayout>
  <div class="space-y-6 pb-12 animate-in fade-in slide-in-from-bottom-3 duration-600">

    <!-- Page header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h2 class="text-2xl font-black text-on-surface tracking-tight">Sécurité</h2>
        <p class="text-sm text-on-surface-variant/50 mt-0.5 font-medium">Administrateurs globaux et blacklist universelle</p>
      </div>
      <!-- Stats summary -->
      {#if !loading && !error}
        <div class="flex items-center gap-2 flex-wrap">
          <div class="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-black">
            <Papicon icon="ShieldCheck" size={13} />
            {globalAdmins.length} admin{globalAdmins.length > 1 ? 's' : ''}
          </div>
          <div class="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-black">
            <Papicon icon="UserX" size={13} />
            {globalBlacklist.length} blacklisté{globalBlacklist.length > 1 ? 's' : ''}
          </div>
        </div>
      {/if}
    </div>

    <!-- Tabs -->
    <div class="flex gap-1 p-1 bg-on-surface/5 rounded-xl w-fit border border-outline-variant/10">
      <button
        onclick={() => adminTab = 'admins'}
        class="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black transition-all duration-200
          {adminTab === 'admins' ? 'bg-surface-container text-on-surface shadow-sm' : 'text-on-surface-variant/50 hover:text-on-surface'}"
      >
        <Papicon icon="ShieldCheck" size={13} />
        Administrateurs
      </button>
      <button
        onclick={() => adminTab = 'blacklist'}
        class="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black transition-all duration-200
          {adminTab === 'blacklist' ? 'bg-surface-container text-on-surface shadow-sm' : 'text-on-surface-variant/50 hover:text-on-surface'}"
      >
        <Papicon icon="UserX" size={13} />
        Blacklist
        {#if globalBlacklist.length > 0}
          <span class="px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[9px] font-black">{globalBlacklist.length}</span>
        {/if}
      </button>
    </div>

    {#if loading}
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {#each Array(4) as _}
          <Skeleton height="72px" class="rounded-xl" />
        {/each}
      </div>

    {:else if error}
      <div class="flex flex-col items-center justify-center py-16 gap-4 text-center bg-error/5 border border-error/15 rounded-2xl">
        <div class="w-12 h-12 rounded-2xl bg-error/10 border border-error/20 flex items-center justify-center text-error">
          <Papicon icon="AlertTriangle" size={22} />
        </div>
        <div>
          <p class="font-black text-on-surface">Erreur de chargement</p>
          <p class="text-sm text-on-surface-variant/60 mt-1">{error}</p>
        </div>
      </div>

    {:else if adminTab === 'admins'}
      <!-- Global Admins panel -->
      <div class="bg-surface-container-low/50 border border-outline-variant/10 rounded-2xl p-6 space-y-5">
        <!-- Add form -->
        <div>
          <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 mb-2">Accorder un accès temporaire</p>
          <form onsubmit={handleAddAdmin} class="space-y-2">
            <div class="flex gap-2">
              <input
                type="text"
                bind:value={newAdminId}
                placeholder="ID Discord (ex: 457275321171968000)"
                class="flex-1 bg-on-surface/4 border border-outline-variant/10 rounded-xl px-4 py-2.5 text-sm text-on-surface placeholder-on-surface-variant/30 focus:outline-none focus:border-primary/30 transition-all"
                required
              />
              <select
                bind:value={newAdminDuration}
                class="bg-on-surface/4 border border-outline-variant/10 rounded-xl px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:border-primary/30 transition-all"
              >
                {#each DURATION_PRESETS as preset}
                  <option value={preset.minutes}>{preset.label}</option>
                {/each}
              </select>
            </div>
            <div class="flex gap-2">
              <input
                type="text"
                bind:value={newAdminReason}
                placeholder="Raison de l'accès (optionnel)"
                class="flex-1 bg-on-surface/4 border border-outline-variant/10 rounded-xl px-4 py-2.5 text-sm text-on-surface placeholder-on-surface-variant/30 focus:outline-none focus:border-primary/30 transition-all"
              />
              <button
                type="submit"
                class="px-5 py-2.5 rounded-xl bg-primary text-on-primary text-xs font-black uppercase tracking-widest hover:scale-[1.02] transition-all shadow-md shadow-primary/20"
              >
                Accorder
              </button>
            </div>
          </form>
        </div>

        <!-- Admin list -->
        <div class="space-y-2">
          {#if globalAdmins.length === 0}
            <p class="text-sm text-center text-on-surface-variant/40 py-6 font-medium">Aucun administrateur global.</p>
          {:else}
            {#each globalAdmins as admin}
              <div class="flex items-center justify-between px-4 py-3 bg-on-surface/3 hover:bg-on-surface/5 rounded-xl border border-outline-variant/8 transition-colors group">
                <div class="flex items-center gap-3">
                  {#if admin.avatarUrl}
                    <img src={admin.avatarUrl} alt={admin.username} class="w-9 h-9 rounded-full border border-outline-variant/10 shadow-sm" />
                  {:else}
                    <div class="w-9 h-9 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center text-primary font-black text-sm">
                      {admin.username.charAt(0).toUpperCase()}
                    </div>
                  {/if}
                  <div>
                    <p class="font-bold text-sm text-on-surface">{admin.username}</p>
                    <p class="text-[10px] text-on-surface-variant/30 font-mono">{admin.userId}</p>
                    {#if admin.reason}
                      <p class="text-[10px] text-on-surface-variant/50 italic mt-0.5">{admin.reason}</p>
                    {/if}
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  {#if admin.userId === OWNER_ID}
                    <span class="text-[9px] uppercase font-black tracking-widest text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">Créateur</span>
                  {:else if admin.isTemporary}
                    <span class="text-[9px] uppercase font-black tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full flex items-center gap-1">
                      <Papicon icon="Clock" size={10} />
                      {formatRemaining(admin.remainingMinutes)}
                    </span>
                    <button
                      onclick={() => handleRemoveAdmin(admin.userId, admin.username)}
                      class="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant/30 hover:bg-red-500/10 hover:text-red-400 transition-all opacity-0 group-hover:opacity-100"
                      title="Révoquer l'accès"
                    >
                      <Papicon icon="Trash" size={14} />
                    </button>
                  {:else}
                    <button
                      onclick={() => handleRemoveAdmin(admin.userId, admin.username)}
                      class="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant/30 hover:bg-red-500/10 hover:text-red-400 transition-all opacity-0 group-hover:opacity-100"
                      title="Révoquer l'accès"
                    >
                      <Papicon icon="Trash" size={14} />
                    </button>
                  {/if}
                </div>
              </div>
            {/each}
          {/if}
        </div>
      </div>

    {:else}
      <!-- Blacklist panel -->
      <div class="bg-surface-container-low/50 border border-outline-variant/10 rounded-2xl p-6 space-y-5">
        <!-- Add form -->
        <div class="space-y-2">
          <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Ajouter à la blacklist</p>
          <form onsubmit={handleAddBlacklist} class="space-y-2">
            <input
              type="text"
              bind:value={newBlacklistId}
              placeholder="ID Discord à bloquer"
              class="w-full bg-on-surface/4 border border-outline-variant/10 rounded-xl px-4 py-2.5 text-sm text-on-surface placeholder-on-surface-variant/30 focus:outline-none focus:border-red-500/30 transition-all"
              required
            />
            <div class="flex gap-2">
              <input
                type="text"
                bind:value={newBlacklistReason}
                placeholder="Raison (optionnel)"
                class="flex-1 bg-on-surface/4 border border-outline-variant/10 rounded-xl px-4 py-2.5 text-sm text-on-surface placeholder-on-surface-variant/30 focus:outline-none focus:border-red-500/30 transition-all"
              />
              <button
                type="submit"
                class="px-5 py-2.5 rounded-xl bg-red-500 text-white text-xs font-black uppercase tracking-widest hover:bg-red-600 transition-all shadow-md shadow-red-500/20"
              >
                Bannir
              </button>
            </div>
          </form>
        </div>

        <!-- Blacklist entries -->
        <div class="space-y-2">
          {#if globalBlacklist.length === 0}
            <div class="flex flex-col items-center py-8 gap-2 text-center">
              <div class="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/15 flex items-center justify-center text-emerald-400">
                <Papicon icon="ShieldCheck" size={18} />
              </div>
              <p class="text-sm text-on-surface-variant/40 font-medium">Aucun utilisateur dans la blacklist.</p>
            </div>
          {:else}
            {#each globalBlacklist as user}
              <div class="flex items-start justify-between px-4 py-3 bg-red-500/5 hover:bg-red-500/8 rounded-xl border border-red-500/10 transition-colors group">
                <div class="flex items-center gap-3">
                  {#if user.avatarUrl}
                    <img src={user.avatarUrl} alt={user.username} class="w-9 h-9 rounded-full border border-red-500/20 shadow-sm" />
                  {:else}
                    <div class="w-9 h-9 rounded-full bg-red-500/15 border border-red-500/20 flex items-center justify-center text-red-400 font-black text-sm">
                      {user.username.charAt(0).toUpperCase()}
                    </div>
                  {/if}
                  <div>
                    <p class="font-bold text-sm text-on-surface">{user.username}</p>
                    <p class="text-[10px] text-on-surface-variant/30 font-mono">{user.userId}</p>
                    {#if user.reason}
                      <p class="text-[10px] text-red-400/70 mt-0.5 italic">{user.reason}</p>
                    {/if}
                  </div>
                </div>
                <button
                  onclick={() => handleRemoveBlacklist(user.userId)}
                  class="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant/30 hover:bg-emerald-500/10 hover:text-emerald-400 transition-all opacity-0 group-hover:opacity-100 shrink-0"
                  title="Pardonner"
                >
                  <Papicon icon="Unlock" size={14} />
                </button>
              </div>
            {/each}
          {/if}
        </div>
      </div>
    {/if}
  </div>
</AdminLayout>
