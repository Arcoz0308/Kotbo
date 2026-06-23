<script lang="ts">
import { onMount } from 'svelte';
import { authStore } from '../lib/stores/auth.svelte';
import Papicon from '../lib/components/Papicon.svelte';
import MemberCaseModal from '../lib/components/MemberCaseModal.svelte';
import { fetchAnalytics, fetchMemberCase, fetchInviteAnalytics, fetchHourlyHeatmap, fetchWeeklyComparison, fetchDailyAlgoAnalytics, fetchGlobalInteractions } from '../lib/api';
import AnalyticsSkeleton from '../lib/components/analytics/AnalyticsSkeleton.svelte';
import LoadingHint from '../lib/components/LoadingHint.svelte';
import StatsOverview from '../lib/components/analytics/StatsOverview.svelte';
import EngagementMetrics from '../lib/components/analytics/EngagementMetrics.svelte';
import MembersStats from '../lib/components/analytics/MembersStats.svelte';
import InvitationsStats from '../lib/components/analytics/InvitationsStats.svelte';
import ModerationAudit from '../lib/components/analytics/ModerationAudit.svelte';
import StaffAudit from '../lib/components/analytics/StaffAudit.svelte';
import HourlyHeatmap from '../lib/components/analytics/HourlyHeatmap.svelte';
import WeeklyComparison from '../lib/components/analytics/WeeklyComparison.svelte';
import DailyAlgoAnalyticsCard from '../lib/components/analytics/DailyAlgoAnalyticsCard.svelte';
import CommandUsage from '../lib/components/analytics/CommandUsage.svelte';
import StaffPerformance from '../lib/components/analytics/StaffPerformance.svelte';
import GlobalInteractionGraph from '../lib/components/charts/GlobalInteractionGraph.svelte';
import * as XLSX from 'xlsx';
import { toast } from '../lib/stores/toast.svelte';

  let data: any = $state(null);
  let heatmapData: any = $state(null);
  let weeklyData: any = $state(null);
  let algoData: any = $state(null);
  let interactionsData: any = $state(null);
  let loading = $state(true);
  let loadingInteractions = $state(false);
  let error = $state('');
  let interactionsError = $state('');
  let period = $state(30);
  let startDate = $state('');
  let endDate = $state('');
  let isCustomPeriod = $state(false);

  const periodPresets = [
    { label: '24 heures', value: 1 },
    { label: '7 jours', value: 7 },
    { label: '30 jours', value: 30 },
    { label: '90 jours', value: 90 },
    { label: '365 jours', value: 365 },
    { label: 'Personnalisé', value: 'custom' }
  ];

  let currentInteractionsRequestId = 0;

  async function loadInteractions() {
    const requestId = ++currentInteractionsRequestId;
    loadingInteractions = true;
    interactionsError = '';
    const options = isCustomPeriod 
      ? { startDate, endDate } 
      : { period };

    try {
      const res = await fetchGlobalInteractions(options);
      if (requestId === currentInteractionsRequestId) {
        interactionsData = res;
      }
    } catch (e: any) {
      if (requestId === currentInteractionsRequestId) {
        console.error('Error preloading interactions:', e);
        interactionsError = e.message || 'Erreur lors de la récupération des interactions';
      }
    } finally {
      if (requestId === currentInteractionsRequestId) {
        loadingInteractions = false;
      }
    }
  }

  async function load() {
    loading = true; error = '';
    const options = isCustomPeriod 
      ? { startDate, endDate } 
      : { period, ...(period === 1 ? { granularity: '30' } : {}) };

    try { 
      const [mainData, invites, heatmap, weekly, algo] = await Promise.all([
        fetchAnalytics(options),
        fetchInviteAnalytics(),
        fetchHourlyHeatmap(isCustomPeriod ? { startDate, endDate } : { days: period }),
        fetchWeeklyComparison(),
        fetchDailyAlgoAnalytics(isCustomPeriod ? { startDate, endDate } : { days: period })
      ]);
      data = mainData;
      invitesData = invites;
      heatmapData = heatmap;
      weeklyData = weekly;
      algoData = algo;
      
      // Pre-charge/preload the heavy interactions graph in the background
      loadInteractions();
    }
    catch (e: any) { error = e.message || 'Erreur'; }
    finally { loading = false; }
  }

  onMount(() => {
    // Default to local time for datetime-local
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    endDate = now.toISOString().slice(0, 16);
    
    const start = new Date();
    start.setDate(start.getDate() - 30);
    start.setMinutes(start.getMinutes() - start.getTimezoneOffset());
    startDate = start.toISOString().slice(0, 16);
    
    load();
  });

  function changePeriod(p: number | 'custom') { 
    if (p === 'custom') {
      isCustomPeriod = true;
    } else {
      isCustomPeriod = false;
      period = p; 
      load(); 
    }
  }

  function applyCustomRange() {
    if (startDate && endDate) {
      load();
    }
  }

  type ExportRow = Record<string, string | number | boolean | null>;
  type ExportSheet = { name: string; rows: ExportRow[] };

  function normalizeCellValue(value: unknown): string | number | boolean | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    return JSON.stringify(value);
  }

  function normalizeRow(row: Record<string, unknown>): ExportRow {
    return Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, normalizeCellValue(value)])
    ) as ExportRow;
  }

  function appendExportValue(sheets: ExportSheet[], name: string, value: unknown) {
    if (value === null || value === undefined) return;

    if (Array.isArray(value)) {
      if (value.length === 0) return;
      if (typeof value[0] === 'object' && value[0] !== null) {
        sheets.push({
          name,
          rows: value.map((entry) => normalizeRow(entry as Record<string, unknown>))
        });
      } else {
        sheets.push({
          name,
          rows: value.map((entry, index) => ({ index: index + 1, value: normalizeCellValue(entry) }))
        });
      }
      return;
    }

    if (typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>);
      const arrayEntries = entries.filter(([, entryValue]) => Array.isArray(entryValue));

      if (arrayEntries.length > 0) {
        for (const [key, nestedValue] of arrayEntries) {
          appendExportValue(sheets, `${name}_${key}`, nestedValue);
        }

        const scalarEntries = entries.filter(([, entryValue]) => !Array.isArray(entryValue));
        if (scalarEntries.length > 0) {
          sheets.push({
            name: `${name}_meta`,
            rows: scalarEntries.map(([key, entryValue]) => ({
              key,
              value: normalizeCellValue(entryValue)
            }))
          });
        }
        return;
      }

      sheets.push({ name, rows: [normalizeRow(value as Record<string, unknown>)] });
      return;
    }

    sheets.push({ name, rows: [{ value: normalizeCellValue(value) }] });
  }

  function collectExportSheets(): ExportSheet[] {
    const sheets: ExportSheet[] = [];
    appendExportValue(sheets, 'analytics_dailyTrend', data?.dailyTrend);
    appendExportValue(sheets, 'analytics_topChannels', data?.topChannels);
    appendExportValue(sheets, 'analytics_topMessageMembers', data?.topMessageMembers);
    appendExportValue(sheets, 'analytics_topVoiceMembers', data?.topVoiceMembers);
    appendExportValue(sheets, 'analytics_topInviters', data?.topInviters);
    appendExportValue(sheets, 'analytics_topModerators', data?.topModerators);
    appendExportValue(sheets, 'analytics_topSanctionedMembers', data?.topSanctionedMembers);
    appendExportValue(sheets, 'analytics_recentSanctions', data?.recentSanctions);
    appendExportValue(sheets, 'analytics_staff', data?.staff);
    appendExportValue(sheets, 'analytics_recruitmentPipeline', data?.recruitmentPipeline);
    appendExportValue(sheets, 'analytics_roleDistribution', data?.roleDistribution);
    appendExportValue(sheets, 'analytics_recentJoins', data?.recentJoins);
    appendExportValue(sheets, 'analytics_recentLeaves', data?.recentLeaves);
    appendExportValue(sheets, 'analytics_commandUsage', data?.commandUsage);
    appendExportValue(sheets, 'invites', invitesData);
    appendExportValue(sheets, 'heatmap', heatmapData);
    appendExportValue(sheets, 'weeklyComparison', weeklyData);
    appendExportValue(sheets, 'dailyAlgo', algoData);
    appendExportValue(sheets, 'interactions', interactionsData);
    return sheets;
  }

  function escapeCsvCell(value: string | number | boolean | null): string {
    if (value === null || value === undefined) return '';
    const stringValue = String(value);
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  }

  function triggerDownload(content: BlobPart, fileName: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function exportAllToCSV() {
    const sheets = collectExportSheets();
    if (sheets.length === 0) {
      toast.error('Aucune donnée de graphique à exporter.');
      return;
    }

    const csvParts: string[] = [];
    for (const sheet of sheets) {
      if (!sheet.rows.length) continue;
      const headers = Array.from(new Set(sheet.rows.flatMap((row) => Object.keys(row))));
      csvParts.push(`# ${sheet.name}`);
      csvParts.push(headers.join(','));
      for (const row of sheet.rows) {
        csvParts.push(headers.map((header) => escapeCsvCell(row[header] ?? null)).join(','));
      }
      csvParts.push('');
    }

    const datePart = new Date().toISOString().split('T')[0];
    triggerDownload(csvParts.join('\n'), `analytics_kotbo_all_${datePart}.csv`, 'text/csv;charset=utf-8');
    toast.success('Export CSV des graphiques généré.');
  }

  function sanitizeSheetName(name: string): string {
    return name.replace(/[\\/*?:\[\]]/g, '_').slice(0, 31) || 'sheet';
  }

  function exportAllToXLSX() {
    const sheets = collectExportSheets();
    if (sheets.length === 0) {
      toast.error('Aucune donnée de graphique à exporter.');
      return;
    }

    const workbook = XLSX.utils.book_new();
    for (const sheet of sheets) {
      if (!sheet.rows.length) continue;
      const worksheet = XLSX.utils.json_to_sheet(sheet.rows);
      XLSX.utils.book_append_sheet(workbook, worksheet, sanitizeSheetName(sheet.name));
    }

    const datePart = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `analytics_kotbo_all_${datePart}.xlsx`);
    toast.success('Export XLSX des graphiques généré.');
  }

  function sanitizeFileNamePart(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'chart';
  }

  function isLargeGraphicElement(element: Element): boolean {
    const rect = element.getBoundingClientRect();
    return rect.width >= 280 && rect.height >= 160;
  }

  function resolveGraphicName(element: Element, index: number): string {
    const titleCandidate = element
      .closest('section, article, div')
      ?.querySelector('h1, h2, h3, h4, h5')
      ?.textContent
      ?.trim();
    const safeTitle = sanitizeFileNamePart(titleCandidate || `graph-${index}`);
    return `${String(index).padStart(2, '0')}_${safeTitle}`;
  }

  async function svgToBlob(svg: SVGSVGElement): Promise<Blob | null> {
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svg);
    const svgBlob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Impossible de convertir le SVG'));
        img.src = url;
      });

      const rect = svg.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) return null;
      context.fillStyle = '#0f1118';
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);

      return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function exportAllChartsAsImages() {
    const root = document.getElementById('analytics-export-root');
    if (!root) {
      toast.error('Zone des graphiques introuvable.');
      return;
    }

    const canvases = Array.from(root.querySelectorAll('canvas')).filter(isLargeGraphicElement);
    const svgs = Array.from(root.querySelectorAll('svg')).filter(isLargeGraphicElement);

    if (canvases.length === 0 && svgs.length === 0) {
      toast.error('Aucun graphique visible à exporter en image.');
      return;
    }

    let exportedCount = 0;

    for (const [index, canvas] of canvases.entries()) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) continue;
      triggerDownload(blob, `analytics_${resolveGraphicName(canvas, index + 1)}.png`, 'image/png');
      exportedCount += 1;
    }

    const startIndex = exportedCount;
    for (const [index, svg] of svgs.entries()) {
      const blob = await svgToBlob(svg);
      if (!blob) continue;
      triggerDownload(blob, `analytics_${resolveGraphicName(svg, startIndex + index + 1)}.png`, 'image/png');
      exportedCount += 1;
    }

    if (exportedCount === 0) {
      toast.error('Impossible de générer les images de graphiques.');
      return;
    }

    toast.success(`${exportedCount} image(s) de graphique exportée(s).`);
  }

  let activeCategory = $state('overview');
  let activeTab = $state('overview');

  const categories = [
    { id: 'overview', label: 'Aperçu', icon: 'Grid', description: 'Vue générale' },
    { id: 'engagement', label: 'Engagement', icon: 'ChatBubbles', description: 'Messages, Vocal, Membres' },
    { id: 'moderation', label: 'Modération', icon: 'Gavel', description: 'Modération et Staff' },
    { id: 'invitations', label: 'Invitations', icon: 'MailOpen', description: 'Analyse des invites' },
    { id: 'growth', label: 'Croissance', icon: 'TrendingUp', description: 'Croissance & Rétention' },
  ];

  const tabsByCategory: Record<string, Array<{ id: string; label: string; icon: string; badge?: string; disabled?: boolean }>> = {
    overview: [
      { id: 'overview', label: 'Aperçu Global', icon: 'Grid' },
    ],
    engagement: [
      { id: 'messages', label: 'Messages', icon: 'ChatCircleDots' },
      { id: 'voice', label: 'Vocal', icon: 'Microphone' },
      { id: 'interactions', label: 'Réseau', icon: 'Compass' },
      { id: 'commands', label: 'Commandes', icon: 'Code' },
      { id: 'members', label: 'Membres', icon: 'UsersFour' },
    ],
    moderation: [
      { id: 'moderation', label: 'Modération', icon: 'Gavel' },
      { id: 'staff', label: 'Annuaire Staff', icon: 'Users' },
      { id: 'performance', label: 'Performance Staff', icon: 'TrendUp' },
    ],
    invitations: [
      { id: 'invitations', label: 'Invitations', icon: 'MailOpen' },
    ],
    growth: [
      { id: 'heatmap', label: 'Heatmap Horaire', icon: 'Fire' },
      { id: 'weekly', label: 'Semaine vs Semaine', icon: 'Calendar' },
      { id: 'algo', label: 'Daily Algo', icon: 'Code' },
    ],
  };

  function selectTab(tab: { id: string; disabled?: boolean }) {
    if (tab.disabled) return;
    activeTab = tab.id;
  }

  const currentTabs = $derived(tabsByCategory[activeCategory] || []);

  let invitesData: any = $state(null);
  
  // Member Case Modal state
  let modalOpen = $state(false);
  let selectedUserId = $state<string | null>(null);
  let selectedUserName = $state('');
  let caseData = $state<any>(null);
  let loadingCase = $state(false);
  let caseError = $state('');

  async function openMemberDetails(memberId: string, memberName: string) {
    selectedUserId = memberId;
    selectedUserName = memberName || 'Membre';
    modalOpen = true;
    loadingCase = true;
    caseError = '';
    caseData = null;

    try {
      caseData = await fetchMemberCase(memberId, authStore.selectedGuildId);
    } catch (e: any) {
      console.error(e);
      caseError = e.message || 'Impossible de charger le dossier';
    } finally {
      loadingCase = false;
    }
  }

  const fmt = (n: number) => n?.toLocaleString('fr-FR') ?? '0';
  const fmtH = (mins: number) => { 
    const h = Math.floor((mins || 0) / 60); 
    const m = Math.round((mins || 0) % 60); 
    if (h > 0) return `${h}h${m > 0 ? String(m).padStart(2, '0') : ''}`;
    return `${m}min`;
  };
  const isWeeklyView = $derived(!isCustomPeriod && period > 90);
  const chartLabels = $derived(data?.dailyTrend?.map((d: any) => {
    if (isWeeklyView) {
      // Format: "Sem. DD/MM" (dateKey is already the Monday of the week)
      const parts = d.dateKey?.slice(5)?.split('-');
      return { ...d, label: parts ? `Sem. ${parts[1]}/${parts[0]}` : d.dateKey?.slice(5) };
    }
    return { ...d, label: d.dateKey?.slice(5) };
  }) ?? []);
</script>

<div id="analytics-export-root" class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20 max-w-7xl mx-auto px-4 md:px-8">
  <!-- Header -->
  <div class="relative overflow-hidden bg-surface-container-low/30 p-5 md:p-6 rounded-xl border border-outline-variant/10 group">
    <div class="absolute top-0 right-0 -translate-y-1/2 translate-x-1/4 w-64 h-64 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-colors duration-1000"></div>

    <div class="relative flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      <div class="flex items-center gap-4">
        <div class="bg-primary/10 p-2 rounded-xl text-primary">
          <Papicon icon="ChartLineUp" size={20} />
        </div>
        <div>
          <span class="text-[10px] font-semibold uppercase tracking-widest text-primary">Intelligence & Analytics</span>
          <h2 class="text-lg font-semibold tracking-tight text-on-surface font-headline leading-tight">
            Performance <span class="text-primary">Serveur</span>
          </h2>
          <p class="text-on-surface-variant/60 text-sm max-w-md">Analysez la croissance, l'engagement et l'activité de votre communauté en temps réel.</p>
        </div>
      </div>

      <div class="flex flex-col items-end gap-3 w-full md:w-auto">
        <div class="flex flex-wrap items-center justify-end gap-2">
          <button
            onclick={exportAllToCSV}
            class="flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-semibold uppercase tracking-widest bg-surface-container-high/40 border border-outline-variant/10 hover:bg-surface-container-high transition-colors"
          >
            <Papicon icon="DownloadSimple" size={14} /> Export CSV
          </button>

          <button
            onclick={exportAllToXLSX}
            class="flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-semibold uppercase tracking-widest bg-surface-container-high/40 border border-outline-variant/10 hover:bg-surface-container-high transition-colors"
          >
            <Papicon icon="file-text" size={14} /> Export XLSX
          </button>

          <button
            onclick={exportAllChartsAsImages}
            class="flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-semibold uppercase tracking-widest bg-surface-container-high/40 border border-outline-variant/10 hover:bg-surface-container-high transition-colors"
          >
            <Papicon icon="image" size={14} /> Export Images
          </button>

          <div class="flex flex-col gap-2">
            <div class="flex gap-1 bg-surface-container-high/40 p-1.5 rounded-lg border border-outline-variant/10 overflow-x-auto no-scrollbar">
              {#each periodPresets as p}
                <button
                  onclick={() => changePeriod(p.value as any)}
                  class="px-3 py-2 rounded-lg text-[10px] font-semibold uppercase tracking-widest transition-all duration-300 whitespace-nowrap { (isCustomPeriod ? p.value === 'custom' : period === p.value) ? 'bg-on-surface text-surface shadow-sm' : 'text-on-surface-variant/60 hover:text-on-surface hover:bg-surface-container-high'}"
                >
                  {p.label}
                </button>
              {/each}
            </div>

            {#if isCustomPeriod}
              <div class="flex items-center gap-2 animate-in fade-in zoom-in-95 duration-300">
                <input
                  type="datetime-local"
                  bind:value={startDate}
                  class="bg-surface-container-low border border-outline-variant/10 rounded-lg px-3 py-1.5 text-xs text-on-surface focus:outline-none focus:border-primary transition-colors"
                />
                <span class="text-[10px] font-bold text-on-surface-variant/40">au</span>
                <input
                  type="datetime-local"
                  bind:value={endDate}
                  class="bg-surface-container-low border border-outline-variant/10 rounded-lg px-3 py-1.5 text-xs text-on-surface focus:outline-none focus:border-primary transition-colors"
                />
                <button
                  onclick={applyCustomRange}
                  class="bg-primary text-on-primary px-3 py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-widest hover:brightness-110 transition-all"
                >
                  Appliquer
                </button>
              </div>
            {/if}
          </div>
        </div>
        {#if data?.totals}
          <div class="flex items-center gap-3 text-xs font-bold text-on-surface-variant/40 bg-surface-container-low/40 px-3 py-1.5 rounded-lg border border-outline-variant/5">
             <div class="flex items-center gap-2">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Live Feed</span>
             </div>
             <span class="w-px h-3 bg-outline-variant/20"></span>
             <span>Dernière mise à jour: {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- Navigation Catégories -->
  <div class="sticky top-4 z-40 flex justify-center">
    <div class="flex gap-1 bg-surface-container-low/60 p-1.5 rounded-xl border border-outline-variant/10 shadow-sm shadow-surface/20 overflow-x-auto no-scrollbar max-w-full">
      {#each categories as cat}
        <button 
          onclick={() => { activeCategory = cat.id; activeTab = tabsByCategory[cat.id]?.[0]?.id || cat.id; }} 
          class="flex items-center gap-2.5 px-6 py-3.5 rounded-xl text-[10px] font-semibold uppercase tracking-widest transition-all duration-400 whitespace-nowrap group {activeCategory === cat.id ? 'bg-primary text-on-primary shadow-lg shadow-primary/25 scale-[1.02]' : 'text-on-surface-variant/60 hover:text-on-surface hover:bg-surface-container-high'}"
          title={cat.description}
        >
          <div class="transition-transform group-hover:scale-110 {activeCategory === cat.id ? 'text-on-primary' : 'text-primary'}">
            <Papicon icon={cat.icon} size={16} />
          </div>
          {cat.label}
        </button>
      {/each}
    </div>
  </div>

  <!-- Navigation Onglets (sous-catégories) -->
  {#if currentTabs.length > 1}
    <div class="flex justify-center">
      <div class="flex gap-1 bg-surface-container p-1.5 rounded-lg border border-outline-variant">
        {#each currentTabs as tab}
          <button 
            onclick={() => selectTab(tab)}
            disabled={tab.disabled}
            aria-disabled={tab.disabled}
            class="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all duration-300 whitespace-nowrap {tab.disabled ? 'bg-surface-container-high/40 text-on-surface-variant/30 cursor-not-allowed opacity-70' : activeTab === tab.id ? 'bg-primary text-on-primary shadow-lg' : 'text-on-surface-variant/60 hover:text-on-surface hover:bg-surface-container-high'}"
          >
            <div class="transition-transform {tab.disabled ? 'text-on-surface-variant/30' : activeTab === tab.id ? 'text-on-primary' : 'text-primary'}">
              <Papicon icon={tab.icon} size={14} />
            </div>
            {tab.label}
            {#if tab.badge}
              <span class="ml-1 rounded-full border border-current/20 bg-current/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest {tab.disabled ? 'text-on-surface-variant/35' : 'text-current/80'}">
                {tab.badge}
              </span>
            {/if}
          </button>
        {/each}
      </div>
    </div>
  {/if}


  {#if loading}
    <AnalyticsSkeleton />
    <div class="flex justify-center mt-4">
      <LoadingHint context="analytics" />
    </div>
  {:else if error}

    <div class="bg-error-container/10 border border-error/20 p-5 rounded-xl text-error text-sm font-bold flex items-center gap-3">
      <Papicon icon="alert-octagon" size={20} />{error}
    </div>
  {:else if data}

    {#if activeTab === 'overview'}
      <StatsOverview {data} {chartLabels} />
    {:else if activeTab === 'messages' || activeTab === 'voice'}
      <EngagementMetrics {data} mode={activeTab} onOpenMember={openMemberDetails} />
    {:else if activeTab === 'interactions'}
      {#if loadingInteractions}
        <div class="w-full h-155 rounded-xl border border-white/5 bg-surface-container-low/50 flex flex-col items-center justify-center gap-4 text-on-surface-variant p-8">
          <div class="relative w-16 h-16 flex items-center justify-center">
            <div class="absolute inset-0 rounded-full border-4 border-primary/10 border-t-primary animate-spin"></div>
            <div class="absolute inset-2 rounded-full border-4 border-secondary/10 border-t-secondary animate-spin" style="animation-direction: reverse; animation-duration: 1.5s;"></div>
          </div>
          <div class="flex flex-col items-center text-center mt-2">
            <span class="text-sm font-semibold uppercase tracking-wider text-primary animate-pulse">Chargement du Réseau...</span>
            <LoadingHint context="network" />
          </div>
        </div>
      {:else if interactionsError}
        <div class="w-full h-155 rounded-xl border border-error/10 bg-error-container/5 flex flex-col items-center justify-center gap-4 text-error p-8 text-center">
          <div class="w-12 h-12 rounded-full bg-error/10 flex items-center justify-center text-error mb-2">
            <Papicon icon="alert-octagon" size={24} />
          </div>
          <span class="text-sm font-semibold uppercase tracking-wider">Impossible de charger le graphe de réseau</span>
          <span class="text-xs text-on-surface-variant/60 max-w-md">{interactionsError}</span>
          <button 
            onclick={loadInteractions}
            class="mt-2 px-5 py-2.5 bg-error/10 hover:bg-error/20 border border-error/20 hover:border-error/30 rounded-full text-xs font-semibold uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            Réessayer
          </button>
        </div>
      {:else if interactionsData}
        <GlobalInteractionGraph 
          nodes={interactionsData.nodes || []} 
          edges={interactionsData.edges || []} 
          onSelectNode={(userId) => openMemberDetails(userId, 'Chargement...')}
        />
      {/if}
    {:else if activeTab === 'members'}
      <MembersStats {data} {chartLabels} onOpenMember={openMemberDetails} />
    {:else if activeTab === 'invitations'}
      <InvitationsStats {invitesData} />
    {:else if activeTab === 'moderation'}
      <ModerationAudit {data} {chartLabels} onOpenMember={openMemberDetails} />
    {:else if activeTab === 'staff'}
      <StaffAudit {data} onOpenMember={openMemberDetails} {fmt} {fmtH} />
    {:else if activeTab === 'heatmap' && heatmapData}
      <HourlyHeatmap data={heatmapData} />
    {:else if activeTab === 'weekly' && weeklyData}
      <WeeklyComparison data={weeklyData} />
    {:else if activeTab === 'algo' && algoData}
      <DailyAlgoAnalyticsCard data={algoData} />
    {:else if activeTab === 'commands'}
      {#if data?.commandUsage && data.commandUsage.length > 0}
        <CommandUsage data={data.commandUsage} />
      {:else}
        <div class="rounded-xl border border-outline-variant/10 bg-surface-container-low/40 p-10 text-center">
          <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Papicon icon="Code" size={26} />
          </div>
          <h3 class="text-lg font-semibold text-on-surface">Aucune commande enregistrée sur la période</h3>
          <p class="mt-2 text-sm text-on-surface-variant/70">
            Les statistiques de commandes apparaîtront automatiquement dès qu'un membre utilisera des commandes du bot.
          </p>
        </div>
      {/if}
    {:else if activeTab === 'performance' && data?.staffPerformance}
      <StaffPerformance data={data.staffPerformance} onOpenMember={openMemberDetails} />
    {/if}
  {/if}

  <!-- Member Case Modal -->
  <MemberCaseModal
    bind:open={modalOpen}
    userId={selectedUserId}
    userName={selectedUserName}
    {caseData}
    loading={loadingCase}
    error={caseError}
    onClose={() => {
      modalOpen = false;
    }}
    onSelectUser={(userId) => {
      openMemberDetails(userId, 'Chargement...');
    }}
  />
</div>

