<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import { toast } from '../lib/stores/toast.svelte';
  import { API_BASE_URL, fetchMcpKeys, createMcpKey, deleteMcpKey } from '../lib/api';
  import Modal from '../lib/components/Modal.svelte';
  import ConfirmModal from '../lib/components/ConfirmModal.svelte';
  import Papicon from '../lib/components/Papicon.svelte';

  const PERMISSIONS = [
    { value: 'READ_STATS',      label: 'Statistiques du serveur',  desc: 'Accès aux stats (membres, messages, sanctions)' },
    { value: 'READ_MEMBERS',    label: 'Profils membres',           desc: 'Profils, recherche, messages récents' },
    { value: 'READ_SANCTIONS',  label: 'Sanctions',                 desc: 'Liste et historique des sanctions' },
    { value: 'READ_STAFF',      label: 'Staff',                     desc: 'Liste et profils du staff' },
    { value: 'READ_TICKETS',    label: 'Tickets',                   desc: 'Liste des tickets de support' },
    { value: 'WRITE_SANCTIONS', label: '⚠ Appliquer des sanctions', desc: 'Permet à l\'IA d\'appliquer des sanctions' },
  ] as const;

  type McpKey = {
    id: string;
    name: string;
    displayKey: string;
    permissions: string[];
    lastUsedAt: string | null;
    createdAt: string;
  };

  let keys = $state<McpKey[]>([]);
  let loading = $state(true);

  // Create modal
  let createOpen = $state(false);
  let newKeyName = $state('');
  let newKeyPerms = $state<string[]>(['READ_STATS', 'READ_MEMBERS', 'READ_SANCTIONS']);
  let creating = $state(false);
  let createdKey = $state<{ fullKey: string; name: string } | null>(null);
  let copied = $state(false);

  // Delete modal
  let deleteOpen = $state(false);
  let deletingKeyId = $state<string | null>(null);
  let deletingKeyName = $state('');

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
    if (newKeyPerms.includes(perm)) {
      newKeyPerms = newKeyPerms.filter((p) => p !== perm);
    } else {
      newKeyPerms = [...newKeyPerms, perm];
    }
  }

  async function handleCreate() {
    if (!newKeyName.trim()) return;
    creating = true;
    try {
      const result = await createMcpKey({ name: newKeyName.trim(), permissions: newKeyPerms });
      if (result?.fullKey) {
        createdKey = { fullKey: result.fullKey, name: result.name };
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
    copied = false;
  }

  async function copyKey(text: string) {
    await navigator.clipboard.writeText(text).catch(() => {});
    copied = true;
    setTimeout(() => { copied = false; }, 2000);
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
      toast.success('Clé MCP supprimée');
    } catch {
      toast.error('Erreur lors de la suppression');
    } finally {
      deletingKeyId = null;
      deletingKeyName = '';
    }
  }

  function formatDate(iso: string | null) {
    if (!iso) return 'Jamais';
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function permLabel(perm: string) {
    return PERMISSIONS.find((p) => p.value === perm)?.label ?? perm;
  }
</script>

<div class="space-y-8 max-w-4xl">

  <!-- Header -->
  <div>
    <h1 class="text-2xl font-bold text-white">MCP (Model Context Protocol)</h1>
    <p class="mt-1 text-sm text-gray-400">
      Permet à des agents IA de lire les données de ton serveur Discord et d'effectuer des actions via le protocole MCP.
    </p>
  </div>

  <!-- Endpoint URL -->
  <div class="bg-[#1a1d23] border border-white/8 rounded-xl p-5 space-y-3">
    <div class="flex items-center gap-2 text-sm font-medium text-gray-300">
      <Papicon name="Link" size={16} class="text-primary" />
      Endpoint MCP
    </div>
    <div class="flex items-center gap-2">
      <code class="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 font-mono break-all">
        {endpointUrl || 'Sélectionne un serveur pour voir l\'URL'}
      </code>
      {#if endpointUrl}
        <button
          onclick={() => copyKey(endpointUrl)}
          class="shrink-0 px-3 py-2 rounded-lg border border-white/10 text-sm text-gray-300 hover:bg-white/5 transition-colors"
        >
          {copied ? 'Copié !' : 'Copier'}
        </button>
      {/if}
    </div>
    <p class="text-xs text-gray-500">
      Utilise cette URL avec <code class="text-gray-400">Authorization: Bearer mcp_...</code> dans ton client MCP.
    </p>
  </div>

  <!-- Keys section -->
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-base font-semibold text-white">Clés API MCP</h2>
      <button
        onclick={() => { createOpen = true; createdKey = null; }}
        class="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-primary/20"
      >
        <Papicon name="Plus" size={16} />
        Créer une clé
      </button>
    </div>

    {#if loading}
      <div class="flex items-center justify-center py-12 text-gray-500">
        <Papicon name="Loader2" size={20} class="animate-spin mr-2" />
        Chargement…
      </div>
    {:else if keys.length === 0}
      <div class="bg-[#1a1d23] border border-white/8 rounded-xl p-10 text-center">
        <Papicon name="Key" size={32} class="text-gray-600 mx-auto mb-3" />
        <p class="text-gray-400 text-sm">Aucune clé MCP configurée.</p>
        <p class="text-gray-600 text-xs mt-1">Crée une clé pour connecter ton agent IA.</p>
      </div>
    {:else}
      <div class="bg-[#1a1d23] border border-white/8 rounded-xl overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-white/8 text-gray-500 text-xs">
              <th class="text-left px-4 py-3 font-medium">Nom</th>
              <th class="text-left px-4 py-3 font-medium">Clé (masquée)</th>
              <th class="text-left px-4 py-3 font-medium">Permissions</th>
              <th class="text-left px-4 py-3 font-medium">Dernière utilisation</th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {#each keys as key (key.id)}
              <tr class="border-b border-white/5 last:border-0 hover:bg-white/2 transition-colors">
                <td class="px-4 py-3 font-medium text-white">{key.name}</td>
                <td class="px-4 py-3 font-mono text-gray-400">{key.displayKey}</td>
                <td class="px-4 py-3">
                  <div class="flex flex-wrap gap-1">
                    {#each key.permissions as perm}
                      <span class="px-2 py-0.5 rounded-full text-xs font-medium
                        {perm === 'WRITE_SANCTIONS' ? 'bg-red-500/15 text-red-400' : 'bg-primary/15 text-primary'}">
                        {permLabel(perm)}
                      </span>
                    {/each}
                  </div>
                </td>
                <td class="px-4 py-3 text-gray-500 text-xs">{formatDate(key.lastUsedAt)}</td>
                <td class="px-4 py-3">
                  <button
                    onclick={() => confirmDelete(key)}
                    class="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Supprimer"
                  >
                    <Papicon name="Trash2" size={15} />
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>

<!-- Create Modal -->
<Modal bind:open={createOpen} onClose={closeCreateModal} title={createdKey ? 'Clé créée !' : 'Créer une clé MCP'}>
  {#if createdKey}
    <div class="space-y-4">
      <div class="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
        <Papicon name="AlertTriangle" size={16} class="text-amber-400 shrink-0" />
        <p class="text-sm text-amber-300">
          Copie cette clé maintenant. Elle ne sera <strong>plus jamais affichée</strong>.
        </p>
      </div>
      <div>
        <label class="block text-xs text-gray-500 mb-1">Clé pour <strong class="text-gray-300">{createdKey.name}</strong></label>
        <div class="flex items-center gap-2">
          <code class="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-green-400 break-all">
            {createdKey.fullKey}
          </code>
          <button
            onclick={() => copyKey(createdKey!.fullKey)}
            class="shrink-0 px-3 py-2 rounded-lg border border-white/10 text-sm text-gray-300 hover:bg-white/5 transition-colors"
          >
            {copied ? 'Copié !' : 'Copier'}
          </button>
        </div>
      </div>
      <button onclick={closeCreateModal} class="w-full py-2 rounded-lg bg-primary hover:bg-primary/90 text-white text-sm font-medium transition-colors">
        C'est fait, j'ai copié la clé
      </button>
    </div>
  {:else}
    <div class="space-y-5">
      <div>
        <label class="block text-sm font-medium text-gray-300 mb-1.5">Nom de la clé</label>
        <input
          type="text"
          bind:value={newKeyName}
          placeholder="Ex: Claude Desktop, Mon agent IA…"
          class="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary/50"
        />
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-300 mb-2">Permissions</label>
        <div class="space-y-2">
          {#each PERMISSIONS as perm}
            <label class="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors
              {newKeyPerms.includes(perm.value)
                ? perm.value === 'WRITE_SANCTIONS' ? 'border-red-500/30 bg-red-500/5' : 'border-primary/30 bg-primary/5'
                : 'border-white/8 hover:border-white/15'}">
              <input
                type="checkbox"
                checked={newKeyPerms.includes(perm.value)}
                onchange={() => togglePerm(perm.value)}
                class="mt-0.5 accent-primary"
              />
              <div>
                <span class="text-sm font-medium text-white">{perm.label}</span>
                <p class="text-xs text-gray-500 mt-0.5">{perm.desc}</p>
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
        {creating ? 'Création…' : 'Créer la clé'}
      </button>
    </div>
  {/if}
</Modal>

<!-- Delete Confirm -->
<ConfirmModal
  bind:open={deleteOpen}
  title="Supprimer la clé MCP"
  description="La clé «{deletingKeyName}» sera désactivée immédiatement. Les clients qui l'utilisent perdront l'accès."
  variant="danger"
  confirmLabel="Supprimer"
  onConfirm={handleDelete}
/>
