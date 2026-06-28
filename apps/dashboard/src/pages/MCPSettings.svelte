<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import { toast } from '../lib/stores/toast.svelte';
  import { API_BASE_URL, fetchMcpKeys, createMcpKey, deleteMcpKey, fetchMcpDirectUrl, fetchMcpLogs } from '../lib/api';
  import Modal from '../lib/components/Modal.svelte';
  import ConfirmModal from '../lib/components/ConfirmModal.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import LoadingHint from '../lib/components/LoadingHint.svelte';

  const PERMISSIONS = [
    { value: 'READ_STATS',      label: 'Stats serveur',     desc: 'Membres, messages, activité' },
    { value: 'READ_MEMBERS',    label: 'Membres',            desc: 'Profils, recherche, messages récents' },
    { value: 'READ_SANCTIONS',  label: 'Sanctions',          desc: 'Liste et historique' },
    { value: 'READ_STAFF',      label: 'Staff',              desc: 'Liste et profils du staff' },
    { value: 'READ_TICKETS',    label: 'Tickets',            desc: 'Liste des tickets ouverts' },
    { value: 'READ_COMMUNITY',  label: 'Communauté',         desc: 'Classements, suggestions, événements, quêtes, réputation' },
    { value: 'READ_ECONOMY',    label: 'Économie',           desc: 'Profils RPG, boutique, marketplace, classements économiques' },
    { value: 'READ_MODERATION', label: 'Modération',         desc: 'AutoMod, mots bannis, réponses auto, CodePolice' },
    { value: 'READ_ANALYTICS',  label: 'Analytics',          desc: 'Stats par salon, heatmap horaire, Pulse, prédictions' },
    { value: 'WRITE_SANCTIONS', label: 'Sanctionner',        desc: '⚠ Appliquer / lever des sanctions via IA' },
    { value: 'WRITE_MESSAGES',  label: 'Envoyer messages',   desc: '⚠ Poster des messages dans un salon en tant que bot' },
    { value: 'WRITE_TICKETS',   label: 'Gérer tickets',      desc: '⚠ Répondre et fermer des tickets via IA' },
    { value: 'WRITE_COMMUNITY', label: 'Gérer communauté',   desc: '⚠ Répondre aux suggestions, gérer événements et giveaways' },
    { value: 'WRITE_MEMBERS',   label: 'Gérer membres',      desc: '⚠ Notes modérateur, ajout/retrait de rôles, niveaux, invitations' },
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
    directUrl?: string;
  };

  type McpLogEntry = {
    id: string;
    ts: string;
    level: 'info' | 'warn' | 'error';
    guildId: string;
    event: string;
    method: string;
    url: string;
    ua: string;
    data: Record<string, unknown>;
  };

  let keys = $state<McpKey[]>([]);
  let loading = $state(true);

  // Create modal
  let createOpen = $state(false);
  let newKeyName = $state('');
  let newKeyPerms = $state<string[]>(['READ_STATS', 'READ_MEMBERS', 'READ_SANCTIONS']);
  let creating = $state(false);
  let createdKey = $state<CreatedKey | null>(null);
  let helpOpen = $state(false);
  let selectedAi = $state<'claude' | 'chatgpt' | 'gemini'>('claude');
  let diagOpen = $state(false);
  let diagRunning = $state(false);
  let diagLogs = $state<McpLogEntry[]>([]);
  let directUrls = $state<Record<string, { url: string; expiresAt: string }>>({});
  let directUrlLoadingKeyId = $state<string | null>(null);

  // Delete modal
  let deleteOpen = $state(false);
  let deletingKeyId = $state<string | null>(null);
  let deletingKeyName = $state('');

  // Copy state
  let copiedField = $state<string | null>(null);

  // Expanded row for credentials
  let expandedKeyId = $state<string | null>(null);

  const guildId = $derived(authStore.selectedGuildId ?? '');
  const readPermissions = $derived(PERMISSIONS.filter((p) => p.value.startsWith('READ_')));
  const writePermissions = $derived(PERMISSIONS.filter((p) => p.value.startsWith('WRITE_')));
  const endpointUrl = $derived(guildId ? `${API_BASE_URL}/api/mcp/${guildId}` : '');
  const aiGuides = $derived({
    claude: {
      name: 'Claude',
      shortName: 'Claude',
      logoUrl: 'https://claude.ai/favicon.ico',
      color: 'text-[#d97757]',
      bg: 'bg-[#d97757]/12',
      border: 'border-[#d97757]/25',
      setupUrl: 'https://claude.ai/settings/connectors',
      docsUrl: 'https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp',
      primaryAction: 'Ouvrir Connectors',
      note: 'Claude utilise les Custom connectors en remote MCP. Le serveur doit être public, puis Claude ouvre le flow OAuth Kotbo pour saisir ta clé MCP.',
      fields: [
        { label: 'Name', value: 'Kotbo' },
        { label: 'URL', value: 'URL MCP directe Claude si OAuth bloque, sinon URL MCP standard' },
        { label: 'Advanced settings', value: 'Laisse vide avec l URL directe. Pour OAuth standard, laisse vide aussi sauf demande explicite.' },
      ],
      steps: [
        'Ouvre Claude puis va dans Customize > Connectors.',
        'Clique sur le bouton + puis choisis Add custom connector.',
        'Ouvre une clé MCP ci-dessous et clique URL directe Claude, puis copie cette URL.',
        'Nom : Kotbo. URL : colle l URL directe Claude. Ne remplis pas Client ID ni Client Secret.',
        'Valide avec Add. Si tu utilises l URL MCP standard à la place, clique Connect puis colle ta clé mcp_ sur la page Kotbo.',
      ],
    },
    chatgpt: {
      name: 'ChatGPT',
      shortName: 'ChatGPT',
      logoUrl: 'https://chatgpt.com/favicon.ico',
      color: 'text-emerald-300',
      bg: 'bg-emerald-400/10',
      border: 'border-emerald-400/25',
      setupUrl: 'https://chatgpt.com/#settings/Apps',
      docsUrl: 'https://developers.openai.com/api/docs/guides/developer-mode',
      primaryAction: 'Ouvrir ChatGPT Apps',
      note: 'ChatGPT passe par Developer mode pour créer une app depuis un serveur MCP distant. Kotbo expose OAuth, PKCE, resource metadata et Bearer token comme attendu par les Apps MCP.',
      fields: [
        { label: 'App name', value: 'Kotbo' },
        { label: 'MCP server URL', value: 'URL MCP du serveur' },
        { label: 'Authentication', value: 'OAuth ou Mixed Authentication. Ne mets pas client_credentials.' },
      ],
      steps: [
        'Ouvre ChatGPT sur le web avec un compte compatible, puis Settings > Apps > Advanced settings.',
        'Active Developer mode si ce n est pas déjà fait.',
        'Clique Create app et choisis un serveur MCP distant.',
        'Nom : Kotbo. Server URL : colle l URL MCP affichée ici.',
        'Sélectionne OAuth ou Mixed Authentication. Au premier usage, ChatGPT ouvrira la page Kotbo pour saisir ta clé MCP.',
      ],
    },
    gemini: {
      name: 'Gemini',
      shortName: 'Gemini',
      logoUrl: 'https://gemini.google.com/favicon.ico',
      color: 'text-sky-300',
      bg: 'bg-sky-400/10',
      border: 'border-sky-400/25',
      setupUrl: 'https://ai.google.dev/gemini-api/docs/interactions/deep-research',
      docsUrl: 'https://ai.google.dev/gemini-api/docs/interactions/deep-research',
      primaryAction: 'Ouvrir la doc Gemini',
      note: 'Gemini utilise surtout MCP côté API. Utilise l URL MCP standard avec un header Bearer, ou l URL directe si ton environnement ne sait pas envoyer de header.',
      fields: [
        { label: 'type', value: 'mcp_server' },
        { label: 'name', value: 'Kotbo' },
        { label: 'url', value: 'URL MCP standard ou URL directe' },
        { label: 'headers', value: 'Authorization: Bearer mcp_... si ton client ne lance pas OAuth automatiquement.' },
      ],
      steps: [
        'Dans ton appel Gemini Deep Research, ajoute un tool avec type = mcp_server.',
        'Renseigne name = Kotbo et url = l URL MCP affichée ici.',
        'Si ton environnement supporte OAuth remote MCP, laisse Gemini suivre le flow Kotbo.',
        'Sinon ajoute headers.Authorization = Bearer suivi de ta clé MCP complète.',
        'Optionnel : utilise allowed_tools pour limiter les actions sensibles comme apply_sanction.',
      ],
    },
  });
  const currentGuide = $derived(aiGuides[selectedAi]);

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
        const directUrl = await loadDirectUrl(result.id, false);
        if (directUrl) {
          createdKey = { ...createdKey, directUrl };
        }
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

  async function loadDirectUrl(keyId: string, copyAfterLoad = true) {
    if (!guildId) return null;
    directUrlLoadingKeyId = keyId;
    try {
      const result = await fetchMcpDirectUrl(keyId, guildId);
      if (result?.directUrl) {
        directUrls = {
          ...directUrls,
          [keyId]: { url: result.directUrl, expiresAt: result.expiresAt },
        };
        if (copyAfterLoad) {
          await copy(result.directUrl, `direct-${keyId}`);
        }
        return result.directUrl as string;
      }
    } catch {
      toast.error('Impossible de générer l URL MCP directe');
    } finally {
      directUrlLoadingKeyId = null;
    }
    return null;
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
      delete directUrls[deletingKeyId];
      directUrls = { ...directUrls };
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

  function selectAiGuide(id: string) {
    if (id === 'claude' || id === 'chatgpt' || id === 'gemini') {
      selectedAi = id;
    }
  }

  function toggleExpandedKey(keyId: string) {
    expandedKeyId = expandedKeyId === keyId ? null : keyId;
  }

  function formatLogData(data: Record<string, unknown>) {
    return JSON.stringify(data, null, 2);
  }

  function formatLogTime(ts: string) {
    return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  async function refreshMcpLogs() {
    if (!guildId) return;
    diagRunning = true;
    try {
      const result = await fetchMcpLogs(guildId);
      diagLogs = Array.isArray(result?.logs) ? result.logs : [];
      console.info('[MCP logs]', diagLogs);
    } catch {
      toast.error('Impossible de charger les logs MCP');
    } finally {
      diagRunning = false;
    }
  }

  async function openMcpDiagnostics() {
    diagOpen = true;
    await refreshMcpLogs();
  }

  function handleKeyRowKeyboard(event: KeyboardEvent, keyId: string) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleExpandedKey(keyId);
    }
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
    <div class="shrink-0 flex items-center gap-2">
      <button
        onclick={() => { helpOpen = true; }}
        class="p-2 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-colors"
        title="Aide de connexion"
      >
        <Papicon icon="help-circle" size={16} />
      </button>
      <button
        onclick={() => { createOpen = true; createdKey = null; }}
        class="flex items-center gap-1.5 px-3.5 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-medium transition-colors shadow-sm shadow-primary/20"
      >
        <Papicon icon="plus" size={14} />
        Nouvelle clé
      </button>
    </div>
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
        <button
          onclick={openMcpDiagnostics}
          class="shrink-0 px-3 py-2.5 rounded-lg border border-amber-400/25 text-xs text-amber-300 hover:text-amber-200 hover:border-amber-400/40 transition-colors"
        >
          Logs
        </button>
      {/if}
    </div>
    <p class="text-xs text-gray-600 mt-2">
      Colle cette URL dans ton client IA. Le serveur supporte OAuth 2.0 avec PKCE pour Claude/ChatGPT, et Bearer token pour les clients MCP qui le demandent.
    </p>
  </div>

  <!-- Keys -->
  <div class="space-y-2">
    <h2 class="text-sm font-semibold text-white">Clés d'accès</h2>

    {#if loading}
      <div class="flex flex-col items-center justify-center py-12 text-gray-600 bg-[#1a1d23] border border-white/8 rounded-xl">
        <div class="flex items-center">
          <Papicon icon="loader-2" size={18} class="animate-spin mr-2" />
          <span class="text-sm">Chargement…</span>
        </div>
        <LoadingHint context="config" />
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
              role="button"
              tabindex="0"
              class="flex items-center gap-4 px-4 py-3.5 hover:bg-white/[0.02] transition-colors cursor-pointer"
              onclick={() => toggleExpandedKey(key.id)}
              onkeydown={(event) => handleKeyRowKeyboard(event, key.id)}
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
                    {perm.startsWith('WRITE_') ? 'bg-red-500/15 text-red-400' : 'bg-primary/12 text-primary/80'}">
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

                <!-- Direct signed endpoint for Claude fallback -->
                <div class="space-y-1 rounded-lg border border-amber-400/15 bg-amber-400/5 p-3">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p class="text-[11px] font-medium text-amber-300 uppercase tracking-wide">URL directe Claude</p>
                      <p class="mt-0.5 text-xs text-amber-200/70">
                        À utiliser si Claude termine OAuth puis affiche encore "Authorization failed".
                      </p>
                    </div>
                    <button
                      onclick={() => directUrls[key.id]?.url ? copy(directUrls[key.id].url, `direct-${key.id}`) : loadDirectUrl(key.id)}
                      disabled={directUrlLoadingKeyId === key.id}
                      class="shrink-0 px-2.5 py-2 rounded-lg border border-amber-400/25 text-xs text-amber-200 hover:border-amber-400/40 hover:text-amber-100 disabled:opacity-50 transition-colors"
                    >
                      {directUrlLoadingKeyId === key.id ? 'Génération...' : copiedField === `direct-${key.id}` ? 'Copié' : directUrls[key.id]?.url ? 'Copier' : 'Générer'}
                    </button>
                  </div>
                  {#if directUrls[key.id]?.url}
                    <code class="mt-2 block bg-black/40 border border-white/8 rounded-lg px-3 py-2 text-xs font-mono text-gray-200 break-all">
                      {directUrls[key.id].url}
                    </code>
                    <p class="mt-1 text-[11px] text-gray-600">
                      Expire le {new Date(directUrls[key.id].expiresAt).toLocaleDateString('fr-FR')}. Révoquer la clé coupe aussi cette URL.
                    </p>
                  {/if}
                </div>

                <!-- Permissions list -->
                <div class="space-y-1">
                  <p class="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Permissions</p>
                  <div class="flex flex-wrap gap-1.5">
                    {#each key.permissions as perm}
                      <span class="px-2 py-1 rounded-lg text-xs font-medium
                        {perm.startsWith('WRITE_') ? 'bg-red-500/15 text-red-400 border border-red-500/20' : 'bg-primary/10 text-primary/80 border border-primary/15'}">
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

      {#if createdKey.directUrl}
        <div class="space-y-1.5 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3">
          <div class="flex items-center gap-1.5 text-xs font-medium text-amber-300">
            <Papicon icon="link" size={12} />
            URL directe Claude
          </div>
          <div class="flex items-center gap-2">
            <code class="flex-1 bg-black/40 border border-white/8 rounded-lg px-3 py-2.5 text-xs font-mono text-gray-200 break-all">
              {createdKey.directUrl}
            </code>
            <button
              onclick={() => copy(createdKey!.directUrl!, 'new-direct-url')}
              class="shrink-0 px-2.5 py-2 rounded-lg border border-white/10 text-xs text-gray-400 hover:text-white transition-colors"
            >
              {copiedField === 'new-direct-url' ? '✓' : 'Copier'}
            </button>
          </div>
          <p class="text-[11px] leading-relaxed text-amber-200/70">
            Pour Claude : colle cette URL comme serveur MCP et laisse les champs OAuth avancés vides.
          </p>
        </div>
      {/if}

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
        <p class="text-sm font-medium text-gray-300 mb-3">Permissions</p>
        <div class="space-y-4 max-h-[380px] overflow-y-auto pr-1">
          <!-- Lecture Section -->
          <div>
            <h4 class="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2 border-b border-white/5 pb-1">Lecture (READ)</h4>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
              {#each readPermissions as perm}
                <div class="flex items-center justify-between p-2.5 rounded-lg border border-white/5 bg-black/20 hover:border-white/10 hover:bg-white/[0.01] transition-all">
                  <div class="min-w-0 pr-3">
                    <span class="text-xs font-semibold text-white">{perm.label}</span>
                    <p class="text-[10px] text-gray-500 mt-0.5 leading-normal">{perm.desc}</p>
                  </div>
                  <button
                    type="button"
                    onclick={() => togglePerm(perm.value)}
                    class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none {newKeyPerms.includes(perm.value) ? 'bg-primary' : 'bg-white/10'}"
                  >
                    <span
                      class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out {newKeyPerms.includes(perm.value) ? 'translate-x-4' : 'translate-x-0'}"
                    ></span>
                  </button>
                </div>
              {/each}
            </div>
          </div>

          <!-- Ecriture Section -->
          <div>
            <h4 class="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2 border-b border-white/5 pb-1">Écriture & Actions (WRITE)</h4>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
              {#each writePermissions as perm}
                <div class="flex items-center justify-between p-2.5 rounded-lg border border-white/5 bg-black/20 hover:border-white/10 hover:bg-white/[0.01] transition-all">
                  <div class="min-w-0 pr-3">
                    <span class="text-xs font-semibold text-white">{perm.label}</span>
                    <p class="text-[10px] text-gray-500 mt-0.5 leading-normal">{perm.desc}</p>
                  </div>
                  <button
                    type="button"
                    onclick={() => togglePerm(perm.value)}
                    class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none {newKeyPerms.includes(perm.value) ? 'bg-red-500/80 hover:bg-red-500' : 'bg-white/10'}"
                  >
                    <span
                      class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out {newKeyPerms.includes(perm.value) ? 'translate-x-4' : 'translate-x-0'}"
                    ></span>
                  </button>
                </div>
              {/each}
            </div>
          </div>
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

<!-- ── AI setup helper ───────────────────────────────────────────────────── -->
<Modal bind:open={helpOpen} onClose={() => { helpOpen = false; }} title="Connecter Kotbo à une IA" size="xl">
  <div class="space-y-5 p-5">
    <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {#each Object.entries(aiGuides) as [id, guide]}
        <button
          onclick={() => selectAiGuide(id)}
          class="min-h-24 rounded-lg border p-3 text-left transition-colors
            {selectedAi === id ? `${guide.bg} ${guide.border}` : 'border-white/8 bg-black/20 hover:border-white/16'}"
        >
          <div class="flex h-full items-start gap-3">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white">
              <img src={guide.logoUrl} alt="Logo {guide.name}" class="h-6 w-6 object-contain" loading="lazy" />
            </div>
            <div class="min-w-0">
              <span class="block text-sm font-semibold {selectedAi === id ? guide.color : 'text-gray-200'}">{guide.name}</span>
              <span class="mt-1 block text-xs leading-relaxed text-gray-500">
                {id === 'claude' ? 'Custom connector remote MCP' : id === 'chatgpt' ? 'Developer Mode Apps' : 'Deep Research API MCP'}
              </span>
            </div>
          </div>
        </button>
      {/each}
    </div>

    <div class="rounded-lg border {currentGuide.border} {currentGuide.bg} p-4">
      <div class="flex items-start gap-3">
        <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white">
          <img src={currentGuide.logoUrl} alt="Logo {currentGuide.name}" class="h-7 w-7 object-contain" loading="lazy" />
        </div>
        <div class="min-w-0">
          <p class="text-sm font-semibold {currentGuide.color}">{currentGuide.name}</p>
          <p class="mt-1 text-xs leading-relaxed text-gray-300">{currentGuide.note}</p>
        </div>
      </div>
    </div>

    <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
      <div class="space-y-4">
        <div class="space-y-2">
          <p class="text-xs font-medium text-gray-500 uppercase tracking-wide">Tutoriel {currentGuide.name}</p>
          <ol class="space-y-2">
            {#each currentGuide.steps as step, index}
              <li class="flex gap-2 text-sm text-gray-300">
                <span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/8 text-[11px] text-gray-400">{index + 1}</span>
                <span class="leading-relaxed">{step}</span>
              </li>
            {/each}
          </ol>
        </div>

        <div class="flex flex-col gap-2 sm:flex-row">
          <a
            href={currentGuide.setupUrl}
            target="_blank"
            rel="noreferrer"
            class="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90"
          >
            <Papicon icon="external-link" size={14} />
            {currentGuide.primaryAction}
          </a>
          <a
            href={currentGuide.docsUrl}
            target="_blank"
            rel="noreferrer"
            class="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2.5 text-sm text-gray-300 transition-colors hover:text-white"
          >
            <Papicon icon="book-open" size={14} />
            Doc officielle
          </a>
        </div>
      </div>

      <div class="space-y-3">
        <div class="rounded-lg border border-white/8 bg-black/20 p-3">
          <div class="mb-2 flex items-center justify-between gap-2">
            <p class="text-xs font-medium text-gray-500 uppercase tracking-wide">URL MCP</p>
            <button
              disabled={!endpointUrl}
              onclick={() => copy(endpointUrl, 'help-endpoint')}
              class="shrink-0 rounded-md border border-white/10 px-2 py-1 text-xs text-gray-400 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {copiedField === 'help-endpoint' ? 'Copié' : 'Copier'}
            </button>
          </div>
          <code class="block rounded-lg border border-white/8 bg-black/40 px-3 py-2.5 font-mono text-xs text-gray-200 break-all">
            {endpointUrl || 'Sélectionne un serveur pour obtenir l URL MCP'}
          </code>
        </div>

        <div class="rounded-lg border border-white/8 bg-black/20 p-3">
          <p class="mb-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Champs à remplir</p>
          <div class="space-y-2">
            {#each currentGuide.fields as field}
              <div class="rounded-lg border border-white/6 bg-black/25 px-3 py-2">
                <p class="text-[11px] font-medium text-gray-500">{field.label}</p>
                <p class="mt-0.5 text-xs leading-relaxed text-gray-300">{field.value}</p>
              </div>
            {/each}
          </div>
        </div>

        {#if selectedAi === 'gemini'}
          <div class="rounded-lg border border-sky-400/20 bg-sky-400/8 p-3">
            <p class="mb-2 text-xs font-medium text-sky-300">Exemple Gemini</p>
            <pre class="overflow-x-auto rounded-lg border border-white/8 bg-black/40 p-3 text-[11px] leading-relaxed text-gray-300">{`{
  "type": "mcp_server",
  "name": "Kotbo",
  "url": "${endpointUrl || 'https://api-kotbo.example/api/mcp/GUILD_ID'}",
  "headers": {
    "Authorization": "Bearer mcp_..."
  }
}`}</pre>
          </div>
        {/if}

        <p class="text-xs leading-relaxed text-gray-600">
          La clé MCP complète est visible uniquement juste après création. Si tu ne l as plus, crée une nouvelle clé.
        </p>
      </div>
    </div>
  </div>
</Modal>

<Modal bind:open={diagOpen} onClose={() => { diagOpen = false; }} title="Logs MCP" size="xl">
  <div class="space-y-3 p-5">
    <div class="flex items-center justify-between gap-3">
      <p class="text-sm text-gray-400">Dernières connexions réelles au serveur MCP pour ce serveur Discord.</p>
      <button
        onclick={refreshMcpLogs}
        disabled={diagRunning || !guildId}
        class="px-3 py-2 rounded-lg border border-white/10 text-sm text-gray-300 hover:text-white disabled:opacity-40"
      >
        {diagRunning ? 'Chargement...' : 'Actualiser'}
      </button>
    </div>

    {#if diagLogs.length === 0}
      <div class="rounded-lg border border-white/8 bg-black/20 p-6 text-sm text-gray-500">
        {diagRunning ? 'Chargement des logs...' : 'Aucun log MCP récent. Lance une connexion Claude ou ChatGPT puis actualise.'}
      </div>
    {:else}
      <div class="space-y-2">
        {#each diagLogs as log (log.id)}
          <div class="rounded-lg border {log.level === 'error' ? 'border-red-400/25 bg-red-400/5' : log.level === 'warn' ? 'border-amber-400/25 bg-amber-400/5' : 'border-white/8 bg-black/20'} p-3">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="text-xs text-gray-500">{formatLogTime(log.ts)}</span>
                  <span class="rounded border px-1.5 py-0.5 text-[10px] uppercase {log.level === 'error' ? 'border-red-400/30 text-red-300' : log.level === 'warn' ? 'border-amber-400/30 text-amber-300' : 'border-white/10 text-gray-400'}">{log.level}</span>
                  <span class="text-sm font-semibold {log.level === 'error' ? 'text-red-300' : log.level === 'warn' ? 'text-amber-300' : 'text-gray-200'}">{log.event}</span>
                </div>
                <p class="mt-1 break-all font-mono text-[11px] text-gray-600">{log.method} {log.url}</p>
              </div>
              <span class="max-w-full truncate text-xs text-gray-500">{log.ua || 'user-agent absent'}</span>
            </div>
            <pre class="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-black/35 p-3 text-xs leading-relaxed text-gray-300">{formatLogData(log.data)}</pre>
          </div>
        {/each}
      </div>
    {/if}
  </div>
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
