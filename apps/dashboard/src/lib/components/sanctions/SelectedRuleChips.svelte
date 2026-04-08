<script lang="ts">
  import type { ReportRuleOption } from '../../sanctions/reportRules';

  let {
    selectedRules,
  }: {
    selectedRules: ReportRuleOption[];
  } = $props();
</script>

{#if selectedRules.length > 0}
  <div class="flex flex-wrap gap-2">
    {#each selectedRules as selectedRule}
      <span class="inline-flex items-center rounded-full bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200 px-3 py-1 text-[10px] font-bold uppercase tracking-wide">
        {selectedRule.emoji ? `${selectedRule.emoji} ` : ''}{selectedRule.label}
      </span>
    {/each}
  </div>
{/if}
