<script lang="ts">
  import { toast, type Toast as ToastType } from '../stores/toast.svelte';
  import Papicon from './Papicon.svelte';

  let { item }: { item: ToastType } = $props();

  const iconName = $derived({
    success: 'check_circle',
    error: 'error',
    warning: 'warning',
    info: 'info'
  }[item.type]);

  const colorClass = $derived({
    success: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    error: 'bg-red-500/10 text-red-500 border-red-500/20',
    warning: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    info: 'bg-blue-500/10 text-blue-500 border-blue-500/20'
  }[item.type]);
</script>

<div 
  class="flex items-center gap-3 p-4 rounded-xl border backdrop-blur-md shadow-lg animate-in slide-in-from-right fade-in duration-300 {colorClass}"
  role="alert"
>
  <Papicon name={iconName} size={20} />
  <p class="text-sm font-medium">{item.message}</p>
  <button 
    onclick={() => toast.remove(item.id)}
    class="ml-auto p-1 hover:bg-black/5 rounded-lg transition-colors"
  >
    <Papicon name="close" size={16} />
  </button>
</div>
