<script lang="ts">
  import { parseDiscordEmojisAndMarkdown } from '../emojiParser';
  import Papicon from './Papicon.svelte';

  let {
    value = $bindable(''),
    placeholder = 'Rédigez votre message Discord...',
    rows = 8,
    disabled = false,
    showPreview = true,
    label = '',
    id = '',
    agendaMode = false,
  }: {
    value?: string;
    placeholder?: string;
    rows?: number;
    disabled?: boolean;
    showPreview?: boolean;
    label?: string;
    id?: string;
    agendaMode?: boolean;
  } = $props();

  let textareaEl = $state<HTMLTextAreaElement | null>(null);
  let activeTab = $state<'editor' | 'preview'>('editor');
  let showEmojiPicker = $state(false);
  let emojiPickerEl = $state<HTMLDivElement | null>(null);
  let emojiSearch = $state('');
  let emojiCategory = $state('smileys');

  const emojiCategories = [
    { id: 'smileys', icon: '😀', name: 'Smileys' },
    { id: 'objects', icon: '💡', name: 'Objets' },
    { id: 'symbols', icon: '❤️', name: 'Symboles' },
    { id: 'flags', icon: '🏁', name: 'Drapeaux' },
  ];

  const emojiMap: Record<string, string[]> = {
    smileys: ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','😉','😌','😍','🥰','😘','😎','🥳','😏','🤔','🤗','🤭','😤','😡','🤯','😱','😢','😭','🥺','😴','🤒','😈','👻','💀','🤖','👽','👹'],
    objects: ['📋','📝','📌','📎','✏️','📅','📊','📈','🔔','💡','⚙️','🔑','🔗','📁','📂','🗂️','📄','📃','📜','📰','🏷️','💼','📤','📥','📦','🔒','🔓','🔨','🧰','🧲'],
    symbols: ['✅','❌','⚠️','❗','❓','💬','💭','🔴','🟡','🟢','🔵','⭐','💥','🔥','💯','⏰','⏳','🔄','➡️','⬅️','⬆️','⬇️','↗️','↘️','🔸','🔹','▪️','▫️','◽','◾'],
    flags: ['🏁','🏳️','🏴','🇫🇷','🇬🇧','🇺🇸','🇩🇪','🇪🇸','🇮🇹','🇯🇵','🇨🇦','🇧🇷','🇷🇺','🇨🇳','🇮🇳'],
  };

  const filteredEmojis = $derived.by(() => {
    const term = emojiSearch.trim().toLowerCase();
    if (!term) return emojiMap[emojiCategory] || [];
    let results: string[] = [];
    for (const key of Object.keys(emojiMap)) {
      results.push(...emojiMap[key].filter(e => e.includes(term)));
    }
    return [...new Set(results)].slice(0, 60);
  });

  const agendaTemplates = [
    {
      name: 'Ordre du jour',
      icon: '📋',
      content: `# 📋 Ordre du Jour

## 1. Accueil & Tour de table
- Bienvenue et vérification des présences
- Tour rapide des nouvelles

## 2. Points à aborder
- **Point 1** — Description du sujet
- **Point 2** — Description du sujet
- **Point 3** — Description du sujet

## 3. Discussions ouvertes
> Espace libre pour les sujets non prévus

## 4. Prochaines étapes
- [ ] Action 1 — *Responsable*
- [ ] Action 2 — *Responsable*

---
*Merci pour votre participation !* ⭐`,
    },
    {
      name: 'Bilan rapide',
      icon: '📊',
      content: `# 📊 Bilan de Réunion

## ✅ Réalisé
- Point accompli 1
- Point accompli 2

## ⚠️ En cours
- Sujet en discussion
- Décision en attente

## ❌ Reporté
- Sujet reporté à la prochaine réunion

## 📌 Actions
- **Action** — Responsable — *Deadline*`,
    },
    {
      name: 'Annonce staff',
      icon: '📢',
      content: `# 📢 Annonce Staff

> **Important** — Merci de lire attentivement

## 📝 Résumé
Description de l'annonce...

## 🔔 Points clés
- **Point 1** — Détails
- **Point 2** — Détails

## ⏰ Dates importantes
- 📅 **Date** — Événement

---
*En cas de questions, contactez la direction.* 💬`,
    },
  ];

  type FormatAction = {
    icon: string;
    label: string;
    prefix: string;
    suffix: string;
    block?: boolean;
    linePrefix?: string;
  };

  const formatActions: FormatAction[] = [
    { icon: 'bold', label: 'Gras', prefix: '**', suffix: '**' },
    { icon: 'italic', label: 'Italique', prefix: '*', suffix: '*' },
    { icon: 'underline', label: 'Souligné', prefix: '__', suffix: '__' },
    { icon: 'strikethrough', label: 'Barré', prefix: '~~', suffix: '~~' },
    { icon: 'code', label: 'Code inline', prefix: '`', suffix: '`' },
    { icon: 'terminal', label: 'Bloc de code', prefix: '```\n', suffix: '\n```', block: true },
    { icon: 'minus', label: 'Séparateur', prefix: '\n---\n', suffix: '' },
  ];

  const blockActions: FormatAction[] = [
    { icon: 'hash', label: 'Titre 1', prefix: '', suffix: '', linePrefix: '# ' },
    { icon: 'hash', label: 'Titre 2', prefix: '', suffix: '', linePrefix: '## ' },
    { icon: 'hash', label: 'Titre 3', prefix: '', suffix: '', linePrefix: '### ' },
    { icon: 'list', label: 'Liste', prefix: '', suffix: '', linePrefix: '- ' },
    { icon: 'message-square', label: 'Citation', prefix: '', suffix: '', linePrefix: '> ' },
  ];

  function insertFormat(action: FormatAction) {
    if (!textareaEl || disabled) return;
    const start = textareaEl.selectionStart;
    const end = textareaEl.selectionEnd;
    const selected = value.slice(start, end);

    if (action.linePrefix) {
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const currentLinePrefix = value.slice(lineStart, start);
      if (currentLinePrefix.startsWith(action.linePrefix)) {
        value = value.slice(0, lineStart) + value.slice(lineStart + action.linePrefix.length);
        tick().then(() => {
          textareaEl!.selectionStart = start - action.linePrefix!.length;
          textareaEl!.selectionEnd = end - action.linePrefix!.length;
          textareaEl!.focus();
        });
      } else {
        value = value.slice(0, lineStart) + action.linePrefix + value.slice(lineStart);
        tick().then(() => {
          textareaEl!.selectionStart = start + action.linePrefix!.length;
          textareaEl!.selectionEnd = end + action.linePrefix!.length;
          textareaEl!.focus();
        });
      }
      return;
    }

    const newText = action.prefix + (selected || 'texte') + action.suffix;
    value = value.slice(0, start) + newText + value.slice(end);

    tick().then(() => {
      if (selected) {
        textareaEl!.selectionStart = start;
        textareaEl!.selectionEnd = start + newText.length;
      } else {
        textareaEl!.selectionStart = start + action.prefix.length;
        textareaEl!.selectionEnd = start + action.prefix.length + 'texte'.length;
      }
      textareaEl!.focus();
    });
  }

  function insertEmoji(emoji: string) {
    if (!textareaEl || disabled) return;
    const start = textareaEl.selectionStart;
    value = value.slice(0, start) + emoji + value.slice(start);
    showEmojiPicker = false;
    tick().then(() => {
      const newPos = start + emoji.length;
      textareaEl!.selectionStart = newPos;
      textareaEl!.selectionEnd = newPos;
      textareaEl!.focus();
    });
  }

  function applyTemplate(template: typeof agendaTemplates[0]) {
    if (disabled) return;
    if (value.trim() && !confirm('Le contenu actuel sera remplacé par le modèle. Continuer ?')) return;
    value = template.content;
    activeTab = 'editor';
    tick().then(() => textareaEl?.focus());
  }

  function tick(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!textareaEl || disabled) return;

    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'b':
          e.preventDefault();
          insertFormat(formatActions[0]);
          break;
        case 'i':
          e.preventDefault();
          insertFormat(formatActions[1]);
          break;
        case 'u':
          e.preventDefault();
          insertFormat(formatActions[2]);
          break;
      }
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const start = textareaEl.selectionStart;
      value = value.slice(0, start) + '  ' + value.slice(start);
      tick().then(() => {
        textareaEl!.selectionStart = start + 2;
        textareaEl!.selectionEnd = start + 2;
      });
    }
  }

  $effect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (showEmojiPicker && emojiPickerEl && !emojiPickerEl.contains(event.target as Node)) {
        showEmojiPicker = false;
      }
    }
    if (showEmojiPicker) {
      document.addEventListener('click', handleOutsideClick, true);
    }
    return () => document.removeEventListener('click', handleOutsideClick, true);
  });

  const charCount = $derived(value.length);
  const previewHtml = $derived(parseDiscordEmojisAndMarkdown(value));
</script>

<div class="discord-md-editor flex flex-col rounded-xl border border-outline-variant/20 bg-surface-container-low overflow-hidden transition-all focus-within:border-primary/40 focus-within:shadow-lg focus-within:shadow-primary/5">
  {#if label}
    <label for={id} class="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider px-4 pt-3 pb-1">{label}</label>
  {/if}

  <!-- Toolbar -->
  <div class="flex items-center gap-0.5 px-2 py-1.5 border-b border-outline-variant/15 bg-surface-container-low/80 flex-wrap">
    <!-- Format buttons -->
    <div class="flex items-center gap-0.5">
      {#each formatActions as action}
        {#if action.icon === 'minus'}
          <div class="w-px h-5 bg-outline-variant/20 mx-1"></div>
        {/if}
        <button
          type="button"
          {disabled}
          onclick={() => insertFormat(action)}
          class="w-7 h-7 flex items-center justify-center rounded-md text-on-surface-variant/70 hover:bg-surface-container-high/60 hover:text-on-surface transition-all disabled:opacity-30 disabled:pointer-events-none"
          title="{action.label}{action.icon === 'bold' ? ' (Ctrl+B)' : action.icon === 'italic' ? ' (Ctrl+I)' : action.icon === 'underline' ? ' (Ctrl+U)' : ''}"
        >
          <Papicon icon={action.icon} size={14} />
        </button>
      {/each}
    </div>

    <div class="w-px h-5 bg-outline-variant/20 mx-1"></div>

    <!-- Block format dropdown-like buttons -->
    <div class="flex items-center gap-0.5">
      {#each blockActions as action}
        <button
          type="button"
          {disabled}
          onclick={() => insertFormat(action)}
          class="h-7 px-1.5 flex items-center justify-center rounded-md text-on-surface-variant/70 hover:bg-surface-container-high/60 hover:text-on-surface transition-all text-[10px] font-bold uppercase tracking-wider disabled:opacity-30 disabled:pointer-events-none"
          title={action.label}
        >
          {#if action.label === 'Titre 1'}H1
          {:else if action.label === 'Titre 2'}H2
          {:else if action.label === 'Titre 3'}H3
          {:else}
            <Papicon icon={action.icon} size={14} />
          {/if}
        </button>
      {/each}
    </div>

    <div class="w-px h-5 bg-outline-variant/20 mx-1"></div>

    <!-- Emoji picker -->
    <div class="relative" bind:this={emojiPickerEl}>
      <button
        type="button"
        {disabled}
        onclick={() => showEmojiPicker = !showEmojiPicker}
        class="w-7 h-7 flex items-center justify-center rounded-md hover:bg-surface-container-high/60 transition-all text-base disabled:opacity-30 disabled:pointer-events-none"
        title="Émojis"
      >😀</button>

      {#if showEmojiPicker}
        <div class="absolute left-0 top-full mt-1 z-50 w-64 bg-surface-container-lowest border border-outline-variant/20 rounded-xl p-3 shadow-xl flex flex-col gap-2 animate-in fade-in slide-in-from-top-2 duration-150">
          <input
            type="text"
            placeholder="Rechercher..."
            bind:value={emojiSearch}
            class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 text-on-surface"
          />
          {#if !emojiSearch.trim()}
            <div class="flex gap-1 overflow-x-auto pb-0.5 select-none">
              {#each emojiCategories as cat}
                <button
                  type="button"
                  onclick={() => emojiCategory = cat.id}
                  class="p-1 rounded-lg hover:bg-surface-container-high/40 text-sm transition-all shrink-0 {emojiCategory === cat.id ? 'bg-primary/15 text-primary' : ''}"
                  title={cat.name}
                >{cat.icon}</button>
              {/each}
            </div>
          {/if}
          <div class="grid grid-cols-7 gap-0.5 max-h-32 overflow-y-auto pr-1 text-lg select-none">
            {#each filteredEmojis as emoji}
              <button
                type="button"
                onclick={() => insertEmoji(emoji)}
                class="flex h-7 w-7 items-center justify-center rounded-md hover:bg-primary/10 active:scale-95 transition-all cursor-pointer"
              >{emoji}</button>
            {/each}
          </div>
        </div>
      {/if}
    </div>

    <!-- Spacer -->
    <div class="flex-1"></div>

    <!-- Tab switcher (editor / preview) -->
    {#if showPreview}
      <div class="flex items-center bg-surface-container-high/30 rounded-lg p-0.5">
        <button
          type="button"
          onclick={() => activeTab = 'editor'}
          class="px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all {activeTab === 'editor' ? 'bg-primary/15 text-primary' : 'text-on-surface-variant/60 hover:text-on-surface-variant'}"
        >Éditeur</button>
        <button
          type="button"
          onclick={() => activeTab = 'preview'}
          class="px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all {activeTab === 'preview' ? 'bg-primary/15 text-primary' : 'text-on-surface-variant/60 hover:text-on-surface-variant'}"
        >Aperçu</button>
      </div>
    {/if}

    <!-- Char count -->
    <span class="text-[10px] font-mono text-on-surface-variant/40 ml-2 tabular-nums">{charCount}</span>
  </div>

  <!-- Agenda templates -->
  {#if agendaMode}
    <div class="flex items-center gap-2 px-3 py-2 border-b border-outline-variant/10 bg-surface-container-high/10 overflow-x-auto">
      <span class="text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest shrink-0">Modèles</span>
      {#each agendaTemplates as template}
        <button
          type="button"
          {disabled}
          onclick={() => applyTemplate(template)}
          class="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-lowest border border-outline-variant/15 text-xs font-semibold text-on-surface-variant hover:border-primary/30 hover:text-primary hover:bg-primary/5 transition-all disabled:opacity-30 disabled:pointer-events-none"
        >
          <span>{template.icon}</span>
          {template.name}
        </button>
      {/each}
    </div>
  {/if}

  <!-- Editor / Preview Area -->
  <div class="relative min-h-[200px]">
    {#if activeTab === 'editor'}
      <textarea
        bind:this={textareaEl}
        {id}
        bind:value
        {placeholder}
        {disabled}
        {rows}
        onkeydown={handleKeydown}
        class="w-full h-full min-h-[200px] bg-transparent px-4 py-3 text-sm text-on-surface font-mono leading-relaxed resize-y focus:outline-none placeholder:text-on-surface-variant/30 disabled:opacity-50 disabled:cursor-not-allowed"
        style="tab-size: 2;"
      ></textarea>
    {:else}
      <!-- Discord-style preview -->
      <div class="px-4 py-3 min-h-[200px] max-h-[60vh] overflow-y-auto">
        {#if value.trim()}
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold text-primary shrink-0 mt-0.5">
              BOT
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="font-bold text-primary text-sm">Kotbo</span>
                <span class="bg-primary/20 text-primary text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase leading-none">BOT</span>
                <span class="text-[11px] text-on-surface-variant/40">Aujourd'hui</span>
              </div>
              <div class="text-sm text-[#dcddde] leading-relaxed whitespace-pre-wrap break-words discord-preview">
                {@html previewHtml}
              </div>
            </div>
          </div>
        {:else}
          <div class="flex flex-col items-center justify-center py-10 text-on-surface-variant/30">
            <Papicon icon="eye" size={28} class="mb-2" />
            <p class="text-xs font-medium">L'aperçu apparaîtra ici...</p>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Footer hint bar -->
  <div class="flex items-center justify-between px-3 py-1.5 border-t border-outline-variant/10 bg-surface-container-high/10">
    <div class="flex items-center gap-3 text-[10px] text-on-surface-variant/40 font-medium">
      <span class="flex items-center gap-1">
        <kbd class="px-1 py-0.5 rounded bg-surface-container-high/40 text-[9px] font-mono">Ctrl+B</kbd> Gras
      </span>
      <span class="flex items-center gap-1">
        <kbd class="px-1 py-0.5 rounded bg-surface-container-high/40 text-[9px] font-mono">Ctrl+I</kbd> Italique
      </span>
      <span class="flex items-center gap-1">
        <kbd class="px-1 py-0.5 rounded bg-surface-container-high/40 text-[9px] font-mono">Tab</kbd> Indent
      </span>
    </div>
    <span class="text-[10px] text-on-surface-variant/30 font-medium">Markdown Discord</span>
  </div>
</div>

<style>
  .discord-preview :global(h1),
  .discord-preview :global(h2),
  .discord-preview :global(h3) {
    margin-top: 0.5rem;
    margin-bottom: 0.25rem;
  }
  .discord-preview :global(h1:first-child),
  .discord-preview :global(h2:first-child),
  .discord-preview :global(h3:first-child) {
    margin-top: 0;
  }
</style>
