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
      track: 'w-9 h-5',
      knob: 'after:top-[2px] after:left-[2px] after:h-4 after:w-4'
    },
    md: {
      track: 'w-11 h-6',
      knob: 'after:top-[2px] after:left-[2px] after:h-5 after:w-5'
    },
    lg: {
      track: 'w-14 h-7',
      knob: 'after:top-[4px] after:left-[4px] after:h-5 after:w-5'
    }
  };

  const selectedSize = $derived(sizeClasses[size] || sizeClasses.md);
</script>

<label class="relative inline-flex items-center cursor-pointer">
  <input
    {id}
    type="checkbox"
    {disabled}
    {checked}
    onchange={(event) => onToggle(event.currentTarget.checked)}
    class="sr-only peer"
  />
  <div
    class="{selectedSize.track} bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white {selectedSize.knob} after:content-[''] after:absolute after:bg-white after:border-gray-300 after:border after:rounded-full after:transition-all {activeClass}"
  ></div>
</label>
