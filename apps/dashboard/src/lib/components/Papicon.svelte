<script lang="ts">
  import { Papicons } from "@getpapillon/papicons";

  
  export let icon = "";
  
  export let size = 24;
  
  let className = "";
  export { className as class };

  const fallbackIconName = "Grid";

  const iconAliases = {
    "alert-triangle": "AlertTriangle",
    "gavel": "Grid",
    "policy": "Grid",
    "admin_panel_settings": "Grid"
  };

  function toPapiconsName(value) {
    const normalized = (value || "").trim();
    if (!normalized) return fallbackIconName;

    const lower = normalized.toLowerCase();
    if (iconAliases[lower]) return iconAliases[lower];

    return normalized
      .split(/[\s_-]+/)
      .filter(Boolean)
      .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
      .join("");
  }

  function unwrapReactComponent(node) {
    let current = node;
    let depth = 0;

    while (current && typeof current.type === "function" && depth < 5) {
      current = current.type(current.props || {});
      depth += 1;
    }

    return current;
  }

  function flattenChildren(children) {
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

  $: iconName = toPapiconsName(icon);
  $: reactIcon = unwrapReactComponent(Papicons({ name: iconName, size, className }));
  $: svgProps = reactIcon?.props || {};
  $: svgChildren = flattenChildren(svgProps.children);
</script>

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
    {/if}
  {/each}
</svg>
