<script lang="ts">
  let {
    text = 'Les données saisies sont traitées pour fournir la fonctionnalité demandée.',
    compact = false,
    showDca = false,
  } = $props<{ text?: string; compact?: boolean; showDca?: boolean }>();
</script>

<div class="rounded-lg border border-outline-variant/30 bg-surface-container-low/40 text-on-surface-variant {compact ? 'px-3 py-2 text-[10px]' : 'px-4 py-3 text-xs'} leading-relaxed">
  <span>{text}</span>{' '}
  <a href="https://kotbo.fr/terms" target="_blank" rel="noopener noreferrer" class="font-semibold text-primary hover:underline">Confidentialité</a>
  <span aria-hidden="true"> · </span>
  {#if showDca}
    <a href="https://kotbo.fr/dca" target="_blank" rel="noopener noreferrer" class="font-semibold text-primary hover:underline">Détection double compte</a>
    <span aria-hidden="true"> · </span>
  {/if}
  <a href="https://kotbo.fr/cookies" target="_blank" rel="noopener noreferrer" class="font-semibold text-primary hover:underline">Cookies</a>
</div>
