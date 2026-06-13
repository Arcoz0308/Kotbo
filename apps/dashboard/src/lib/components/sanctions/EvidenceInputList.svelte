<script lang="ts">
  import Papicon from '../Papicon.svelte';
  import { normalizeEvidenceLinks } from '../../sanctions/evidenceLinks';

  let { 
    links = $bindable([]),
    disabled = false,
    placeholder = "Lien de preuve (https://...)",
    labelId = '',
    inputIdPrefix = ''
  } = $props<{
    links: string[];
    disabled?: boolean;
    placeholder?: string;
    labelId?: string;
    inputIdPrefix?: string;
  }>();

  const initialLinks = normalizeEvidenceLinks(links, true);
  if (initialLinks.length !== links.length || initialLinks.some((link, index) => link !== links[index])) {
    links = initialLinks;
  }

  function addLink() {
    links = [...normalizeEvidenceLinks(links, true), ''];
  }

  function removeLink(index: number) {
    const normalized = normalizeEvidenceLinks(links, true);
    if (normalized.length <= 1) {
      links = [''];
      return;
    }
    links = normalized.filter((_, i) => i !== index);
  }

  function handleInput(index: number, value: string) {
    links = normalizeEvidenceLinks(links, true).map((link, i) => i === index ? value : link);
  }
</script>

<div class="space-y-3" role={labelId ? 'group' : undefined} aria-labelledby={labelId || undefined}>
  {#each links as link, index (index)}
    <div class="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-200">
      <div class="relative flex-1 group">
        <div class="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/30 group-focus-within:text-primary transition-colors">
          <Papicon icon="link" size={14} />
        </div>
        <input
          id={inputIdPrefix ? `${inputIdPrefix}-${index}` : undefined}
          type="url"
          value={link}
          oninput={(e) => handleInput(index, e.currentTarget.value)}
          {placeholder}
          {disabled}
          class="w-full rounded-2xl bg-surface-container-high pl-10 pr-4 py-3 text-xs font-bold text-on-surface border border-outline-variant/10 focus:border-primary/50 outline-hidden transition-all"
        />
      </div>
      
      {#if !disabled}
        <button
          type="button"
          onclick={() => removeLink(index)}
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-on-surface/5 text-on-surface-variant/40 hover:bg-rose-500/10 hover:text-rose-500 transition-all active:scale-95"
          title="Supprimer ce lien"
        >
          <Papicon icon="trash-2" size={16} />
        </button>
      {/if}
    </div>
  {/each}

  {#if !disabled}
    <button
      type="button"
      onclick={addLink}
      class="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-outline-variant/20 py-3 text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60 hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-all active:scale-[0.99]"
    >
      <Papicon icon="plus" size={14} />
      Ajouter une preuve
    </button>
  {/if}
</div>
