<script lang="ts">
  import { fetchAdvancedAnalytics, updateChannelsManagementConfig, type AdvancedAnalyticsSection } from '../../api';
  import SectionCard from '../SectionCard.svelte';
  import EmptyState from '../EmptyState.svelte';
  import Papicon from '../Papicon.svelte';
  import { dashboardStore } from '../../stores/dashboard.svelte';
  import { toast } from '../../stores/toast.svelte';

  let { section }: { section: AdvancedAnalyticsSection } = $props();

  let data: any = $state(null);
  /**
   * Section à laquelle `data` appartient. Indispensable : les $effect s'exécutent
   * après le rendu, donc le template voit d'abord la nouvelle `section` avec les
   * anciennes données. Sans cette garde, on lit des champs inexistants (crash).
   */
  let loadedSection: AdvancedAnalyticsSection | null = $state(null);
  let loading = $state(true);
  let error = $state('');
  let enablingWords = $state(false);

  const cache = new Map<string, any>();
  let requestId = 0;

  /** Les données affichables correspondent bien à la section demandée. */
  const ready = $derived(data !== null && loadedSection === section);

  async function load(s: AdvancedAnalyticsSection) {
    const id = ++requestId;

    if (cache.has(s)) {
      data = cache.get(s);
      loadedSection = s;
      error = '';
      loading = false;
      return;
    }

    loading = true; error = ''; data = null; loadedSection = null;
    try {
      const res = await fetchAdvancedAnalytics(s);
      cache.set(s, res);
      // Une navigation rapide peut faire arriver une réponse périmée : on l'ignore.
      if (id !== requestId) return;
      data = res;
      loadedSection = s;
    } catch (e: any) {
      if (id !== requestId) return;
      error = e?.message || 'Erreur lors du chargement';
    } finally {
      if (id === requestId) loading = false;
    }
  }

  $effect(() => { load(section); });

  function channelName(channelId: string): string {
    const c = dashboardStore.state.discordChannels?.find((ch: any) => ch.id === channelId);
    return c ? `#${c.name}` : `#${channelId.slice(-4)}`;
  }

  function fmtDuration(seconds: number | null): string {
    if (seconds == null) return '—';
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)} h`;
    return `${Math.round(seconds / 86400)} j`;
  }

  function fmtHours(hours: number | null): string {
    if (hours == null) return '—';
    if (hours < 1) return '< 1 h';
    if (hours < 48) return `${hours} h`;
    return `${Math.round(hours / 24)} j`;
  }

  function pctColor(pct: number): string {
    if (pct >= 70) return 'text-emerald-500';
    if (pct >= 40) return 'text-amber-500';
    return 'text-red-400';
  }

  function trendBadge(pct: number): { cls: string; label: string } {
    if (pct > 0) return { cls: 'text-emerald-500 bg-emerald-500/10', label: `+${pct}%` };
    if (pct < 0) return { cls: 'text-red-400 bg-red-400/10', label: `${pct}%` };
    return { cls: 'text-on-surface-variant/60 bg-surface-container', label: '0%' };
  }

  async function enableWordStats() {
    enablingWords = true;
    try {
      const ok = await updateChannelsManagementConfig({ wordStatsEnabled: true });
      if (!ok) throw new Error();
      toast.success('Statistiques de mots activées. Les données commencent à s\'accumuler.');
      cache.delete('words');
      await load('words');
    } catch {
      toast.error('Impossible d\'activer les statistiques de mots.');
    } finally {
      enablingWords = false;
    }
  }

  const DOW_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  function heatColor(count: number, max: number): string {
    if (count === 0 || max === 0) return 'bg-surface-container';
    const ratio = count / max;
    if (ratio > 0.75) return 'bg-primary';
    if (ratio > 0.5) return 'bg-primary/70';
    if (ratio > 0.25) return 'bg-primary/40';
    return 'bg-primary/15';
  }
</script>

{#if loading}
  <div class="grid gap-4 grid-cols-1 md:grid-cols-2">
    {#each Array(4) as _}
      <div class="section-card p-5 space-y-3 animate-pulse">
        <div class="h-4 w-1/3 rounded bg-surface-container"></div>
        <div class="h-24 rounded bg-surface-container"></div>
      </div>
    {/each}
  </div>
{:else if error}
  <SectionCard title="Erreur" icon="Warning">
    <EmptyState icon="warning" title="Impossible de charger cette section" description={error} />
  </SectionCard>

<!-- ═══════════════ RÉTENTION ═══════════════ -->
{:else if section === 'retention' && ready}
  <div class="space-y-4">
    <div class="grid gap-4 grid-cols-1 sm:grid-cols-2">
      <SectionCard title="Membres de retour" description="Actifs cette semaine après 30 jours ou plus d'absence" icon="Refresh">
        <div class="flex items-baseline gap-2">
          <span class="text-4xl font-bold text-on-surface">{data.returningMembers}</span>
          <span class="text-sm text-on-surface-variant">membres « ressuscités » sur 7 jours</span>
        </div>
      </SectionCard>
      <SectionCard title="Rétention par source" description="Taux de membres encore présents, par invitation (90 j)" icon="MailOpen" flush>
        {#if data.retentionBySource.length === 0}
          <EmptyState icon="mailOpen" title="Pas encore de données d'invitation" />
        {:else}
          <div class="divide-y divide-outline-variant/50">
            {#each data.retentionBySource as src}
              <div class="flex items-center justify-between px-5 py-2.5 text-sm">
                <div class="min-w-0">
                  <span class="font-mono text-xs text-on-surface">{src.inviteCode}</span>
                  {#if src.inviterTag}<span class="text-xs text-on-surface-variant/60 ml-2">par {src.inviterTag}</span>{/if}
                </div>
                <div class="flex items-center gap-3 shrink-0">
                  <span class="text-xs text-on-surface-variant">{src.joined} arrivés</span>
                  <span class="font-semibold {pctColor(src.retentionRate)}">{src.retentionRate}%</span>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </SectionCard>
    </div>

    <SectionCard title="Cohortes d'arrivée" description="Pour chaque semaine d'arrivée : % de membres encore présents après 1, 7 et 30 jours" icon="UsersFour" flush>
      {#if data.cohorts.length === 0}
        <EmptyState icon="usersFour" title="Pas encore assez d'historique" description="Les cohortes se construisent au fil des arrivées." />
      {:else}
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-[11px] uppercase tracking-wider text-on-surface-variant/50 border-b border-outline-variant">
                <th class="px-5 py-3">Semaine</th>
                <th class="px-3 py-3 text-right">Arrivées</th>
                <th class="px-3 py-3 text-right">J+1</th>
                <th class="px-3 py-3 text-right">J+7</th>
                <th class="px-5 py-3 text-right">J+30</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-outline-variant/40">
              {#each data.cohorts as c}
                <tr>
                  <td class="px-5 py-2.5 font-mono text-xs text-on-surface">{c.week}</td>
                  <td class="px-3 py-2.5 text-right text-on-surface-variant">{c.joined}</td>
                  {#each [c.d1, c.d7, c.d30] as v, i}
                    <td class="px-3 py-2.5 text-right {i === 2 ? 'px-5' : ''}">
                      {#if v === null}
                        <span class="text-on-surface-variant/30">—</span>
                      {:else}
                        <span class="font-semibold {pctColor(v)}">{v}%</span>
                      {/if}
                    </td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </SectionCard>
  </div>

<!-- ═══════════════ ACTIVITÉ ═══════════════ -->
{:else if section === 'activity' && ready}
  <div class="space-y-4">
    <div class="grid gap-4 grid-cols-2 lg:grid-cols-4">
      {#each [
        { label: 'Actifs aujourd\'hui (DAU)', value: data.dau },
        { label: 'Actifs 7 jours (WAU)', value: data.wau },
        { label: 'Actifs 30 jours (MAU)', value: data.mau },
        { label: 'Assiduité (DAU/MAU)', value: `${data.stickiness}%` },
      ] as stat}
        <div class="section-card p-5">
          <p class="text-[11px] uppercase tracking-wider text-on-surface-variant/50 font-semibold">{stat.label}</p>
          <p class="text-3xl font-bold text-on-surface mt-1.5">{stat.value}</p>
        </div>
      {/each}
    </div>

    <div class="grid gap-4 grid-cols-1 md:grid-cols-2">
      <SectionCard title="30 jours vs 30 jours précédents" icon="Calendar" flush>
        <div class="divide-y divide-outline-variant/40">
          {#each [
            { label: 'Messages', d: data.comparison.messages },
            { label: 'Minutes vocales', d: data.comparison.voiceMinutes },
            { label: 'Arrivées', d: data.comparison.joins },
            { label: 'Départs', d: data.comparison.leaves },
            { label: 'Réactions', d: data.comparison.reactions },
            { label: 'Actifs / jour (moy.)', d: data.comparison.avgActiveMembers },
          ] as row}
            {@const badge = trendBadge(row.d.changePct)}
            <div class="flex items-center justify-between px-5 py-2.5 text-sm">
              <span class="text-on-surface-variant">{row.label}</span>
              <div class="flex items-center gap-3">
                <span class="text-on-surface font-medium">{row.d.current.toLocaleString('fr-FR')}</span>
                <span class="text-[11px] font-bold px-2 py-0.5 rounded-md {badge.cls}">{badge.label}</span>
              </div>
            </div>
          {/each}
        </div>
      </SectionCard>

      <div class="space-y-4">
        <SectionCard title="Records du serveur" icon="Fire" flush>
          <div class="divide-y divide-outline-variant/40">
            {#each [
              { label: 'Meilleur jour (messages)', r: data.records.messages },
              { label: 'Record vocal simultané', r: data.records.peakVoice },
              { label: 'Record de connectés', r: data.records.peakOnline },
            ] as row}
              <div class="flex items-center justify-between px-5 py-2.5 text-sm">
                <span class="text-on-surface-variant">{row.label}</span>
                {#if row.r}
                  <div class="flex items-center gap-3">
                    <span class="text-on-surface font-bold">{row.r.value.toLocaleString('fr-FR')}</span>
                    <span class="font-mono text-[11px] text-on-surface-variant/60">{row.r.date}</span>
                  </div>
                {:else}
                  <span class="text-on-surface-variant/30">—</span>
                {/if}
              </div>
            {/each}
          </div>
        </SectionCard>

        <SectionCard title="Profondeur d'engagement" icon="ChatBubbles">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <p class="text-2xl font-bold text-on-surface">{data.engagement.messagesPerActive}</p>
              <p class="text-xs text-on-surface-variant mt-0.5">messages / membre actif (30 j)</p>
            </div>
            <div>
              <p class="text-2xl font-bold text-on-surface">{data.engagement.voiceShare}%</p>
              <p class="text-xs text-on-surface-variant mt-0.5">part du vocal dans l'activité</p>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  </div>

<!-- ═══════════════ CHURN ═══════════════ -->
{:else if section === 'churn' && ready}
  <div class="space-y-4">
    <div class="grid gap-4 grid-cols-1 md:grid-cols-2">
      <SectionCard title="Départs par ancienneté" description="Ancienneté des membres au moment de leur départ (90 j)" icon="TrendingUp">
        {@const total = Object.values(data.churnByTenure).reduce((s: number, v: any) => s + v, 0)}
        {#if total === 0}
          <EmptyState icon="usersFour" title="Aucun départ enregistré" />
        {:else}
          <div class="space-y-3">
            {#each Object.entries(data.churnByTenure) as [bucket, count]}
              {@const pct = total > 0 ? Math.round(((count as number) / total) * 100) : 0}
              <div>
                <div class="flex justify-between text-xs mb-1">
                  <span class="text-on-surface-variant">{bucket === '<7j' ? 'Moins de 7 jours' : bucket === '7-30j' ? '7 à 30 jours' : bucket === '30-90j' ? '30 à 90 jours' : 'Plus de 90 jours'}</span>
                  <span class="text-on-surface font-medium">{count} ({pct}%)</span>
                </div>
                <div class="h-2 rounded-full bg-surface-container overflow-hidden">
                  <div class="h-full rounded-full {bucket === '<7j' ? 'bg-red-400' : bucket === '7-30j' ? 'bg-amber-500' : 'bg-primary/60'}" style="width: {pct}%"></div>
                </div>
              </div>
            {/each}
          </div>
          <p class="text-[11px] text-on-surface-variant/60 mt-3">Beaucoup de départs « moins de 7 jours » = problème d'accueil. Des départs « 90 j+ » = lassitude des anciens.</p>
        {/if}
      </SectionCard>

      <SectionCard title="Onboarding" description="Nouveaux membres des 30 derniers jours" icon="Sparkles">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <p class="text-2xl font-bold text-on-surface">{fmtHours(data.onboarding.medianFirstMessageHours)}</p>
            <p class="text-xs text-on-surface-variant mt-0.5">délai médian avant le 1er message</p>
          </div>
          <div>
            <p class="text-2xl font-bold {data.onboarding.completionRate != null ? pctColor(data.onboarding.completionRate) : 'text-on-surface'}">
              {data.onboarding.completionRate != null ? `${data.onboarding.completionRate}%` : '—'}
            </p>
            <p class="text-xs text-on-surface-variant mt-0.5">
              écran d'accueil Discord complété ({data.onboarding.completed30d}/{data.onboarding.joined30d})
            </p>
          </div>
        </div>
      </SectionCard>
    </div>

    <SectionCard title="Membres à risque de départ" description="Habituellement actifs (5 j+ d'activité sur 30 j) mais silencieux depuis plus de 7 jours" icon="Warning" flush>
      {#if data.atRisk.length === 0}
        <EmptyState icon="check" title="Aucun membre à risque détecté" description="Tous les membres réguliers sont restés actifs récemment." />
      {:else}
        <div class="divide-y divide-outline-variant/40">
          {#each data.atRisk as m}
            <div class="flex items-center justify-between px-5 py-2.5">
              <div class="flex items-center gap-3 min-w-0">
                {#if m.avatarUrl}
                  <img src={m.avatarUrl} alt="" class="w-7 h-7 rounded-full shrink-0" />
                {:else}
                  <div class="w-7 h-7 rounded-full bg-surface-container shrink-0"></div>
                {/if}
                <span class="text-sm text-on-surface truncate">{m.name}</span>
              </div>
              <div class="flex items-center gap-4 text-xs shrink-0">
                <span class="text-on-surface-variant">{m.activeDays30} j actifs / 30 j</span>
                <span class="text-amber-500 font-medium">inactif depuis le {m.lastActive}</span>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </SectionCard>
  </div>

<!-- ═══════════════ CANAUX ═══════════════ -->
{:else if section === 'channels' && ready}
  <div class="space-y-4">
    <div class="grid gap-4 grid-cols-1 md:grid-cols-2">
      <SectionCard title="Canaux en croissance" description="15 derniers jours vs 15 précédents" icon="TrendingUp" flush>
        {#if data.trends.rising.length === 0}
          <EmptyState icon="chatBubbles" title="Pas assez d'activité" />
        {:else}
          <div class="divide-y divide-outline-variant/40">
            {#each data.trends.rising as t}
              {@const badge = trendBadge(t.changePct)}
              <div class="flex items-center justify-between px-5 py-2.5 text-sm">
                <span class="text-on-surface truncate">{channelName(t.channelId)}</span>
                <div class="flex items-center gap-3 shrink-0">
                  <span class="text-xs text-on-surface-variant">{t.recent.toLocaleString('fr-FR')} msg</span>
                  <span class="text-[11px] font-bold px-2 py-0.5 rounded-md {badge.cls}">{badge.label}</span>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </SectionCard>

      <SectionCard title="Canaux en déclin" description="15 derniers jours vs 15 précédents" icon="TrendingDown" flush>
        {#if data.trends.falling.length === 0}
          <EmptyState icon="chatBubbles" title="Pas assez d'activité" />
        {:else}
          <div class="divide-y divide-outline-variant/40">
            {#each data.trends.falling as t}
              {@const badge = trendBadge(t.changePct)}
              <div class="flex items-center justify-between px-5 py-2.5 text-sm">
                <span class="text-on-surface truncate">{channelName(t.channelId)}</span>
                <div class="flex items-center gap-3 shrink-0">
                  <span class="text-xs text-on-surface-variant">{t.recent.toLocaleString('fr-FR')} msg</span>
                  <span class="text-[11px] font-bold px-2 py-0.5 rounded-md {badge.cls}">{badge.label}</span>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </SectionCard>
    </div>

    <SectionCard title="Co-activation des salons" description="Nombre de membres actifs dans les deux salons à la fois (30 j)" icon="Compass" flush>
      {#if !data.coActivation.available}
        <EmptyState icon="lock" title="Journalisation des messages requise" description="Active la journalisation des messages (Gestion des salons) pour débloquer cette matrice." />
      {:else if data.coActivation.channels.length === 0}
        <EmptyState icon="compass" title="Pas encore assez de données croisées" />
      {:else}
        <div class="overflow-x-auto p-5">
          <table class="text-[11px]">
            <thead>
              <tr>
                <th class="p-1"></th>
                {#each data.coActivation.channels as c}
                  <th class="p-1 font-medium text-on-surface-variant/60 max-w-16 truncate align-bottom" title={channelName(c)}>
                    <div class="rotate-180 [writing-mode:vertical-rl] mx-auto max-h-24 truncate">{channelName(c)}</div>
                  </th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each data.coActivation.channels as rowC, i}
                {@const maxVal = Math.max(1, ...data.coActivation.matrix.flat())}
                <tr>
                  <td class="p-1 pr-2 text-on-surface-variant font-medium whitespace-nowrap max-w-32 truncate" title={channelName(rowC)}>{channelName(rowC)}</td>
                  {#each data.coActivation.channels as _, j}
                    {@const v = data.coActivation.matrix[i][j]}
                    <td class="p-0.5">
                      {#if i === j}
                        <div class="w-7 h-7 rounded bg-surface-container-low"></div>
                      {:else}
                        <div class="w-7 h-7 rounded flex items-center justify-center {heatColor(v, maxVal)} {v > maxVal * 0.5 ? 'text-on-primary' : 'text-on-surface-variant'}" title="{channelName(rowC)} × {channelName(data.coActivation.channels[j])} : {v} membres">
                          {v > 0 ? v : ''}
                        </div>
                      {/if}
                    </td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </SectionCard>
  </div>

<!-- ═══════════════ SOCIAL ═══════════════ -->
{:else if section === 'social' && ready}
  {#if !data.available}
    <SectionCard title="Analyse sociale" icon="Users">
      <EmptyState icon="lock" title="Journalisation des messages requise" description="Active la journalisation des messages pour mesurer la centralité sociale et le temps de réaction aux pings." />
    </SectionCard>
  {:else}
    <div class="space-y-4">
      <div class="grid gap-4 grid-cols-1 md:grid-cols-3">
        <SectionCard title="Réaction aux pings" description="Délai médian avant que le membre mentionné réponde dans le salon" icon="Bell">
          <p class="text-3xl font-bold text-on-surface">{fmtDuration(data.pingReaction.medianSeconds)}</p>
          <p class="text-xs text-on-surface-variant mt-1">sur {data.pingReaction.samples.toLocaleString('fr-FR')} mentions (30 j)</p>
        </SectionCard>

        <div class="md:col-span-2">
          <SectionCard title="Centralité sociale" description="Membres recevant le plus de réponses et de mentions (30 j)" icon="Users" flush>
            {#if data.centrality.length === 0}
              <EmptyState icon="users" title="Pas encore de données" />
            {:else}
              <div class="divide-y divide-outline-variant/40">
                {#each data.centrality as m, i}
                  <div class="flex items-center justify-between px-5 py-2.5">
                    <div class="flex items-center gap-3 min-w-0">
                      <span class="text-[11px] font-bold text-on-surface-variant/40 w-5">{i + 1}</span>
                      {#if m.avatarUrl}
                        <img src={m.avatarUrl} alt="" class="w-7 h-7 rounded-full shrink-0" />
                      {:else}
                        <div class="w-7 h-7 rounded-full bg-surface-container shrink-0"></div>
                      {/if}
                      <span class="text-sm text-on-surface truncate">{m.name}</span>
                    </div>
                    <div class="flex items-center gap-4 text-xs shrink-0 text-on-surface-variant">
                      <span title="Réponses reçues">↩ {m.repliesReceived}</span>
                      <span title="Mentions reçues">@ {m.mentionsReceived}</span>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </SectionCard>
        </div>
      </div>
    </div>
  {/if}

<!-- ═══════════════ MOTS ═══════════════ -->
{:else if section === 'words' && ready}
  <SectionCard title="Mots les plus fréquents" description="Agrégats anonymes sur 30 jours — aucun message ni auteur n'est conservé" icon="ChatCircleDots">
    {#if !data.enabled && data.topWords.length === 0}
      <EmptyState
        icon="chatCircleDots"
        title="Statistiques de mots désactivées"
        description={data.messageLoggingEnabled
          ? "À l'activation, Kotbo indexe les messages déjà journalisés : les mots apparaissent immédiatement, sans attendre."
          : "Active le comptage anonyme des mots pour voir les sujets qui animent ton serveur. Sans journalisation des messages, les stats démarreront à zéro."}
      >
        {#snippet action()}
          <button
            onclick={enableWordStats}
            disabled={enablingWords}
            class="bg-primary text-on-primary px-4 py-2 rounded-lg text-xs font-medium hover:brightness-110 transition-all disabled:opacity-50"
          >
            {enablingWords ? 'Activation…' : 'Activer les stats de mots'}
          </button>
        {/snippet}
      </EmptyState>
    {:else if data.backfill?.status === 'IN_PROGRESS'}
      {@const done = data.backfill.processedMessages ?? 0}
      {@const total = data.backfill.totalMessages ?? 0}
      {@const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0}
      <div class="py-10 px-6 text-center space-y-3">
        <p class="text-sm font-medium text-on-surface">Indexation des messages déjà journalisés…</p>
        <p class="text-[13px] text-on-surface-variant">
          {done.toLocaleString('fr-FR')}{total > 0 ? ` / ${total.toLocaleString('fr-FR')}` : ''} message(s) traité(s)
        </p>
        {#if total > 0}
          <div class="h-2 max-w-sm mx-auto rounded-full bg-surface-container overflow-hidden">
            <div class="h-full rounded-full bg-primary transition-all duration-500" style="width: {pct}%"></div>
          </div>
        {/if}
        <p class="text-[11px] text-on-surface-variant/50">Recharge la page dans quelques instants pour voir les résultats.</p>
      </div>
    {:else if data.backfill?.status === 'FAILED'}
      <EmptyState icon="warning" title="L'indexation a échoué" description={data.backfill.error ?? "Les nouveaux messages continuent d'être comptés."} />
    {:else if data.topWords.length === 0}
      <EmptyState
        icon="hourglass"
        title="Les données s'accumulent"
        description={data.messageLoggingEnabled
          ? "Aucun mot exploitable dans l'historique indexé. Les nouveaux messages continueront d'alimenter les stats."
          : "La journalisation des messages est désactivée : il n'y avait pas d'historique à indexer. Les mots apparaîtront au fil des nouveaux messages."}
      />
    {:else}
      {@const maxCount = data.topWords[0]?.count ?? 1}
      <div class="flex flex-wrap gap-2 items-baseline">
        {#each data.topWords as w}
          {@const scale = 0.75 + (w.count / maxCount) * 1.15}
          <span
            class="px-2.5 py-1 rounded-lg bg-surface-container hover:bg-surface-container-high transition-colors text-on-surface cursor-default"
            style="font-size: {scale}rem; opacity: {0.55 + (w.count / maxCount) * 0.45}"
            title="{w.count.toLocaleString('fr-FR')} occurrences"
          >{w.word}</span>
        {/each}
      </div>
    {/if}
  </SectionCard>

<!-- ═══════════════ MODÉRATION ═══════════════ -->
{:else if section === 'moderation' && ready}
  <div class="space-y-4">
    <div class="grid gap-4 grid-cols-1 md:grid-cols-3">
      <SectionCard title="Récidive après 1er warn" icon="Gavel">
        <p class="text-3xl font-bold {data.recidivism.rate != null ? (data.recidivism.rate > 50 ? 'text-red-400' : data.recidivism.rate > 25 ? 'text-amber-500' : 'text-emerald-500') : 'text-on-surface'}">
          {data.recidivism.rate != null ? `${data.recidivism.rate}%` : '—'}
        </p>
        <p class="text-xs text-on-surface-variant mt-1">
          {data.recidivism.recidivists}/{data.recidivism.firstWarned} membres re-sanctionnés
          {#if data.recidivism.avgDaysToNext != null}· en {data.recidivism.avgDaysToNext} j en moyenne{/if}
        </p>
      </SectionCard>

      <SectionCard title="Pression de modération" description="Sanctions pour 1 000 messages" icon="Gavel">
        {#if data.pressure.length === 0}
          <EmptyState icon="gavel" title="Pas de données" />
        {:else}
          {@const last = data.pressure.at(-1)}
          {@const maxP = Math.max(0.01, ...data.pressure.map((p: any) => p.per1000))}
          <p class="text-3xl font-bold text-on-surface">{last.per1000}</p>
          <p class="text-xs text-on-surface-variant mt-1 mb-3">cette semaine, pour 1 000 messages</p>
          <div class="flex items-end gap-1 h-12">
            {#each data.pressure as p}
              <div class="flex-1 bg-primary/50 rounded-t hover:bg-primary transition-colors" style="height: {Math.max(4, (p.per1000 / maxP) * 100)}%" title="Semaine {p.week} : {p.per1000} / 1000 msg ({p.sanctions} sanctions)"></div>
            {/each}
          </div>
        {/if}
      </SectionCard>

      <SectionCard title="Hygiène des bans" description="Comptes bannis supprimés par Discord" icon="Trash">
        <p class="text-3xl font-bold text-on-surface">{data.cleanableBans}</p>
        <p class="text-xs text-on-surface-variant mt-1">compte(s) nettoyable(s) — le bot notifie le staff sur Discord avec un bouton de nettoyage</p>
      </SectionCard>
    </div>

    <div class="grid gap-4 grid-cols-1 md:grid-cols-2">
      <SectionCard title="Charge par modérateur" description="Sanctions prononcées sur 90 jours" icon="Users" flush>
        {#if data.moderatorLoad.length === 0}
          <EmptyState icon="users" title="Aucune sanction sur la période" />
        {:else}
          {@const maxLoad = data.moderatorLoad[0]?.count ?? 1}
          <div class="divide-y divide-outline-variant/40">
            {#each data.moderatorLoad as m}
              <div class="px-5 py-2.5">
                <div class="flex items-center justify-between text-sm mb-1">
                  <span class="text-on-surface truncate">{m.tag ?? m.userId}</span>
                  <span class="text-on-surface-variant text-xs">{m.count}</span>
                </div>
                <div class="h-1.5 rounded-full bg-surface-container overflow-hidden">
                  <div class="h-full rounded-full bg-primary/60" style="width: {(m.count / maxLoad) * 100}%"></div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </SectionCard>

      <div class="space-y-4">
        <SectionCard title="Ancienneté du compte × infractions" description="Âge du compte Discord au moment de la sanction (90 j)" icon="Clock">
          {@const totalAge = Object.values(data.accountAgeBuckets).reduce((s: number, v: any) => s + v, 0)}
          {#if totalAge === 0}
            <EmptyState icon="clock" title="Aucune sanction sur la période" />
          {:else}
            <div class="space-y-2.5">
              {#each Object.entries(data.accountAgeBuckets) as [bucket, count]}
                {@const pct = totalAge > 0 ? Math.round(((count as number) / totalAge) * 100) : 0}
                <div>
                  <div class="flex justify-between text-xs mb-1">
                    <span class="text-on-surface-variant">Compte de {bucket}</span>
                    <span class="text-on-surface font-medium">{count} ({pct}%)</span>
                  </div>
                  <div class="h-2 rounded-full bg-surface-container overflow-hidden">
                    <div class="h-full rounded-full {bucket === '<30j' ? 'bg-red-400' : bucket === '30-180j' ? 'bg-amber-500' : 'bg-primary/60'}" style="width: {pct}%"></div>
                  </div>
                </div>
              {/each}
            </div>
            <p class="text-[11px] text-on-surface-variant/60 mt-3">Une forte part de comptes « moins de 30 j » suggère des raids ou doubles comptes.</p>
          {/if}
        </SectionCard>

        <SectionCard title="Sources à risque" description="Invitations dont les membres sont le plus sanctionnés (90 j, min. 3 invités)" icon="Warning" flush>
          {#if data.toxicSources.length === 0}
            <EmptyState icon="check" title="Aucune source problématique" />
          {:else}
            <div class="divide-y divide-outline-variant/40">
              {#each data.toxicSources.filter((t: any) => t.sanctioned > 0) as t}
                <div class="flex items-center justify-between px-5 py-2.5 text-sm">
                  <span class="font-mono text-xs text-on-surface">{t.inviteCode}</span>
                  <div class="flex items-center gap-3 text-xs">
                    <span class="text-on-surface-variant">{t.sanctioned}/{t.invited} sanctionnés</span>
                    <span class="font-semibold {t.ratePct > 30 ? 'text-red-400' : t.ratePct > 10 ? 'text-amber-500' : 'text-on-surface-variant'}">{t.ratePct}%</span>
                  </div>
                </div>
              {:else}
                <EmptyState icon="check" title="Aucune source problématique" />
              {/each}
            </div>
          {/if}
        </SectionCard>
      </div>
    </div>

    <SectionCard title="Heures chaudes de modération" description="Quand les sanctions tombent (90 jours) — pour planifier les présences staff" icon="Fire" flush>
      {@const maxHot = Math.max(1, ...data.hotHours.map((h: any) => h.count))}
      {@const hotMap = new Map(data.hotHours.map((h: any) => [`${h.dow}-${h.hour}`, h.count]))}
      <div class="overflow-x-auto p-5">
        <div class="min-w-150">
          <div class="grid gap-0.5" style="grid-template-columns: 2.5rem repeat(24, 1fr)">
            <div></div>
            {#each Array(24) as _, h}
              <div class="text-center text-[9px] text-on-surface-variant/40">{h}</div>
            {/each}
            {#each DOW_LABELS as day, d}
              <div class="text-[10px] text-on-surface-variant/60 flex items-center">{day}</div>
              {#each Array(24) as _, h}
                {@const v = hotMap.get(`${d + 1}-${h}`) ?? 0}
                <div class="aspect-square rounded-sm {heatColor(v, maxHot)}" title="{day} {h}h : {v} sanction(s)"></div>
              {/each}
            {/each}
          </div>
        </div>
      </div>
    </SectionCard>
  </div>
{/if}
