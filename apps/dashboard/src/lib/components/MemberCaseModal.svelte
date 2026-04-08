<script lang="ts">
  import FormInput from './FormInput.svelte';
  import { dashboardStore } from '../stores/dashboard.svelte';

  type MemberCaseTab = 'resume' | 'identite' | 'activite' | 'messages' | 'logs' | 'sanctions' | 'invites' | 'connexions';

  type MemberCaseResponse = {
    profile: {
      userId: string;
      userTag: string | null;
      username: string | null;
      globalName: string | null;
      displayName: string | null;
      avatarUrl: string | null;
      bannerUrl: string | null;
      accentColor: number | null;
      locale: string | null;
      isBot: boolean;
      accountCreatedAt: string | null;
      guildJoinedAt: string | null;
      guildLeftAt: string | null;
      firstSeenAt: string | null;
      lastSeenAt: string | null;
      lastMessageAt: string | null;
      lastMessageChannelId: string | null;
      messageCount: number;
      voiceSessionCount: number;
      voiceTimeSeconds: number;
      voiceLastChannelId: string | null;
      voiceLastJoinedAt: string | null;
      voiceLastLeftAt: string | null;
      rolesSnapshot: string[];
      presenceStatus: string | null;
      pronouns: string | null;
    } | null;
    invite: {
      code: string | null;
      inviterId: string | null;
      inviterTag: string | null;
      joinedAt: string | null;
    } | null;
    roles: Array<{ id: string; name: string; mention: string; permissions: string[] }>;
    effectivePermissions: string[];
    sanctions: Array<{
      id: string;
      type: string;
      status: string;
      targetUserId: string;
      targetTag: string;
      moderatorUserId: string;
      moderatorTag: string;
      reason: string;
      durationSeconds: number | null;
      expiresAt: string | null;
      createdAt: string;
      resolvedAt: string | null;
      resolutionNote: string | null;
    }>;
    logs: Array<{
      id: string;
      user: string;
      action: string;
      context: string;
      module: string;
      eventType: string;
      source: 'dashboard' | 'discord';
      details: string;
      dateIso: string;
      channelId: string | null;
    }>;
    messagesByChannel: Array<{
      channelId: string;
      channelName: string;
      count: number;
      lastMessageAt: string | null;
      recentMessages: Array<{ id: string; channelId: string; channelName: string; content: string; dateIso: string }>;
    }>;
    recentMessageCount: number;
    recentLogCount: number;
    connections: Array<{ name: string; type: string; visible: boolean }>;
    connectionsNote: string;
  };

  let {
    open = false,
    userName = '',
    userId = null as string | null,
    caseData = null as MemberCaseResponse | null,
    loading = false,
    error = '',
    actionReason = $bindable(''),
    actionDuration = $bindable('30m'),
    actionBusy = false,
    actionFeedback = '',
    actionIsError = false,
    onClose = () => {},
    onAction = (_action: 'WARN' | 'KICK' | 'TIMEOUT' | 'BAN') => {},
  } = $props<{
    open?: boolean;
    userName?: string;
    userId?: string | null;
    caseData?: MemberCaseResponse | null;
    loading?: boolean;
    error?: string;
    actionReason?: string;
    actionDuration?: string;
    actionBusy?: boolean;
    actionFeedback?: string;
    actionIsError?: boolean;
    onClose?: (e: MouseEvent) => void;
    onAction?: (action: 'WARN' | 'KICK' | 'TIMEOUT' | 'BAN') => void;
  }>();

  let activeTab = $state<MemberCaseTab>('resume');

  const sanctions = $derived(
    caseData?.sanctions
      ? [...caseData.sanctions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      : []
  );

  const tabs: { id: MemberCaseTab; label: string; icon: string; count?: () => number }[] = [
    { id: 'resume', label: 'Résumé', icon: 'dashboard' },
    { id: 'identite', label: 'Identité', icon: 'person' },
    { id: 'activite', label: 'Activité', icon: 'trending_up' },
    { id: 'messages', label: 'Messages', icon: 'chat', count: () => caseData?.recentMessageCount ?? 0 },
    { id: 'logs', label: 'Logs', icon: 'history', count: () => caseData?.recentLogCount ?? 0 },
    { id: 'sanctions', label: 'Sanctions', icon: 'gavel', count: () => sanctions.length },
    { id: 'invites', label: 'Invitations', icon: 'mail' },
    { id: 'connexions', label: 'Connexions', icon: 'link' },
  ];

  function formatDateTime(value: string | null | undefined) {
    if (!value) return 'Inconnu';
    return new Date(value).toLocaleString('fr-FR');
  }

  function formatDateShort(value: string | null | undefined) {
    if (!value) return '—';
    return new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function formatTimeShort(value: string | null | undefined) {
    if (!value) return '';
    return new Date(value).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  function formatDurationFromSeconds(seconds: number | null | undefined) {
    if (!seconds || seconds <= 0) return '0s';
    const totalSeconds = Math.floor(seconds);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const parts: string[] = [];
    if (days) parts.push(`${days}j`);
    if (hours) parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    if (parts.length === 0) parts.push(`${totalSeconds}s`);
    return parts.join(' ');
  }

  function formatChannelLabel(channelId: string | null | undefined) {
    if (!channelId) return 'Non spécifié';
    const channel = dashboardStore.state.discordChannels.find((item) => item.id === channelId);
    if (!channel) return 'Canal inconnu';
    return `#${channel.name}`;
  }

  function getHeroBackground() {
    if (caseData?.profile?.bannerUrl) {
      return `background-image: linear-gradient(to bottom, transparent 30%, var(--surface-container-lowest) 100%), url('${caseData.profile.bannerUrl}'); background-size: cover; background-position: center;`;
    }
    if (caseData?.profile?.accentColor) {
      const hex = '#' + caseData.profile.accentColor.toString(16).padStart(6, '0');
      return `background: linear-gradient(135deg, ${hex}40 0%, var(--color-primary) 50%, var(--color-secondary) 100%);`;
    }
    return `background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-container) 50%, var(--color-secondary) 100%);`;
  }

  function getPresenceColor(status: string | null | undefined) {
    if (!status) return 'bg-slate-400';
    const s = status.toLowerCase();
    if (s === 'online') return 'bg-emerald-500';
    if (s === 'idle') return 'bg-amber-500';
    if (s === 'dnd') return 'bg-red-500';
    return 'bg-slate-400';
  }

  function getPresenceLabel(status: string | null | undefined) {
    if (!status) return 'Hors ligne';
    const s = status.toLowerCase();
    if (s === 'online') return 'En ligne';
    if (s === 'idle') return 'Absent';
    if (s === 'dnd') return 'Ne pas déranger';
    return 'Hors ligne';
  }

  function sanitizeLogSnippet(value: string) {
    return value.replace(/^Contenu:\s*/i, '').replace(/^\s+|\s+$/g, '');
  }

  function getConnectionIcon(type: string) {
    const t = type.toLowerCase();
    if (t === 'youtube') return 'smart_display';
    if (t === 'twitch') return 'videogame_asset';
    if (t === 'twitter' || t === 'x') return 'tag';
    if (t === 'spotify') return 'music_note';
    if (t === 'github') return 'code';
    if (t === 'steam') return 'sports_esports';
    if (t === 'reddit') return 'forum';
    if (t === 'instagram') return 'photo_camera';
    if (t === 'facebook') return 'group';
    if (t === 'tiktok') return 'play_circle';
    if (t === 'playstation') return 'sports_esports';
    if (t === 'xbox') return 'sports_esports';
    if (t === 'battlenet') return 'sports_esports';
    if (t === 'epicgames') return 'sports_esports';
    if (t === 'riotgames') return 'sports_esports';
    return 'link';
  }

  function getSanctionBadgeClass(status: string) {
    const s = status.toUpperCase();
    if (s === 'ACTIVE') return 'badge badge-warning';
    if (s === 'RESOLVED') return 'badge badge-success';
    return 'badge badge-danger';
  }

  function getSanctionStatusLabel(status: string) {
    const s = status.toUpperCase();
    if (s === 'ACTIVE') return 'Active';
    if (s === 'RESOLVED') return 'Résolue';
    if (s === 'EXPIRED') return 'Expirée';
    return status;
  }

  $effect(() => {
    if (open) {
      activeTab = 'resume';
    }
  });
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="member-case-title" tabindex="-1" onclick={onClose}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-panel modal-panel-xl space-y-0 p-0 font-body" onclick={(e) => e.stopPropagation()}>

      <!-- ── Hero Section ──────────────────────────────────────── -->
      <div class="relative overflow-hidden rounded-t-3xl" style="min-height: 180px;">
        <div class="absolute inset-0" style={getHeroBackground()}></div>
        <div class="absolute inset-0 bg-linear-to-b from-transparent via-transparent to-(--surface-container-lowest)"></div>

        <!-- Close button -->
        <button
          type="button"
          onclick={onClose}
          class="absolute top-4 right-4 z-50 flex h-9 w-9 items-center justify-center rounded-xl bg-black/20 text-white/80 backdrop-blur-lg transition-all hover:bg-black/40 hover:text-white hover:scale-110 active:scale-95 shadow-lg"
        >
          <span class="material-symbols-outlined text-lg">close</span>
        </button>

        <!-- Avatar + Identity block -->
        <div class="relative z-10 flex items-end gap-5 px-8 pb-5 pt-20">
          <div class="relative shrink-0">
            <div class="absolute -inset-1.5 rounded-3xl bg-white/20 blur-lg animate-pulse"></div>
            {#if caseData?.profile?.avatarUrl}
              <img
                src={caseData.profile.avatarUrl}
                alt="Avatar"
                class="relative h-20 w-20 rounded-2xl border-4 border-(--surface-container-lowest) object-cover shadow-2xl"
              />
            {:else}
              <div class="relative flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-(--surface-container-lowest) bg-(--surface-container-high) text-2xl font-black text-primary shadow-2xl">
                {userName.slice(0, 1).toUpperCase()}
              </div>
            {/if}
            <!-- Presence indicator -->
            <div class="absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-3 border-(--surface-container-lowest) {getPresenceColor(caseData?.profile?.presenceStatus)}" title={getPresenceLabel(caseData?.profile?.presenceStatus)}></div>
          </div>

          <div class="min-w-0 pb-1">
            <h3 id="member-case-title" class="text-2xl font-black text-on-surface tracking-tight truncate font-headline">
              {caseData?.profile?.displayName || caseData?.profile?.globalName || userName}
            </h3>
            <div class="mt-1 flex flex-wrap items-center gap-2">
              <span class="text-sm font-semibold text-on-surface-variant">
                @{caseData?.profile?.username || userName}
              </span>
              {#if caseData?.profile?.isBot}
                <span class="badge badge-info">Bot</span>
              {/if}
              {#if caseData?.profile?.pronouns}
                <span class="badge badge-neutral">{caseData.profile.pronouns}</span>
              {/if}
              <span class="badge badge-neutral">
                <span class="h-2 w-2 rounded-full {getPresenceColor(caseData?.profile?.presenceStatus)}"></span>
                {getPresenceLabel(caseData?.profile?.presenceStatus)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Tab Navigation ────────────────────────────────────── -->
      <div class="px-6 pt-4 pb-2">
        <div class="tab-group overflow-x-auto">
          {#each tabs as tab}
            <button
              type="button"
              onclick={() => activeTab = tab.id}
              class="tab-button {activeTab === tab.id ? 'active' : ''}"
            >
              <span class="material-symbols-outlined text-base">{tab.icon}</span>
              <span>{tab.label}</span>
              {#if tab.count && caseData}
                {@const c = tab.count()}
                {#if c > 0}
                  <span class="flex h-5 min-w-5 items-center justify-center rounded-full text-[9px] font-black {activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary'}">
                    {c}
                  </span>
                {/if}
              {/if}
            </button>
          {/each}
        </div>
      </div>

      <!-- ── Content Area ──────────────────────────────────────── -->
      <div class="px-6 pb-6 pt-2">
        {#if !userId}
          <div class="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-5 py-4 text-sm font-semibold text-amber-800">
            <span class="material-symbols-outlined text-lg align-middle mr-2">warning</span>
            Impossible de relier ce log à un ID utilisateur Discord. Le casier ne peut pas être chargé pour cette entrée.
          </div>
        {:else if loading}
          <div class="flex flex-col items-center justify-center py-16 text-on-surface-variant/40">
            <span class="material-symbols-outlined text-5xl animate-spin">progress_activity</span>
            <p class="mt-4 text-sm font-bold uppercase tracking-widest">Chargement du profil…</p>
          </div>
        {:else if error}
          <div class="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-5 py-4 text-sm font-semibold text-amber-800">
            <span class="material-symbols-outlined text-lg align-middle mr-2">error</span>
            {error}
          </div>
        {:else if !caseData}
          <div class="rounded-2xl border border-outline-variant bg-surface-container-low px-5 py-4 text-sm font-semibold text-on-surface-variant">
            Aucune donnée détaillée n'est disponible pour ce membre.
          </div>
        {:else}
          <div class="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] items-start">

            <!-- ── Left Column ────────────────── -->
            <div class="min-w-0 space-y-5">

              <!-- Quick Actions Panel -->
              <div class="section-card p-5 space-y-4">
                <div class="flex items-center justify-between gap-4">
                  <div>
                    <p class="section-label">Actions rapides</p>
                    <p class="mt-1 text-xs text-on-surface-variant">Actions appliquées sur le serveur sélectionné.</p>
                  </div>
                </div>
                <div class="grid gap-3 md:grid-cols-2">
                  <FormInput bind:value={actionReason} type="text" placeholder="Motif de l'action" />
                  <FormInput bind:value={actionDuration} type="text" placeholder="Durée timeout (30m, 2h, 1j)" />
                </div>
                <div class="flex flex-wrap gap-2">
                  <button type="button" onclick={() => onAction('WARN')} disabled={actionBusy}
                    class="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-black text-white shadow-lg shadow-amber-500/20 transition-all hover:bg-amber-600 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none">
                    <span class="material-symbols-outlined text-base">warning</span>
                    Warn
                  </button>
                  <button type="button" onclick={() => onAction('TIMEOUT')} disabled={actionBusy}
                    class="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-black text-white shadow-lg shadow-blue-600/20 transition-all hover:bg-blue-700 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none">
                    <span class="material-symbols-outlined text-base">timer</span>
                    Timeout
                  </button>
                  <button type="button" onclick={() => onAction('KICK')} disabled={actionBusy}
                    class="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-xs font-black text-white shadow-lg shadow-orange-600/20 transition-all hover:bg-orange-700 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none">
                    <span class="material-symbols-outlined text-base">logout</span>
                    Kick
                  </button>
                  <button type="button" onclick={() => onAction('BAN')} disabled={actionBusy}
                    class="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-xs font-black text-white shadow-lg shadow-red-600/20 transition-all hover:bg-red-700 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none">
                    <span class="material-symbols-outlined text-base">block</span>
                    Ban
                  </button>
                </div>
                {#if actionFeedback}
                  <div class="rounded-xl px-4 py-3 text-xs font-semibold {actionIsError ? 'border border-rose-200 bg-rose-50 text-rose-800' : 'border border-emerald-200 bg-emerald-50 text-emerald-800'}">
                    {actionFeedback}
                  </div>
                {/if}
              </div>

              <!-- ── Tab Content ─────────────── -->
              {#if activeTab === 'resume'}
                <div class="grid gap-4 md:grid-cols-2">
                  <!-- Key Stats -->
                  <div class="stat-kpi">
                    <div class="flex items-center gap-3 mb-3">
                      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <span class="material-symbols-outlined">chat</span>
                      </div>
                      <p class="section-label">Messages</p>
                    </div>
                    <p class="text-3xl font-black text-on-surface tracking-tight">{caseData.profile?.messageCount ?? 0}</p>
                    <p class="mt-1 text-xs text-on-surface-variant">Dernier : {formatDateShort(caseData.profile?.lastMessageAt)}</p>
                  </div>
                  <div class="stat-kpi">
                    <div class="flex items-center gap-3 mb-3">
                      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
                        <span class="material-symbols-outlined">mic</span>
                      </div>
                      <p class="section-label">Vocal</p>
                    </div>
                    <p class="text-3xl font-black text-on-surface tracking-tight">{formatDurationFromSeconds(caseData.profile?.voiceTimeSeconds)}</p>
                    <p class="mt-1 text-xs text-on-surface-variant">{caseData.profile?.voiceSessionCount ?? 0} session(s)</p>
                  </div>
                  <div class="stat-kpi">
                    <div class="flex items-center gap-3 mb-3">
                      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
                        <span class="material-symbols-outlined">gavel</span>
                      </div>
                      <p class="section-label">Sanctions</p>
                    </div>
                    <p class="text-3xl font-black text-on-surface tracking-tight">{caseData.sanctions.length}</p>
                    <p class="mt-1 text-xs text-on-surface-variant">{caseData.sanctions.filter(s => s.status === 'ACTIVE').length} active(s)</p>
                  </div>
                  <div class="stat-kpi">
                    <div class="flex items-center gap-3 mb-3">
                      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
                        <span class="material-symbols-outlined">calendar_month</span>
                      </div>
                      <p class="section-label">Ancienneté</p>
                    </div>
                    <p class="text-lg font-black text-on-surface tracking-tight">{formatDateShort(caseData.profile?.guildJoinedAt)}</p>
                    <p class="mt-1 text-xs text-on-surface-variant">Compte créé le {formatDateShort(caseData.profile?.accountCreatedAt)}</p>
                  </div>
                </div>

                <!-- Timeline summary -->
                <div class="section-card p-5 space-y-3">
                  <p class="section-label">Chronologie</p>
                  <div class="space-y-0">
                    <dl>
                      <div class="info-row"><dt>Compte créé</dt><dd>{formatDateTime(caseData.profile?.accountCreatedAt)}</dd></div>
                      <div class="info-row"><dt>Entrée serveur</dt><dd>{formatDateTime(caseData.profile?.guildJoinedAt)}</dd></div>
                      <div class="info-row"><dt>Dernière activité</dt><dd>{formatDateTime(caseData.profile?.lastSeenAt)}</dd></div>
                      <div class="info-row"><dt>Dernier message</dt><dd>{formatDateTime(caseData.profile?.lastMessageAt)}</dd></div>
                      <div class="info-row"><dt>Dernier salon msg</dt><dd>{formatChannelLabel(caseData.profile?.lastMessageChannelId)}</dd></div>
                      <div class="info-row"><dt>Dernier salon vocal</dt><dd>{formatChannelLabel(caseData.profile?.voiceLastChannelId)}</dd></div>
                    </dl>
                  </div>
                </div>

              {:else if activeTab === 'identite'}
                <div class="grid gap-4 md:grid-cols-2">
                  <div class="section-card p-5 space-y-3">
                    <p class="section-label">Identité Discord</p>
                    <dl>
                      <div class="info-row"><dt>Tag</dt><dd>{caseData.profile?.userTag ?? 'Inconnu'}</dd></div>
                      <div class="info-row"><dt>Username</dt><dd>{caseData.profile?.username ?? 'Inconnu'}</dd></div>
                      <div class="info-row"><dt>Nom global</dt><dd>{caseData.profile?.globalName ?? 'Inconnu'}</dd></div>
                      <div class="info-row"><dt>Affichage serveur</dt><dd>{caseData.profile?.displayName ?? 'Inconnu'}</dd></div>
                      <div class="info-row"><dt>Locale</dt><dd>{caseData.profile?.locale ?? 'Inconnue'}</dd></div>
                      <div class="info-row"><dt>Bot</dt><dd>{caseData.profile?.isBot ? 'Oui' : 'Non'}</dd></div>
                      <div class="info-row"><dt>Pronoms</dt><dd>{caseData.profile?.pronouns ?? 'Non disponibles'}</dd></div>
                    </dl>
                  </div>
                  <div class="section-card p-5 space-y-4">
                    <p class="section-label">Visuel</p>
                    {#if caseData.profile?.avatarUrl}
                      <div class="flex items-center gap-4">
                        <img src={caseData.profile.avatarUrl} alt="Avatar large" class="h-16 w-16 rounded-2xl border border-outline-variant object-cover shadow-lg" />
                        <span class="text-xs font-semibold text-on-surface-variant">Avatar disponible</span>
                      </div>
                    {:else}
                      <p class="text-xs text-on-surface-variant">Aucun avatar personnalisé</p>
                    {/if}
                    {#if caseData.profile?.bannerUrl}
                      <img src={caseData.profile.bannerUrl} alt="Bannière" class="w-full h-20 rounded-xl object-cover border border-outline-variant" />
                    {:else}
                      <p class="text-xs text-on-surface-variant">Aucune bannière</p>
                    {/if}
                    {#if caseData.profile?.accentColor}
                      <div class="flex items-center gap-3">
                        <div class="h-8 w-8 rounded-lg shadow-inner" style="background-color: #{caseData.profile.accentColor.toString(16).padStart(6, '0')};"></div>
                        <span class="text-xs font-semibold text-on-surface-variant">#{caseData.profile.accentColor.toString(16).padStart(6, '0')}</span>
                      </div>
                    {/if}
                    <div class="info-row"><dt>Compte créé</dt><dd>{formatDateTime(caseData.profile?.accountCreatedAt)}</dd></div>
                  </div>
                </div>

                <!-- Roles & Permissions -->
                <div class="section-card p-5 space-y-4">
                  <div class="flex items-center justify-between gap-3">
                    <p class="section-label">Rôles & Permissions</p>
                    <span class="text-[10px] font-bold text-on-surface-variant">{caseData.roles.length} rôle(s)</span>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    {#each caseData.roles as role}
                      <span class="badge badge-neutral">{role.name}</span>
                    {/each}
                    {#if caseData.roles.length === 0}
                      <span class="text-xs text-on-surface-variant">Aucun rôle visible.</span>
                    {/if}
                  </div>
                  {#if caseData.effectivePermissions.length > 0}
                    <div class="border-t border-outline-variant/50 pt-3">
                      <p class="section-label mb-2">Permissions calculées</p>
                      <div class="flex flex-wrap gap-1.5">
                        {#each caseData.effectivePermissions as perm}
                          <span class="badge badge-info">{perm}</span>
                        {/each}
                      </div>
                    </div>
                  {/if}
                </div>

              {:else if activeTab === 'activite'}
                <div class="grid gap-4 md:grid-cols-3">
                  <div class="stat-kpi text-center">
                    <span class="material-symbols-outlined text-3xl text-primary/60">chat</span>
                    <p class="mt-2 text-3xl font-black text-on-surface">{caseData.profile?.messageCount ?? 0}</p>
                    <p class="mt-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Messages</p>
                    <p class="mt-1 text-xs text-on-surface-variant">Dernier : {formatDateShort(caseData.profile?.lastMessageAt)}</p>
                  </div>
                  <div class="stat-kpi text-center">
                    <span class="material-symbols-outlined text-3xl text-secondary/60">mic</span>
                    <p class="mt-2 text-3xl font-black text-on-surface">{formatDurationFromSeconds(caseData.profile?.voiceTimeSeconds)}</p>
                    <p class="mt-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Temps vocal</p>
                    <p class="mt-1 text-xs text-on-surface-variant">Dernier salon : {formatChannelLabel(caseData.profile?.voiceLastChannelId)}</p>
                  </div>
                  <div class="stat-kpi text-center">
                    <span class="material-symbols-outlined text-3xl text-emerald-500/60">visibility</span>
                    <p class="mt-2 text-lg font-black text-on-surface">{formatDateShort(caseData.profile?.lastSeenAt)}</p>
                    <p class="mt-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Dernière activité</p>
                    <p class="mt-1 text-xs text-on-surface-variant">Première vue : {formatDateShort(caseData.profile?.firstSeenAt)}</p>
                  </div>
                </div>

                <!-- Messages by channel with progress bars -->
                <div class="section-card p-5 space-y-4">
                  <div class="flex items-center justify-between gap-3">
                    <p class="section-label">Messages par salon</p>
                    <span class="text-[10px] font-bold text-on-surface-variant">{caseData.recentMessageCount} total</span>
                  </div>
                  {#each caseData.messagesByChannel as channelSummary}
                    {@const maxCount = Math.max(...caseData.messagesByChannel.map(c => c.count), 1)}
                    <div class="space-y-1.5">
                      <div class="flex items-center justify-between text-sm">
                        <span class="font-bold text-on-surface">{channelSummary.channelName}</span>
                        <span class="text-xs font-black text-primary">{channelSummary.count}</span>
                      </div>
                      <div class="h-2 w-full rounded-full bg-surface-container-highest overflow-hidden">

                        <div class="h-full rounded-full bg-linear-to-r from-primary to-secondary transition-all duration-700" style="width: {(channelSummary.count / maxCount) * 100}%"></div>
                      </div>
                    </div>
                  {/each}
                  {#if caseData.messagesByChannel.length === 0}
                    <p class="text-xs text-on-surface-variant">Aucun message enregistré.</p>
                  {/if}
                </div>

              {:else if activeTab === 'messages'}
                <div class="section-card p-5 space-y-4">
                  <div class="flex items-center justify-between gap-3">
                    <p class="section-label">Historique des messages</p>
                    <span class="text-[10px] font-bold text-on-surface-variant">{caseData.recentMessageCount} message(s)</span>
                  </div>
                  {#each caseData.messagesByChannel as channelSummary}
                    <div class="rounded-xl border border-outline-variant p-4 space-y-3">
                      <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                          <span class="material-symbols-outlined text-base text-primary">tag</span>
                          <span class="font-bold text-on-surface">{channelSummary.channelName}</span>
                        </div>
                        <span class="badge badge-neutral">{channelSummary.count}</span>
                      </div>
                      <div class="space-y-2 pl-4 border-l-2 border-primary/20">
                        {#each channelSummary.recentMessages as message}
                          <div class="rounded-xl bg-surface-container-low p-3">
                            <div class="flex items-center justify-between gap-2 text-[10px] font-bold text-on-surface-variant">
                              <span>{formatDateShort(message.dateIso)} · {formatTimeShort(message.dateIso)}</span>
                              <span>{formatChannelLabel(message.channelId)}</span>
                            </div>
                            <p class="mt-1.5 text-sm text-on-surface leading-relaxed">{message.content || 'Contenu vide'}</p>
                          </div>
                        {/each}
                      </div>
                    </div>
                  {/each}
                  {#if caseData.messagesByChannel.length === 0}
                    <div class="flex flex-col items-center py-8 text-on-surface-variant/40">
                      <span class="material-symbols-outlined text-4xl">chat_bubble_outline</span>
                      <p class="mt-2 text-sm font-semibold">Aucun message observé</p>
                    </div>
                  {/if}
                </div>

              {:else if activeTab === 'logs'}
                <div class="section-card p-5 space-y-4">
                  <div class="flex items-center justify-between gap-3">
                    <p class="section-label">Logs associés</p>
                    <span class="text-[10px] font-bold text-on-surface-variant">{caseData.recentLogCount} log(s)</span>
                  </div>
                  <div class="space-y-0 pl-4 border-l-2 border-outline-variant">
                    {#each caseData.logs as log}
                      <div class="relative pl-5 pb-5">
                        <div class="absolute -left-[calc(0.25rem+5px)] top-1.5 h-2.5 w-2.5 rounded-full bg-primary border-2 border-surface-container-lowest"></div>
                        <div class="flex items-start justify-between gap-3">
                          <div>
                            <p class="text-sm font-bold text-on-surface">{log.action}</p>
                            <p class="text-[10px] uppercase tracking-widest text-on-surface-variant">{log.module} · {log.eventType} · {log.source}</p>
                          </div>
                          <span class="shrink-0 text-[10px] font-bold text-on-surface-variant whitespace-nowrap">{formatDateShort(log.dateIso)} {formatTimeShort(log.dateIso)}</span>
                        </div>
                        <p class="mt-1 text-xs text-on-surface-variant leading-relaxed">{sanitizeLogSnippet(log.details)}</p>
                      </div>
                    {/each}
                  </div>
                  {#if caseData.logs.length === 0}
                    <div class="flex flex-col items-center py-8 text-on-surface-variant/40">
                      <span class="material-symbols-outlined text-4xl">history</span>
                      <p class="mt-2 text-sm font-semibold">Aucun log associé</p>
                    </div>
                  {/if}
                </div>

              {:else if activeTab === 'sanctions'}
                <div class="section-card-flush">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th class="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">Date</th>
                        <th class="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">Type</th>
                        <th class="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">Statut</th>
                        <th class="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">Modérateur</th>
                        <th class="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">Raison</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each sanctions as sanction}
                        <tr>
                          <td class="text-xs text-on-surface-variant whitespace-nowrap">{formatDateShort(sanction.createdAt)}</td>
                          <td class="text-xs font-bold text-primary">{sanction.type}</td>
                          <td><span class={getSanctionBadgeClass(sanction.status)}>{getSanctionStatusLabel(sanction.status)}</span></td>
                          <td class="text-xs text-on-surface-variant">{sanction.moderatorTag}</td>
                          <td class="text-xs text-on-surface-variant max-w-xs truncate">{sanction.reason}</td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                  {#if sanctions.length === 0}
                    <div class="flex flex-col items-center py-12 text-on-surface-variant/40">
                      <span class="material-symbols-outlined text-4xl">check_circle</span>
                      <p class="mt-2 text-sm font-semibold">Aucune sanction</p>
                    </div>
                  {/if}
                </div>

              {:else if activeTab === 'invites'}
                <div class="grid gap-4 md:grid-cols-2">
                  <div class="section-card p-5 space-y-3">
                    <div class="flex items-center gap-2 mb-2">
                      <span class="material-symbols-outlined text-primary">mail</span>
                      <p class="section-label">Invitation d'arrivée</p>
                    </div>
                    <dl>
                      <div class="info-row"><dt>Code</dt><dd>{caseData.invite?.code ?? 'Inconnue'}</dd></div>
                      <div class="info-row"><dt>Créateur</dt><dd>{caseData.invite?.inviterTag ?? 'Inconnu'}</dd></div>
                      <div class="info-row"><dt>Date de join</dt><dd>{formatDateTime(caseData.invite?.joinedAt ?? caseData.profile?.guildJoinedAt)}</dd></div>
                    </dl>
                  </div>
                  <div class="section-card p-5 space-y-3">
                    <div class="flex items-center gap-2 mb-2">
                      <span class="material-symbols-outlined text-secondary">groups</span>
                      <p class="section-label">Profil serveur</p>
                    </div>
                    <dl>
                      <div class="info-row">
                        <dt>Statut</dt>
                        <dd>
                          <span class="badge {caseData.profile?.guildLeftAt ? 'badge-danger' : 'badge-success'}">
                            {caseData.profile?.guildLeftAt ? 'Sorti' : 'Présent'}
                          </span>
                        </dd>
                      </div>
                      <div class="info-row"><dt>Entrée</dt><dd>{formatDateTime(caseData.profile?.guildJoinedAt)}</dd></div>
                      <div class="info-row"><dt>Sortie</dt><dd>{formatDateTime(caseData.profile?.guildLeftAt)}</dd></div>
                      <div class="info-row"><dt>Première vue</dt><dd>{formatDateTime(caseData.profile?.firstSeenAt)}</dd></div>
                    </dl>
                  </div>
                </div>

              {:else if activeTab === 'connexions'}
                <div class="section-card p-5 space-y-4">
                  <p class="section-label">Connexions tierces</p>
                  <p class="text-xs text-on-surface-variant">{caseData.connectionsNote}</p>
                  <div class="grid gap-3 md:grid-cols-2">
                    {#each caseData.connections as connection}
                      <div class="flex items-center gap-3 rounded-xl bg-surface-container-low p-3 border border-outline-variant/50 transition-all hover:border-primary/30 hover:shadow-sm">
                        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <span class="material-symbols-outlined">{getConnectionIcon(connection.type)}</span>
                        </div>
                        <div class="min-w-0">
                          <p class="font-bold text-sm text-on-surface truncate">{connection.name}</p>
                          <p class="text-[10px] uppercase tracking-widest text-on-surface-variant">{connection.type} · {connection.visible ? 'Visible' : 'Masquée'}</p>
                        </div>
                      </div>
                    {/each}
                    {#if caseData.connections.length === 0}
                      <div class="md:col-span-2 flex flex-col items-center py-8 text-on-surface-variant/40">
                        <span class="material-symbols-outlined text-4xl">link_off</span>
                        <p class="mt-2 text-sm font-semibold">Aucune connexion exposée</p>
                      </div>
                    {/if}
                  </div>
                </div>
              {/if}
            </div>

            <!-- ── Right Column (Sidebar) ─────── -->
            <div class="min-w-0 space-y-5">
              <div class="section-card p-5 space-y-3">
                <p class="section-label">Résumé condensé</p>
                <dl>
                  <div class="info-row"><dt>Messages</dt><dd class="font-black text-on-surface">{caseData.profile?.messageCount ?? 0}</dd></div>
                  <div class="info-row"><dt>Temps vocal</dt><dd class="font-black text-on-surface">{formatDurationFromSeconds(caseData.profile?.voiceTimeSeconds)}</dd></div>
                  <div class="info-row"><dt>Dernier salon</dt><dd>{formatChannelLabel(caseData.profile?.lastMessageChannelId)}</dd></div>
                  <div class="info-row"><dt>Rôles</dt><dd class="font-black text-on-surface">{caseData.roles.length}</dd></div>
                  <div class="info-row"><dt>Permissions</dt><dd class="font-black text-on-surface">{caseData.effectivePermissions.length}</dd></div>
                  <div class="info-row"><dt>Logs</dt><dd class="font-black text-on-surface">{caseData.recentLogCount}</dd></div>
                </dl>
              </div>

              <div class="section-card p-5 space-y-3">
                <p class="section-label">Rôles observés</p>
                <div class="flex flex-wrap gap-1.5">
                  {#each caseData.roles as role}
                    <span class="badge badge-neutral">{role.name}</span>
                  {/each}
                  {#if caseData.roles.length === 0}
                    <span class="text-xs text-on-surface-variant">Aucun rôle observé.</span>
                  {/if}
                </div>
              </div>

              <div class="section-card p-5 space-y-3">
                <p class="section-label">Permissions</p>
                <div class="flex flex-wrap gap-1.5">
                  {#each caseData.effectivePermissions as permission}
                    <span class="badge badge-info">{permission}</span>
                  {/each}
                  {#if caseData.effectivePermissions.length === 0}
                    <span class="text-xs text-on-surface-variant">Aucune permission calculée.</span>
                  {/if}
                </div>
              </div>
            </div>

          </div>
        {/if}
      </div>

    </div>
  </div>
{/if}
