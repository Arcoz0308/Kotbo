<script lang="ts">
  import type { ReportRuleOption } from '../../sanctions/reportRules';

  let {
    id,
    options,
    selectedIds,
    disabled = false,
    placeholder = 'Aucune regle selectionnee',
    onToggle,
  }: {
    id: string;
    options: ReportRuleOption[];
    selectedIds: string[];
    disabled?: boolean;
    placeholder?: string;
    onToggle?: (ruleId: string, checked: boolean) => void;
  } = $props();

  const summaryLabel = $derived(
    selectedIds.length > 0 ? `${selectedIds.length} regle(s) selectionnee(s)` : placeholder
  );

  function handleToggle(event: Event, ruleId: string) {
    if (!onToggle) return;
    onToggle(ruleId, (event.currentTarget as HTMLInputElement).checked);
  }
</script>

<details {id} class="mt-1 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 p-2">
  <summary class="list-none cursor-pointer rounded-lg px-2 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100/80 dark:hover:bg-slate-700/60 transition-colors">
    {summaryLabel}
  </summary>
  <div class="mt-2 max-h-56 overflow-y-auto space-y-2 pr-1">
    {#each options as rule}
      <label class="flex items-start gap-2 rounded-lg px-2 py-2 text-xs {disabled ? 'opacity-80' : 'hover:bg-slate-100/80 dark:hover:bg-slate-700/60 transition-colors'}">
        <input
          type="checkbox"
          checked={selectedIds.includes(rule.id)}
          disabled={disabled}
          onchange={(event) => handleToggle(event, rule.id)}
          class="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary disabled:opacity-100"
        />
        <span>
          <span class="block font-bold text-slate-800 dark:text-slate-100">[{rule.scope}] {rule.label}</span>
          <span class="block text-[11px] text-on-surface-variant">{rule.details}</span>
        </span>
      </label>
    {/each}
  </div>
</details>
