<script lang="ts">
  let { 
    class: className = '', 
    width = 'w-full', 
    height = 'h-4', 
    rounded = 'rounded-lg',
    circle = false,
    radius = '',
    style = '',
    ...rest
  } = $props();

  const isTailwindWidth = $derived(width.startsWith('w-') || width.startsWith('max-w-') || width.startsWith('min-w-'));
  const isTailwindHeight = $derived(height.startsWith('h-') || height.startsWith('max-h-') || height.startsWith('min-h-'));

  const computedStyle = $derived(
    [
      radius ? `border-radius: ${radius}` : '',
      !isTailwindWidth ? `width: ${width}` : '',
      !isTailwindHeight ? `height: ${height}` : '',
      style
    ].filter(Boolean).join('; ')
  );
</script>

<div 
  class="animate-pulse bg-surface-container-highest/60 {circle ? 'rounded-full' : rounded} {isTailwindWidth ? width : ''} {isTailwindHeight ? height : ''} {className}"
  style={computedStyle}
  aria-hidden="true"
  {...rest}
></div>
