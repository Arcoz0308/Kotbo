<script lang="ts">
  let { 
    class: className = '', 
    width = 'w-full', 
    height = 'h-4', 
    rounded = 'rounded-lg',
    circle = false
  } = $props();
</script>

<div 
  class="animate-pulse bg-surface-container-highest/60 {circle ? 'rounded-full' : rounded} {width} {height} {className}"
  aria-hidden="true"
></div>
