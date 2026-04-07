<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';

  type InputValue = string | number;

  let {
    id = '',
    type = 'text',
    value = $bindable<InputValue>(''),
    placeholder = '',
    disabled = false,
    readonly = false,
    autocomplete,
    className = '',
    oninput,
    onchange,
  }: {
    id?: string;
    type?: string;
    value?: InputValue;
    placeholder?: string;
    disabled?: boolean;
    readonly?: boolean;
    autocomplete?: HTMLInputAttributes['autocomplete'];
    className?: string;
    oninput?: (event: Event) => void;
    onchange?: (event: Event) => void;
  } = $props();
</script>

<input
  {id}
  {type}
  bind:value
  {placeholder}
  {disabled}
  {readonly}
  {autocomplete}
  oninput={oninput}
  onchange={onchange}
  class={className}
/>
