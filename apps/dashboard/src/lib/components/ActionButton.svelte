<script lang="ts">
  type ButtonVariant = 'primary' | 'success' | 'muted' | 'danger' | 'neutral' | 'warning';
  type ButtonSize = 'sm' | 'md' | 'lg';

  let {
    onClick,
    type = 'button',
    variant = 'neutral',
    size = 'md',
    fullWidth = false,
    disabled = false,
    title = '',
    icon = '',
    label,
    className = '',
  }: {
    onClick?: (event: MouseEvent) => void;
    type?: 'button' | 'submit' | 'reset';
    variant?: ButtonVariant;
    size?: ButtonSize;
    fullWidth?: boolean;
    disabled?: boolean;
    title?: string;
    icon?: string;
    label: string;
    className?: string;
    children?: import('svelte').Snippet;
  } = $props();

  const baseClass =
    'group inline-flex items-center justify-center gap-2.5 font-black uppercase tracking-[0.12em] whitespace-nowrap transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60';

  const sizeClasses: Record<ButtonSize, string> = {
    sm: 'px-3 py-1.5 text-[10px] rounded-xl',
    md: 'px-4 py-2.5 text-xs rounded-xl',
    lg: 'px-5 py-3 text-sm rounded-2xl',
  };

  const variantClasses: Record<ButtonVariant, string> = {
    primary:
      'bg-primary text-on-primary border border-primary shadow-lg shadow-primary/20 hover:bg-primary-container active:scale-95',
    success:
      'bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 hover:bg-emerald-500/15 dark:text-emerald-300',
    muted:
      'bg-surface-container-low text-on-surface-variant border border-outline-variant/30 hover:bg-surface-container-high hover:text-on-surface',
    danger:
      'bg-error/10 text-error border border-error/20 hover:bg-error/15',
    neutral:
      'bg-surface-container-low text-on-surface border border-outline-variant/30 hover:bg-surface-container-high',
    warning:
      'bg-amber-500/10 text-amber-700 border border-amber-500/20 hover:bg-amber-500/15 dark:text-amber-300',
  };

  import Papicon from './Papicon.svelte';
  const iconBubbleClass = 'inline-flex h-5 w-5 items-center justify-center rounded-lg bg-black/5 transition-transform duration-200 group-hover:scale-105 dark:bg-white/10';
</script>

<button
  {type}
  onclick={onClick}
  {disabled}
  {title}
  class="{baseClass} {sizeClasses[size]} {variantClasses[variant]} {fullWidth ? 'w-full' : ''} {className}"
>
  {#if icon}
    <Papicon {icon} size={14} class={iconBubbleClass} />
  {/if}
  <span>{label}</span>
</button>
