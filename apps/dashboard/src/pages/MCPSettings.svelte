<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import { toast } from '../lib/stores/toast.svelte';
  import { API_BASE_URL, fetchMcpKeys, createMcpKey, deleteMcpKey } from '../lib/api';
  import Modal from '../lib/components/Modal.svelte';
  import ConfirmModal from '../lib/components/ConfirmModal.svelte';
  import Papicon from '../lib/components/Papicon.svelte';

  const PERMISSIONS = [
    { value: 'READ_STATS',      label: 'Stats serveur',   desc: 'Membres, messages, activité' },
    { value: 'READ_MEMBERS',    label: 'Membres',          desc: 'Profils, recherche, messages récents' },
    { value: 'READ_SANCTIONS',  label: 'Sanctions',        desc: 'Liste et historique' },
    { value: 'READ_STAFF',      label: 'Staff',            desc: 'Liste et profils du staff' },
    { value: 'READ_TICKETS',    label: 'Tickets',          desc: 'Liste des tickets ouverts' },
    { value: 'WRITE_SANCTIONS', label: 'Sanctionner',      desc: '⚠ Appliquer des sanctions via IA' },
  ] as const;

  type McpKey = {
    id: string;
    name: string;
    displayKey: string;
    permissions: string[];
    lastUsedAt: string | null;
    createdAt: string;
  };

  type CreatedKey = {
    clientId: string;
    clientSecret: string;
    name: string;
  };

  let keys = $state<McpKey[]>([]);
  let loading = $state(true);

  // Create modal
  let createOpen = $state(false);
  let newKeyName = $state('');
  let newKeyPerms = $state<string[]>(['READ_STATS', 'READ_MEMBERS', 'READ_SANCTIONS']);
  let creating = $state(false);
  let createdKey = $state<CreatedKey | null>(null);

  // Delete modal
  let deleteOpen = $state(false);
  let deletingKeyId = $state<string | null>(null);
  let deletingKeyName = $state('');

  // Copy state
  let copiedField = $state<string | null>(null);

  // Expanded row for credentials
  let expandedKeyId = $state<string | null>(null);

  const guildId = $derived(authStore.selectedGuildId ?? '');
  const endpointUrl = $derived(guildId ? `${API_BASE_URL}/api/mcp/${guildId}` : '');

  onMount(async () => {
    await loadKeys();
  });

  async function loadKeys() {
    loading = true;
    try {
      const result = await fetchMcpKeys();
      keys = Array.isArray(result) ? result : [];
    } catch {
      toast.error('Erreur lors du chargement des clés MCP');
    } finally {
      loading = false;
    }
  }

  function togglePerm(perm: string) {
    newKeyPerms = newKeyPerms.includes(perm)
      ? newKeyPerms.filter((p) => p !== perm)
      : [...newKeyPerms, perm];
  }

  async function handleCreate() {
    if (!newKeyName.trim()) return;
    creating = true;
    try {
      const result = await createMcpKey({ name: newKeyName.trim(), permissions: newKeyPerms });
      if (result?.fullKey) {
        createdKey = { clientId: result.id, clientSecret: result.fullKey, name: result.name };
        keys = [{ id: result.id, name: result.name, displayKey: result.displayKey, permissions: result.permissions, lastUsedAt: null, createdAt: result.createdAt }, ...keys];
        newKeyName = '';
        newKeyPerms = ['READ_STATS', 'READ_MEMBERS', 'READ_SANCTIONS'];
      }
    } catch {
      toast.error('Erreur lors de la création de la clé');
    } finally {
      creating = false;
    }
  }

  function closeCreateModal() {
    createOpen = false;
    createdKey = null;
    copiedField = null;
  }

  async function copy(text: string, field: string) {
    await navigator.clipboard.writeText(text).catch(() => {});
    copiedField = field;
    setTimeout(() => { copiedField = null; }, 2000);
  }

  function confirmDelete(key: McpKey) {
    deletingKeyId = key.id;
    deletingKeyName = key.name;
    deleteOpen = true;
  }

  async function handleDelete() {
    if (!deletingKeyId) return;
    try {
      await deleteMcpKey(deletingKeyId);
      keys = keys.filter((k) => k.id !== deletingKeyId);
      if (expandedKeyId === deletingKeyId) expandedKeyId = null;
      toast.success('Clé MCP révoquée');
    } catch {
      toast.error('Erreur lors de la suppression');
    } finally {
      deletingKeyId = null;
      deletingKeyName = '';
    }
  }

  function formatDate(iso: string | null) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function permLabel(perm: string) {
    return PERMISSIONS.find((p) => p.value === perm)?.label ?? perm;
  }
</script>

<div class="max-w-4xl space-y-6">

  <!-- Header -->
  <div class="flex items-start justify-between">
    <div>
      <div class="flex items-center gap-2 mb-1">
        <h1 class="text-xl font-bold text-white">MCP — Model Context Protocol</h1>
        <span class="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/20 text-primary border border-primary/30">BETA</span>
      </div>
      <p class="text-sm text-gray-400">
        Connecte une IA (Claude, ChatGPT…) à ton bot pour interroger et piloter ton serveur Discord.
      </p>
    </div>
    <button
      onclick={() => { createOpen = true; createdKey = null; }}
      class="shrink-0 flex items-center gap-1.5 px-3.5 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-medium transition-colors shadow-sm shadow-primary/20"
    >
      <Papicon icon="plus" size={14} />
      Nouvelle clé
    </button>
  </div>

  <!-- Endpoint -->
  <div class="bg-[#1a1d23] border border-white/8 rounded-xl p-4">
    <p class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2.5">Endpoint MCP</p>
    <div class="flex items-center gap-2">
      <code class="flex-1 bg-black/40 border border-white/8 rounded-lg px-3 py-2.5 text-sm text-gray-200 font-mono break-all">
        {endpointUrl || '— sélectionne un serveur —'}
      </code>
      {#if endpointUrl}
        <button
          onclick={() => copy(endpointUrl, 'endpoint')}
          class="shrink-0 px-3 py-2.5 rounded-lg border border-white/10 text-xs text-gray-400 hover:text-white hover:border-white/20 transition-colors"
        >
          {copiedField === 'endpoint' ? '✓ Copié' : 'Copier'}
        </button>
      {/if}
    </div>
    <p class="text-xs text-gray-600 mt-2">
      Colle cette URL dans ton client IA. Le serveur supporte OAuth 2.0 (client_credentials) et Bearer token.
    </p>
  </div>

  <!-- Keys -->
  <div class="space-y-2">
    <h2 class="text-sm font-semibold text-white">Clés d'accès</h2>

    {#if loading}
      <div class="flex items-center justify-center py-12 text-gray-600 bg-[#1a1d23] border border-white/8 rounded-xl">
        <Papicon icon="loader-2" size={18} class="animate-spin mr-2" />
        <span class="text-sm">Chargement…</span>
      </div>

    {:else if keys.length === 0}
      <div class="bg-[#1a1d23] border border-white/8 rounded-xl p-10 text-center space-y-2">
        <Papicon icon="key" size={30} class="text-gray-700 mx-auto" />
        <p class="text-sm text-gray-500">Aucune clé configurée.</p>
        <p class="text-xs text-gray-700">Crée une clé pour connecter ton agent IA.</p>
      </div>

    {:else}
      <div class="bg-[#1a1d23] border border-white/8 rounded-xl overflow-hidden">
        {#each keys as key, i (key.id)}
          <!-- Key row -->
          <div class="border-b border-white/5 last:border-0">
            <div
              class="flex items-center gap-4 px-4 py-3.5 hover:bg-white/[0.02] transition-colors cursor-pointer"
              onclick={() => expandedKeyId = expandedKeyId === key.id ? null : key.id}
            >
              <!-- Status dot -->
              <div class="w-2 h-2 rounded-full bg-green-400 shrink-0"></div>

              <!-- Name -->
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-white">{key.name}</p>
                <p class="text-xs text-gray-600 mt-0.5">
                  Dernière utilisation : {formatDate(key.lastUsedAt)}
                </p>
              </div>

              <!-- Permissions -->
              <div class="hidden sm:flex flex-wrap gap-1 max-w-xs">
                {#each key.permissions as perm}
                  <span class="px-1.5 py-0.5 rounded text-[10px] font-medium
                    {perm === 'WRITE_SANCTIONS' ? 'bg-red-500/15 text-red-400' : 'bg-primary/12 text-primary/80'}">
                    {permLabel(perm)}
                  </span>
                {/each}
              </div>

              <!-- Chevron + delete -->
              <div class="flex items-center gap-2 shrink-0">
                <button
                  onclick={(e) => { e.stopPropagation(); confirmDelete(key); }}
                  class="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Révoquer"
                >
                  <Papicon icon="trash-2" size={13} />
                </button>
                <Papicon
                  icon="chevron-down"
                  size={14}
                  class="text-gray-600 transition-transform duration-200 {expandedKeyId === key.id ? 'rotate-180' : ''}"
                />
              </div>
            </div>

            <!-- Expanded credentials -->
            {#if expandedKeyId === key.id}
              <div class="px-4 pb-4 pt-1 border-t border-white/5 bg-black/20 space-y-3">
                <!-- Client ID -->
                <div class="space-y-1">
                  <p class="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Client ID</p>
                  <div class="flex items-center gap-2">
                    <code class="flex-1 bg-black/40 border border-white/8 rounded-lg px-3 py-2 text-xs font-mono text-gray-300 break-all">
                      {key.id}
                    </code>
                    <button
                      onclick={() => copy(key.id, `id-${key.id}`)}
                      class="shrink-0 px-2.5 py-2 rounded-lg border border-white/10 text-xs text-gray-400 hover:text-white transition-colors"
                    >
                      {copiedField === `id-${key.id}` ? '✓' : 'Copier'}
                    </button>
                  </div>
                </div>

                <!-- Client Secret (display key) -->
                <div class="space-y-1">
                  <p class="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                    Client Secret <span class="text-gray-700 normal-case font-normal">(affiché en clair à la création uniquement)</span>
                  </p>
                  <div class="flex items-center gap-2">
                    <code class="flex-1 bg-black/40 border border-white/8 rounded-lg px-3 py-2 text-xs font-mono text-gray-600 break-all">
                      {key.displayKey}
                    </code>
                  </div>
                </div>

                <!-- Endpoint for this guild -->
                <div class="space-y-1">
                  <p class="text-[11px] font-medium text-gray-500 uppercase tracking-wide">URL endpoint</p>
                  <div class="flex items-center gap-2">
                    <code class="flex-1 bg-black/40 border border-white/8 rounded-lg px-3 py-2 text-xs font-mono text-gray-300 break-all">
                      {endpointUrl}
                    </code>
                    <button
                      onclick={() => copy(endpointUrl, `url-${key.id}`)}
                      class="shrink-0 px-2.5 py-2 rounded-lg border border-white/10 text-xs text-gray-400 hover:text-white transition-colors"
                    >
                      {copiedField === `url-${key.id}` ? '✓' : 'Copier'}
                    </button>
                  </div>
                </div>

                <!-- Permissions list -->
                <div class="space-y-1">
                  <p class="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Permissions</p>
                  <div class="flex flex-wrap gap-1.5">
                    {#each key.permissions as perm}
                      <span class="px-2 py-1 rounded-lg text-xs font-medium
                        {perm === 'WRITE_SANCTIONS' ? 'bg-red-500/15 text-red-400 border border-red-500/20' : 'bg-primary/10 text-primary/80 border border-primary/15'}">
                        {permLabel(perm)}
                        <span class="text-gray-600 font-normal ml-1">— {PERMISSIONS.find(p => p.value === perm)?.desc}</span>
                      </span>
                    {/each}
                  </div>
                </div>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<!-- ── Create Modal ──────────────────────────────────────────────────────── -->
<Modal bind:open={createOpen} onClose={closeCreateModal} title={createdKey ? '🎉 Clé créée' : 'Nouvelle clé MCP'}>
  {#if createdKey}
    <div class="space-y-4">
      <div class="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
        <Papicon icon="alert-triangle" size={15} class="text-amber-400 shrink-0 mt-0.5" />
        <p class="text-xs text-amber-300 leading-relaxed">
          Copie ces informations maintenant. Le <strong>Client Secret</strong> ne sera <strong>plus jamais affiché</strong>.
        </p>
      </div>

      <!-- Client ID -->
      <div class="space-y-1.5">
        <div class="flex items-center gap-1.5 text-xs font-medium text-gray-400">
          <Papicon icon="hash" size={12} />
          Client ID
          <span class="text-gray-600 font-normal">(à coller dans "Client ID" ou "App ID")</span>
        </div>
        <div class="flex items-center gap-2">
          <code class="flex-1 bg-black/40 border border-white/8 rounded-lg px-3 py-2.5 text-xs font-mono text-gray-200 break-all">
            {createdKey.clientId}
          </code>
          <button
            onclick={() => copy(createdKey!.clientId, 'new-id')}
            class="shrink-0 px-2.5 py-2 rounded-lg border border-white/10 text-xs text-gray-400 hover:text-white transition-colors"
          >
            {copiedField === 'new-id' ? '✓' : 'Copier'}
          </button>
        </div>
      </div>

      <!-- Client Secret -->
      <div class="space-y-1.5">
        <div class="flex items-center gap-1.5 text-xs font-medium text-gray-400">
          <Papicon icon="key" size={12} />
          Client Secret
          <span class="text-gray-600 font-normal">(à coller dans "Client Secret" ou "Token")</span>
        </div>
        <div class="flex items-center gap-2">
          <code class="flex-1 bg-black/40 border border-primary/25 rounded-lg px-3 py-2.5 text-xs font-mono text-green-400 break-all">
            {createdKey.clientSecret}
          </code>
          <button
            onclick={() => copy(createdKey!.clientSecret, 'new-secret')}
            class="shrink-0 px-2.5 py-2 rounded-lg border border-white/10 text-xs text-gray-400 hover:text-white transition-colors"
          >
            {copiedField === 'new-secret' ? '✓' : 'Copier'}
          </button>
        </div>
      </div>

      <!-- Endpoint -->
      <div class="space-y-1.5">
        <div class="flex items-center gap-1.5 text-xs font-medium text-gray-400">
          <Papicon icon="globe" size={12} />
          URL du serveur MCP
        </div>
        <div class="flex items-center gap-2">
          <code class="flex-1 bg-black/40 border border-white/8 rounded-lg px-3 py-2.5 text-xs font-mono text-gray-300 break-all">
            {endpointUrl}
          </code>
          <button
            onclick={() => copy(endpointUrl, 'new-url')}
            class="shrink-0 px-2.5 py-2 rounded-lg border border-white/10 text-xs text-gray-400 hover:text-white transition-colors"
          >
            {copiedField === 'new-url' ? '✓' : 'Copier'}
          </button>
        </div>
      </div>

      <button onclick={closeCreateModal} class="w-full py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-white text-sm font-medium transition-colors">
        J'ai tout copié, fermer
      </button>
    </div>

  {:else}
    <div class="space-y-5">
      <div>
        <label for="key-name" class="block text-sm font-medium text-gray-300 mb-1.5">Nom de la clé</label>
        <input
          id="key-name"
          type="text"
          bind:value={newKeyName}
          placeholder="Ex: Claude.ai, Claude Desktop…"
          maxlength={64}
          class="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary/50 transition-colors"
        />
      </div>

      <div>
        <p class="text-sm font-medium text-gray-300 mb-2">Permissions</p>
        <div class="space-y-1.5">
          {#each PERMISSIONS as perm}
            <label
              for="perm-{perm.value}"
              class="flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-all
                {newKeyPerms.includes(perm.value)
                  ? perm.value === 'WRITE_SANCTIONS' ? 'border-red-500/30 bg-red-500/5' : 'border-primary/25 bg-primary/5'
                  : 'border-white/6 hover:border-white/12'}"
            >
              <input
                id="perm-{perm.value}"
                type="checkbox"
                checked={newKeyPerms.includes(perm.value)}
                onchange={() => togglePerm(perm.value)}
                class="mt-0.5 accent-primary"
              />
              <div>
                <span class="text-sm font-medium text-white">{perm.label}</span>
                <p class="text-xs text-gray-600 mt-0.5">{perm.desc}</p>
              </div>
            </label>
          {/each}
        </div>
      </div>

      <button
        onclick={handleCreate}
        disabled={!newKeyName.trim() || newKeyPerms.length === 0 || creating}
        class="w-full py-2.5 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
      >
        {creating ? 'Création…' : 'Générer la clé'}
      </button>
    </div>
  {/if}
</Modal>

<!-- ── Delete Confirm ────────────────────────────────────────────────────── -->
<ConfirmModal
  bind:open={deleteOpen}
  title="Révoquer la clé"
  description="La clé « {deletingKeyName} » sera désactivée immédiatement. Les agents IA qui l'utilisent perdront l'accès."
  variant="danger"
  confirmLabel="Révoquer"
  onConfirm={handleDelete}
/>
