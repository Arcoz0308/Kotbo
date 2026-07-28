<script lang="ts">
  import { getLucideIcon } from "../icons/lucide";

  const {
    icon = "",
    name = "",
    size = 24,
    class: className = ""
  }: {
    icon?: string;
    name?: string;
    size?: number;
    class?: string;
    children?: import('svelte').Snippet;
  } = $props();

  const requestedIcon = $derived(icon || name);
  const LucideComponent = $derived(getLucideIcon(requestedIcon));
</script>

{#key requestedIcon}
  <LucideComponent size={size} class={className} stroke-width={2.25} />
{/key}
