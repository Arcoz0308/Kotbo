<script lang="ts">
  import { Papicons } from "@getpapillon/papicons";
  import * as LucideIcons from "lucide-svelte";
  import { availablePapicons, toPapiconsName } from "../icons/papicons";

  const {
    icon = "",
    size = 24,
    class: className = ""
  }: {
    icon?: string;
    size?: number;
    class?: string;
    children?: import('svelte').Snippet;
  } = $props();

  function unwrapReactComponent(node: any) {
    if (!node) return null;
    let current = node;
    let depth = 0;

    while (current && typeof current.type === "function" && depth < 5) {
      current = current.type(current.props || {});
      depth += 1;
    }

    return current;
  }

  function flattenChildren(children: any) {
    if (children == null) return [];
    const stack = Array.isArray(children) ? [...children] : [children];
    const flattened = [];

    while (stack.length > 0) {
      const child = stack.shift();
      if (Array.isArray(child)) {
        stack.unshift(...child);
      } else if (child != null && typeof child === "object") {
        flattened.push(child);
      }
    }

    return flattened;
  }

  const safeIcon = $derived(typeof icon === "string" ? icon : "");
  const iconName = $derived(toPapiconsName(safeIcon));
  const isPapiconAvailable = $derived(availablePapicons.has(iconName));

  // Repli Lucide : iconName est deja en PascalCase, safeIcon couvre les noms
  // Lucide passes tels quels.
  const LucideComponent = $derived((LucideIcons as any)[iconName] || (LucideIcons as any)[safeIcon] || LucideIcons.HelpCircle);

  const reactIcon = $derived.by(() => {
    if (!isPapiconAvailable || !iconName) return null;
    try {
      return unwrapReactComponent(Papicons({ name: iconName, size, className }));
    } catch {
      return null;
    }
  });
  const svgProps = $derived(reactIcon?.props || {});
  const svgChildren = $derived(flattenChildren(svgProps.children));
</script>

{#key iconName}
  {#if isPapiconAvailable && reactIcon}
    <svg
      width={svgProps.width ?? size}
      height={svgProps.height ?? size}
      viewBox={svgProps.viewBox ?? "0 0 24 24"}
      fill={svgProps.fill ?? "none"}
      xmlns="http://www.w3.org/2000/svg"
      class={className}
    >
      {#each svgChildren as child}
        {#if child.type === 'path'}
          <path
            d={child.props?.d}
            fill={child.props?.fill ?? "currentColor"}
            fill-rule={child.props?.fillRule}
            clip-rule={child.props?.clipRule}
          />
        {:else}
          {@const Tag = child.type}
          <Tag
            {...child.props}
            fill={child.props?.fill ?? (['line', 'polyline', 'polygon'].includes(child.type) ? 'none' : 'currentColor')}
          />
        {/if}
      {/each}
    </svg>
  {:else}
    <LucideComponent size={size} class={className} stroke-width={2.5} />
  {/if}
{/key}
