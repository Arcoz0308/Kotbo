<script lang="ts">
  import { getLucideIcon } from "../icons/lucide";

  const {
    icon = "",
    name = "",
    size = 24,
    class: className = "",
    className: classNameAlias = "",
    class_: legacyClassName = "",
    style = ""
  }: {
    icon?: string;
    name?: string;
    size?: number;
    class?: string;
    className?: string;
    class_?: string;
    style?: string;
    children?: import('svelte').Snippet;
  } = $props();

  const requestedIcon = $derived(icon || name);
  const LucideComponent = $derived(getLucideIcon(requestedIcon));
</script>

{#key requestedIcon}
  <LucideComponent size={size} class={`${className} ${classNameAlias} ${legacyClassName}`.trim()} {style} stroke-width={2.25} />
{/key}
