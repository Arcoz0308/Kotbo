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

  // Copy state per field
  let copiedField = $state<string | null>(null);

  // Guide tab
  let guideTab = $state<'claude' | 'claudedesktop' | 'api'>('claude');

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
      toast.success('Clé MCP révoquée');
    } catch {
      toast.error('Erreur lors de la suppression');
    } finally {
      deletingKeyId = null;
      deletingKeyName = '';
    }
  }

  function formatDate(iso: string | null) {
    if (!iso) return 'Jamais utilisée';
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function permLabel(perm: string) {
    return PERMISSIONS.find((p) => p.value === perm)?.label ?? perm;
  }

  const claudeDesktopConfig = $derived(`{
  "mcpServers": {
    "kotbo": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "${endpointUrl || 'https://votre-api.com/api/mcp/GUILD_ID'}",
        "--header",
        "Authorization: Bearer mcp_VOTRE_CLE"
      ]
    }
  }
}`);
</script>

<div class="flex gap-6 max-w-6xl">

  <!-- ══════════════════════════ COLONNE GAUCHE ══════════════════════════ -->
  <div class="flex-1 min-w-0 space-y-6">

    <!-- Header -->
    <div>
      <div class="flex items-center gap-2 mb-1">
        <h1 class="text-xl font-bold text-white">MCP — Model Context Protocol</h1>
        <span class="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/20 text-primary border border-primary/30">BETA</span>
      </div>
      <p class="text-sm text-gray-400">
        Connecte ton bot à une IA (Claude, ChatGPT…) pour qu'elle interroge et pilote ton serveur Discord.
      </p>
    </div>

    <!-- Endpoint -->
    <div class="bg-[#1a1d23] border border-white/8 rounded-xl p-4 space-y-2.5">
      <p class="text-xs font-medium text-gray-500 uppercase tracking-wide">Endpoint MCP</p>
      <div class="flex items-center gap-2">
        <code class="flex-1 bg-black/40 border border-white/8 rounded-lg px-3 py-2 text-sm text-gray-200 font-mono break-all">
          {endpointUrl || '— sélectionne un serveur —'}
        </code>
        {#if endpointUrl}
          <button
            onclick={() => copy(endpointUrl, 'endpoint')}
            class="shrink-0 px-3 py-2 rounded-lg border border-white/10 text-xs text-gray-400 hover:text-white hover:border-white/20 transition-colors"
          >
            {copiedField === 'endpoint' ? '✓ Copié' : 'Copier'}
          </button>
        {/if}
      </div>
    </div>

    <!-- Keys section -->
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold text-white">Clés d'accès</h2>
        <button
          onclick={() => { createOpen = true; createdKey = null; }}
          class="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 text-white rounded-lg text-xs font-medium transition-colors shadow-sm shadow-primary/20"
        >
          <Papicon icon="plus" size={13} />
          Nouvelle clé
        </button>
      </div>

      {#if loading}
        <div class="flex items-center justify-center py-10 text-gray-600">
          <Papicon icon="loader-2" size={18} class="animate-spin mr-2" />
          <span class="text-sm">Chargement…</span>
        </div>
      {:else if keys.length === 0}
        <div class="bg-[#1a1d23] border border-white/8 rounded-xl p-8 text-center space-y-2">
          <Papicon icon="key" size={28} class="text-gray-700 mx-auto" />
          <p class="text-sm text-gray-500">Aucune clé configurée.</p>
          <p class="text-xs text-gray-700">Crée une clé pour connecter ton agent IA.</p>
        </div>
      {:else}
        <div class="bg-[#1a1d23] border border-white/8 rounded-xl overflow-hidden">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-white/6 text-gray-600 text-xs">
                <th class="text-left px-4 py-2.5 font-medium">Nom</th>
                <th class="text-left px-4 py-2.5 font-medium">Client ID</th>
                <th class="text-left px-4 py-2.5 font-medium">Permissions</th>
                <th class="text-left px-4 py-2.5 font-medium">Dernière utilisation</th>
                <th class="px-3 py-2.5 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {#each keys as key (key.id)}
                <tr class="border-b border-white/4 last:border-0 hover:bg-white/[0.02] transition-colors">
                  <td class="px-4 py-3 font-medium text-white text-sm">{key.name}</td>
                  <td class="px-4 py-3 font-mono text-xs text-gray-500">{key.id.slice(0, 12)}…</td>
                  <td class="px-4 py-3">
                    <div class="flex flex-wrap gap-1">
                      {#each key.permissions as perm}
                        <span class="px-1.5 py-0.5 rounded text-[10px] font-medium
                          {perm === 'WRITE_SANCTIONS' ? 'bg-red-500/15 text-red-400' : 'bg-primary/12 text-primary/80'}">
                          {permLabel(perm)}
                        </span>
                      {/each}
                    </div>
                  </td>
                  <td class="px-4 py-3 text-xs text-gray-600">{formatDate(key.lastUsedAt)}</td>
                  <td class="px-3 py-3">
                    <button
                      onclick={() => confirmDelete(key)}
                      class="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Révoquer"
                    >
                      <Papicon icon="trash-2" size={13} />
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

  <!-- ══════════════════════════ COLONNE DROITE — GUIDE ═════════════════ -->
  <div class="w-80 shrink-0 space-y-4">
    <div class="bg-[#1a1d23] border border-white/8 rounded-xl overflow-hidden">

      <!-- Tab header -->
      <div class="border-b border-white/8 flex text-xs">
        <button
          onclick={() => guideTab = 'claude'}
          class="flex-1 px-3 py-2.5 font-medium transition-colors
            {guideTab === 'claude' ? 'text-white border-b-2 border-primary bg-primary/5' : 'text-gray-500 hover:text-gray-300'}"
        >
          Claude.ai
        </button>
        <button
          onclick={() => guideTab = 'claudedesktop'}
          class="flex-1 px-3 py-2.5 font-medium transition-colors
            {guideTab === 'claudedesktop' ? 'text-white border-b-2 border-primary bg-primary/5' : 'text-gray-500 hover:text-gray-300'}"
        >
          Desktop
        </button>
        <button
          onclick={() => guideTab = 'api'}
          class="flex-1 px-3 py-2.5 font-medium transition-colors
            {guideTab === 'api' ? 'text-white border-b-2 border-primary bg-primary/5' : 'text-gray-500 hover:text-gray-300'}"
        >
          API / curl
        </button>
      </div>

      <!-- Tab content -->
      <div class="p-4 space-y-4 text-xs text-gray-400">

        {#if guideTab === 'claude'}
          <!-- Claude.ai guide -->
          <div class="flex items-center gap-2">
            <div class="w-6 h-6 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-[10px] font-bold shrink-0">1</div>
            <p>Crée une clé ci-contre → note le <span class="text-white font-mono">Client ID</span> et le <span class="text-white font-mono">Client Secret</span>.</p>
          </div>
          <div class="flex items-center gap-2">
            <div class="w-6 h-6 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-[10px] font-bold shrink-0">2</div>
            <p>Sur <strong class="text-gray-300">claude.ai</strong> → <strong class="text-gray-300">Paramètres → Connecteurs → Ajouter</strong></p>
          </div>
          <div class="flex items-center gap-2">
            <div class="w-6 h-6 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-[10px] font-bold shrink-0">3</div>
            <p>Colle l'URL du serveur MCP :</p>
          </div>
          <div class="relative">
            <code class="block bg-black/40 border border-white/8 rounded-lg p-2.5 font-mono text-[10px] text-gray-300 break-all leading-relaxed">
              {endpointUrl || 'https://votre-api.com/api/mcp/GUILD_ID'}
            </code>
            {#if endpointUrl}
              <button onclick={() => copy(endpointUrl, 'guide-endpoint')} class="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[9px] border border-white/10 text-gray-500 hover:text-white bg-black/30 transition-colors">
                {copiedField === 'guide-endpoint' ? '✓' : 'Copier'}
              </button>
            {/if}
          </div>
          <div class="flex items-center gap-2">
            <div class="w-6 h-6 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-[10px] font-bold shrink-0">4</div>
            <p>Claude.ai te demande un <strong class="text-gray-300">Client ID</strong> et un <strong class="text-gray-300">Client Secret</strong> → colle ceux de ta clé.</p>
          </div>
          <div class="flex items-center gap-2">
            <div class="w-6 h-6 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-[10px] font-bold shrink-0">5</div>
            <p>C'est bon ! Tu peux maintenant demander à Claude des infos sur ton serveur Discord.</p>
          </div>
          <div class="mt-1 p-2.5 bg-blue-500/8 border border-blue-500/20 rounded-lg text-blue-300/80 text-[10px] leading-relaxed">
            💡 Le <strong>Client ID</strong> s'affiche dans la colonne "Client ID" du tableau. Le <strong>Client Secret</strong> n'est visible qu'à la création.
          </div>

        {:else if guideTab === 'claudedesktop'}
          <!-- Claude Desktop guide -->
          <div class="flex items-center gap-2">
            <div class="w-6 h-6 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center text-[10px] font-bold shrink-0">1</div>
            <p>Installe <code class="text-gray-300">mcp-remote</code> si besoin :</p>
          </div>
          <div class="relative">
            <code class="block bg-black/40 border border-white/8 rounded-lg p-2.5 font-mono text-[10px] text-gray-300">
              npm install -g mcp-remote
            </code>
            <button onclick={() => copy('npm install -g mcp-remote', 'install')} class="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[9px] border border-white/10 text-gray-500 hover:text-white bg-black/30 transition-colors">
              {copiedField === 'install' ? '✓' : 'Copier'}
            </button>
          </div>
          <div class="flex items-center gap-2">
            <div class="w-6 h-6 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center text-[10px] font-bold shrink-0">2</div>
            <p>Ouvre <code class="text-gray-300">claude_desktop_config.json</code> et ajoute :</p>
          </div>
          <div class="relative">
            <pre class="bg-black/40 border border-white/8 rounded-lg p-2.5 font-mono text-[10px] text-gray-300 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">{claudeDesktopConfig}</pre>
            <button onclick={() => copy(claudeDesktopConfig, 'desktop-config')} class="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[9px] border border-white/10 text-gray-500 hover:text-white bg-black/30 transition-colors">
              {copiedField === 'desktop-config' ? '✓' : 'Copier'}
            </button>
          </div>
          <div class="flex items-center gap-2">
            <div class="w-6 h-6 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center text-[10px] font-bold shrink-0">3</div>
            <p>Remplace <code class="text-gray-300">mcp_VOTRE_CLE</code> par ton Client Secret et redémarre Claude Desktop.</p>
          </div>
          <div class="p-2.5 bg-violet-500/8 border border-violet-500/20 rounded-lg text-violet-300/80 text-[10px] leading-relaxed">
            📁 Config : <code>%APPDATA%\Claude\claude_desktop_config.json</code> (Windows) ou <code>~/.config/claude/claude_desktop_config.json</code> (Linux/Mac)
          </div>

        {:else}
          <!-- API / curl guide -->
          <p class="text-gray-500">Teste directement avec <code class="text-gray-300">curl</code> :</p>

          <div class="space-y-1.5">
            <p class="text-[10px] text-gray-600 uppercase tracking-wide font-medium">Lister les outils disponibles</p>
            <div class="relative">
              <pre class="bg-black/40 border border-white/8 rounded-lg p-2.5 font-mono text-[10px] text-gray-300 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">curl -X POST {endpointUrl || 'URL_ENDPOINT'} \
  -H "Authorization: Bearer mcp_CLE" \
  -H "Content-Type: application/json" \
  -d '{`{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}`}'</pre>
            </div>
          </div>

          <div class="space-y-1.5">
            <p class="text-[10px] text-gray-600 uppercase tracking-wide font-medium">Obtenir un token OAuth (pour Claude.ai)</p>
            <div class="relative">
              <pre class="bg-black/40 border border-white/8 rounded-lg p-2.5 font-mono text-[10px] text-gray-300 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">curl -X POST {endpointUrl || 'URL_ENDPOINT'}/oauth/token \
  -d "grant_type=client_credentials" \
  -d "client_id=TON_CLIENT_ID" \
  -d "client_secret=mcp_CLE"</pre>
            </div>
          </div>

          <div class="space-y-1.5">
            <p class="text-[10px] text-gray-600 uppercase tracking-wide font-medium">Appeler un outil (ex: stats)</p>
            <div class="relative">
              <pre class="bg-black/40 border border-white/8 rounded-lg p-2.5 font-mono text-[10px] text-gray-300 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">curl -X POST {endpointUrl || 'URL_ENDPOINT'} \
  -H "Authorization: Bearer mcp_CLE" \
  -H "Content-Type: application/json" \
  -d '{`{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_guild_stats","arguments":{"period_days":7}}}`}'</pre>
            </div>
          </div>

          <div class="p-2.5 bg-gray-500/8 border border-white/8 rounded-lg text-gray-400 text-[10px] leading-relaxed">
            🤖 <strong class="text-gray-300">ChatGPT</strong> ne supporte pas encore MCP nativement. Tu peux l'utiliser via un GPT personnalisé avec une action HTTP pointant vers cet endpoint.
          </div>
        {/if}

      </div>
    </div>

    <!-- Permissions reference -->
    <div class="bg-[#1a1d23] border border-white/8 rounded-xl p-4 space-y-2">
      <p class="text-xs font-medium text-gray-500 uppercase tracking-wide">Permissions disponibles</p>
      {#each PERMISSIONS as perm}
        <div class="flex items-start gap-2">
          <span class="mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 {perm.value === 'WRITE_SANCTIONS' ? 'bg-red-400' : 'bg-primary'} mt-1.5"></span>
          <div>
            <span class="text-xs text-white">{perm.label}</span>
            <span class="text-[10px] text-gray-600 ml-1">— {perm.desc}</span>
          </div>
        </div>
      {/each}
    </div>
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
          <span class="text-gray-600 font-normal">(à coller dans "Client ID")</span>
        </div>
        <div class="flex items-center gap-2">
          <code class="flex-1 bg-black/40 border border-white/8 rounded-lg px-3 py-2 text-xs font-mono text-gray-200 break-all">
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
          <span class="text-gray-600 font-normal">(à coller dans "Client Secret")</span>
        </div>
        <div class="flex items-center gap-2">
          <code class="flex-1 bg-black/40 border border-primary/20 rounded-lg px-3 py-2 text-xs font-mono text-green-400 break-all">
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

      <button onclick={closeCreateModal} class="w-full py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-white text-sm font-medium transition-colors">
        J'ai tout copié, fermer
      </button>
    </div>

  {:else}
    <div class="space-y-5">
      <div>
        <label class="block text-sm font-medium text-gray-300 mb-1.5">Nom de la clé</label>
        <input
          type="text"
          bind:value={newKeyName}
          placeholder="Ex: Claude.ai, Claude Desktop…"
          maxlength={64}
          class="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary/50 transition-colors"
        />
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-300 mb-2">Permissions</label>
        <div class="space-y-1.5">
          {#each PERMISSIONS as perm}
            <label class="flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-all
              {newKeyPerms.includes(perm.value)
                ? perm.value === 'WRITE_SANCTIONS' ? 'border-red-500/30 bg-red-500/5' : 'border-primary/25 bg-primary/5'
                : 'border-white/6 hover:border-white/12'}">
              <input
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
