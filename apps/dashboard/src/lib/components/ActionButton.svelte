<script lang="ts">
  type ButtonVariant = 'primary' | 'success' | 'muted' | 'danger' | 'neutral' | 'warning';
  type ButtonSize = 'sm' | 'md' | 'lg';

  const {
    onClick,
    onclick,
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
    onclick?: (event: MouseEvent) => void;
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
    'inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50';

  const sizeClasses: Record<ButtonSize, string> = {
    sm: 'px-2.5 py-1.5 text-xs rounded-md',
    md: 'px-3.5 py-2 text-sm rounded-lg',
    lg: 'px-5 py-2.5 text-sm rounded-lg',
  };

  const variantClasses: Record<ButtonVariant, string> = {
    primary:
      'bg-primary text-on-primary hover:opacity-90',
    success:
      'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 hover:bg-emerald-100 dark:hover:bg-emerald-500/15',
    muted:
      'bg-surface-container text-on-surface-variant border border-outline-variant hover:bg-surface-container-high hover:text-on-surface',
    danger:
      'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/20 hover:bg-red-100 dark:hover:bg-red-500/15',
    neutral:
      'bg-surface-container text-on-surface border border-outline-variant hover:bg-surface-container-high',
    warning:
      'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20 hover:bg-amber-100 dark:hover:bg-amber-500/15',
  };

  import Papicon from './Papicon.svelte';
</script>

<button
  {type}
  onclick={onClick ?? onclick}
  {disabled}
  {title}
  class="{baseClass} {sizeClasses[size]} {variantClasses[variant]} {fullWidth ? 'w-full' : ''} {className}"
>
  {#if icon}
    <Papicon {icon} size={size === 'sm' ? 13 : 15} />
  {/if}
  <span>{label}</span>
</button>
