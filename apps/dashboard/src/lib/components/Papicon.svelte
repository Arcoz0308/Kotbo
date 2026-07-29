<script lang="ts">
  import { Papicons } from "@getpapillon/papicons";
  import { availablePapicons, toPapiconsName } from "../icons/papicons";
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
    const flattened: any[] = [];

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

  const requestedIcon = $derived(icon || name);
  const mergedClassName = $derived(`${className} ${classNameAlias} ${legacyClassName}`.trim());
  const iconName = $derived(toPapiconsName(requestedIcon));
  const isPapiconAvailable = $derived(availablePapicons.has(iconName));

  const reactIcon = $derived.by(() => {
    if (!isPapiconAvailable || !iconName) return null;
    try {
      return unwrapReactComponent((Papicons as any)({ name: iconName, size, className: mergedClassName }));
    } catch {
      return null;
    }
  });
  const svgProps = $derived(reactIcon?.props ?? {});
  const svgChildren = $derived(flattenChildren(svgProps.children));

  const LucideComponent = $derived(getLucideIcon(requestedIcon));
</script>

{#key isPapiconAvailable ? iconName : requestedIcon}
  {#if isPapiconAvailable && reactIcon}
    <svg
      width={svgProps.width ?? size}
      height={svgProps.height ?? size}
      viewBox={svgProps.viewBox ?? "0 0 24 24"}
      fill={svgProps.fill ?? "none"}
      xmlns="http://www.w3.org/2000/svg"
      class={mergedClassName}
      {style}
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
    <LucideComponent size={size} class={mergedClassName} {style} stroke-width={2.25} />
  {/if}
{/key}
