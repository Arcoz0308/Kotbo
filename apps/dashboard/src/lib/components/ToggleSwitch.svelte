<script lang="ts">
  let {
    checked = false,
    disabled = false,
    onToggle = () => {},
    size = 'md',
    activeClass = 'peer-checked:bg-primary',
    id = undefined
  } = $props();

  const sizeClasses = {
    sm: {
      track: 'w-8 h-[18px]',
      knob: 'after:top-[2px] after:left-[2px] after:h-3.5 after:w-3.5'
    },
    md: {
      track: 'w-10 h-5',
      knob: 'after:top-[2px] after:left-[2px] after:h-4 after:w-4'
    },
    lg: {
      track: 'w-12 h-6',
      knob: 'after:top-[3px] after:left-[3px] after:h-4.5 after:w-4.5'
    }
  } as Record<string, { track: string; knob: string }>;

  const selectedSize = $derived(sizeClasses[size] || sizeClasses.md);
</script>

<label class="relative inline-flex items-center {disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}">
  <input
    {id}
    type="checkbox"
    {disabled}
    {checked}
    onchange={(event) => onToggle(event.currentTarget.checked)}
    class="sr-only peer"
  />
  <div
    class="{selectedSize.track} bg-gray-200 dark:bg-zinc-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white {selectedSize.knob} after:content-[''] after:absolute after:bg-white after:rounded-full after:transition-all {activeClass}"
  ></div>
</label>
