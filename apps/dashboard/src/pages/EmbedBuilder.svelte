<script lang="ts">
  import { onMount } from 'svelte';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { createAsyncActionState } from '../lib/asyncAction.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import InlineFeedback from '../lib/components/InlineFeedback.svelte';
  import SearchableSelect from '../lib/components/SearchableSelect.svelte';
  import Skeleton from '../lib/components/Skeleton.svelte';
  import { sendOrUpdateEmbed } from '../lib/api';
  import { authStore } from '../lib/stores/auth.svelte';

  const actionState = createAsyncActionState();
  const templateAction = createAsyncActionState();
  let loading = $state(false);

  const canManageSettings = $derived(
    !!dashboardStore.state.featureAccess?.embed_builder?.canConfigure
      || !!dashboardStore.state.access?.canManageSettings
  );

  const availableChannels = $derived(dashboardStore.state.discordChannels || []);

  let targetChannelId = $state('');
  let targetMessageId = $state('');

  // Embed Model
  type EmbedModel = {
    title: string;
    description: string;
    color: string;
    thumbnailUrl: string;
    imageUrl: string;
    url: string;
    authorName: string;
    authorIconUrl: string;
    authorUrl: string;
    footerText: string;
    footerIconUrl: string;
    timestamp: boolean;
    fields: Array<{ name: string; value: string; inline: boolean }>;
  };

  type SavedEmbedTemplate = {
    id: string;
    name: string;
    createdAt: string;
    embed: EmbedModel;
    content?: string;
    targetChannelId?: string;
    targetMessageId?: string;
  };

  const emptyEmbed = (): EmbedModel => ({
    title: '',
    description: '',
    color: '#5865F2',
    thumbnailUrl: '',
    imageUrl: '',
    url: '',
    authorName: '',
    authorIconUrl: '',
    authorUrl: '',
    footerText: '',
    footerIconUrl: '',
    timestamp: false,
    fields: [],
  });

  let embed = $state<EmbedModel>(emptyEmbed());
  let content = $state('');
  let savedTemplates = $state<SavedEmbedTemplate[]>([]);
  let templateName = $state('');
  let selectedTemplateId = $state<string | null>(null);

  function templatesStorageKey() {
    const guildId = authStore.selectedGuildId || 'global';
    return `kotbo-embed-templates:${guildId}`;
  }

  function loadTemplatesFromStorage() {
    try {
      const raw = localStorage.getItem(templatesStorageKey());
      savedTemplates = raw ? (JSON.parse(raw) as SavedEmbedTemplate[]) : [];
    } catch {
      savedTemplates = [];
    }
  }

  function persistTemplates() {
    localStorage.setItem(templatesStorageKey(), JSON.stringify(savedTemplates));
  }

  function saveCurrentAsTemplate() {
    if (!canManageSettings) return;
    const name = templateName.trim() || `Modèle ${new Date().toLocaleString('fr-FR')}`;
    const entry: SavedEmbedTemplate = {
      id: crypto.randomUUID(),
      name,
      createdAt: new Date().toISOString(),
      embed: structuredClone(embed),
      content: content || undefined,
      targetChannelId: targetChannelId || undefined,
      targetMessageId: targetMessageId.trim() || undefined,
    };
    savedTemplates = [entry, ...savedTemplates].slice(0, 30);
    templateName = '';
    persistTemplates();
    templateAction.setMessage(`Modèle « ${name} » enregistré.`);
  }

  function loadTemplate(id: string) {
    const tpl = savedTemplates.find((t) => t.id === id);
    if (!tpl) return;
    embed = {
      ...emptyEmbed(),
      ...structuredClone(tpl.embed)
    };
    content = tpl.content || '';
    targetChannelId = tpl.targetChannelId || '';
    targetMessageId = tpl.targetMessageId || '';
    selectedTemplateId = id;
    templateAction.setMessage(`Modèle « ${tpl.name} » chargé.`);
  }

  function deleteTemplate(id: string) {
    savedTemplates = savedTemplates.filter((t) => t.id !== id);
    if (selectedTemplateId === id) selectedTemplateId = null;
    persistTemplates();
    templateAction.setMessage('Modèle supprimé.');
  }

  onMount(async () => {
    loading = true;
    try {
      await dashboardStore.refresh();
      loadTemplatesFromStorage();
    } finally {
      loading = false;
    }
  });

  $effect(() => {
    const guildId = authStore.selectedGuildId;
    if (!guildId) return;
    loadTemplatesFromStorage();
  });

  function addField() {
    if (embed.fields.length >= 25) return; // Discord limit
    embed.fields = [...embed.fields, { name: '', value: '', inline: false }];
  }

  function removeField(idx: number) {
    embed.fields = embed.fields.filter((_, i) => i !== idx);
  }

  async function handleSend() {
    if (!canManageSettings || !targetChannelId) return;
    
    // Validate empty fields if any exist
    const hasEmptyField = embed.fields.some(f => !f.name.trim() || !f.value.trim());
    if (hasEmptyField) {
      actionState.setError('Tous les champs de l\'embed doivent avoir un titre et un contenu.');
      return;
    }

    const hasEmbedData = embed.title || embed.description || embed.authorName || embed.footerText || embed.fields.length > 0 || embed.imageUrl || embed.thumbnailUrl;
    if (!content.trim() && !hasEmbedData) {
      actionState.setError('Vous devez saisir du texte de message ou remplir au moins un champ de l\'embed.');
      return;
    }

    await actionState.run(async () => {
      const payload = {
        channelId: targetChannelId,
        messageId: targetMessageId.trim() || null,
        content: content.trim() || undefined,
        embed: hasEmbedData ? {
          title: embed.title || undefined,
          description: embed.description || undefined,
          color: embed.color || undefined,
          thumbnailUrl: embed.thumbnailUrl || undefined,
          imageUrl: embed.imageUrl || undefined,
          url: embed.url || undefined,
          authorName: embed.authorName || undefined,
          authorIconUrl: embed.authorIconUrl || undefined,
          authorUrl: embed.authorUrl || undefined,
          footerText: embed.footerText || undefined,
          footerIconUrl: embed.footerIconUrl || undefined,
          timestamp: embed.timestamp || undefined,
          fields: embed.fields.length > 0 ? embed.fields : undefined
        } : undefined
      };

      const res = await sendOrUpdateEmbed(payload);
      if (!res || !res.ok) throw new Error('Erreur d\'envoi de l\'embed');
      
      if (res.messageId) {
        targetMessageId = res.messageId;
      }
      return true;
    }, { successMessage: targetMessageId.trim() ? 'Embed modifié avec succès !' : 'Embed envoyé avec succès !' });
  }

  function getChannelName(channelId: string) {
    const channel = availableChannels.find(c => c.id === channelId);
    return channel ? `#${channel.name}` : `Salon inconnu (${channelId})`;
  }
</script>

<div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
  <header class="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface-container-low/40 p-5 rounded-xl border border-outline-variant/30">
    <div class="flex items-center gap-4">
      <div class="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
        <Papicon icon="FilePlus" size={20} />
      </div>
      <div>
        <h1 class="text-lg font-semibold tracking-tight leading-tight">Créateur d'Embeds</h1>
        <p class="text-sm text-on-surface-variant/70 font-medium">Concevez et modifiez des messages d'embed complexes et personnalisés sur vos salons.</p>
      </div>
    </div>
  </header>

  <InlineFeedback state={actionState} />
  <InlineFeedback state={templateAction} />

  {#if loading}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <Skeleton height="600px" radius="2.5rem" />
      <Skeleton height="600px" radius="2.5rem" />
    </div>
  {:else}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <!-- Editor Form -->
      <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-xl space-y-6 h-fit max-h-[85vh] overflow-y-auto scrollbar-thin pr-3">
        <div class="p-5 rounded-lg bg-surface-container-high/20 border border-outline-variant/10 space-y-4">
          <h3 class="text-sm font-semibold uppercase tracking-wider text-on-surface-variant/80">Mes modèles</h3>
          {#if canManageSettings}
            <div class="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                bind:value={templateName}
                placeholder="Nom du modèle (optionnel)"
                class="flex-1 bg-surface-container-high/40 border border-outline-variant/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none"
              />
              <button
                type="button"
                onclick={saveCurrentAsTemplate}
                class="px-4 py-2.5 bg-secondary/20 text-secondary font-semibold uppercase tracking-widest text-[10px] rounded-xl hover:bg-secondary/30 transition-all"
              >
                Sauvegarder
              </button>
            </div>
          {/if}
          {#if savedTemplates.length === 0}
            <p class="text-xs text-on-surface-variant/50 font-medium">Aucun modèle enregistré sur cet appareil.</p>
          {:else}
            <ul class="space-y-2 max-h-40 overflow-y-auto pr-1">
              {#each savedTemplates as tpl (tpl.id)}
                <li class="flex items-center gap-2 p-2 rounded-xl bg-surface-container-low/50 border border-outline-variant/10">
                  <button
                    type="button"
                    onclick={() => loadTemplate(tpl.id)}
                    class="flex-1 text-left text-xs font-bold hover:text-primary transition-colors truncate"
                    title={tpl.name}
                  >
                    {tpl.name}
                  </button>
                  <span class="text-[11px] text-on-surface-variant/40 shrink-0">
                    {new Date(tpl.createdAt).toLocaleDateString('fr-FR')}
                  </span>
                  {#if canManageSettings}
                    <button
                      type="button"
                      onclick={() => deleteTemplate(tpl.id)}
                      class="p-1.5 text-error hover:bg-error/10 rounded-lg transition-colors"
                      title="Supprimer"
                    >
                      <Papicon icon="Trash" size={14} />
                    </button>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
        </div>

        <h3 class="text-xl font-semibold flex items-center gap-3">
          <Papicon icon="Pen" size={20} class="text-primary" />
          Éditeur d'Embed
        </h3>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="space-y-1.5">
            <label for="targetChan" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Salon d'envoi</label>
            <SearchableSelect 
              id="targetChan"
              bind:value={targetChannelId} 
              options={availableChannels.map(c => ({ id: c.id, name: `#${c.name}` }))} 
              placeholder="Sélectionner le salon" 
              className="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all"
              disabled={!canManageSettings}
            />
          </div>

          <div class="space-y-1.5">
            <label for="msgId" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Message ID (Modifier existant)</label>
            <input 
              id="msgId"
              type="text" 
              bind:value={targetMessageId} 
              placeholder="Laisser vide pour envoyer un nouveau"
              class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all text-on-surface"
              disabled={!canManageSettings}
            />
          </div>
        </div>

        <div class="space-y-4 pt-4 border-t border-outline-variant/10">
          <h4 class="text-xs font-semibold uppercase text-on-surface-variant/80 tracking-wider">Texte du message</h4>
          <div class="space-y-1.5">
            <label for="msgContent" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase">Contenu textuel (hors embed)</label>
            <textarea 
              id="msgContent"
              bind:value={content} 
              placeholder="Texte brut à afficher en dehors de l'embed..."
              class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none h-20 resize-none text-on-surface"
              disabled={!canManageSettings}
            ></textarea>
          </div>
        </div>

        <div class="space-y-4 pt-4 border-t border-outline-variant/10">
          <h4 class="text-xs font-semibold uppercase text-on-surface-variant/80 tracking-wider">Auteur</h4>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="space-y-1.5">
              <label for="authorName" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase">Nom de l'auteur</label>
              <input 
                id="authorName"
                type="text" 
                bind:value={embed.authorName} 
                placeholder="Kotbo Staff"
                class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                disabled={!canManageSettings}
              />
            </div>
            <div class="space-y-1.5">
              <label for="authorIcon" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase">URL de l'icône de l'auteur</label>
              <input 
                id="authorIcon"
                type="url" 
                bind:value={embed.authorIconUrl} 
                placeholder="https://example.com/icon.png"
                class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                disabled={!canManageSettings}
              />
            </div>
            <div class="space-y-1.5 sm:col-span-2">
              <label for="authorUrl" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase">URL du lien de l'auteur (clic sur le nom)</label>
              <input 
                id="authorUrl"
                type="url" 
                bind:value={embed.authorUrl} 
                placeholder="https://example.com/author"
                class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                disabled={!canManageSettings}
              />
            </div>
          </div>
        </div>

        <div class="space-y-4 pt-4 border-t border-outline-variant/10">
          <h4 class="text-xs font-semibold uppercase text-on-surface-variant/80 tracking-wider">Contenu Principal</h4>
          <div class="space-y-1.5">
            <label for="embedTitle" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase">Titre de l'embed</label>
            <input 
              id="embedTitle"
              type="text" 
              bind:value={embed.title} 
              placeholder="Entrez un titre accrocheur"
              class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none"
              disabled={!canManageSettings}
            />
          </div>

          <div class="space-y-1.5">
            <label for="embedUrl" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase">URL du titre (lien de redirection)</label>
            <input 
              id="embedUrl"
              type="url" 
              bind:value={embed.url} 
              placeholder="https://example.com/details"
              class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none"
              disabled={!canManageSettings}
            />
          </div>

          <div class="space-y-1.5">
            <label for="embedDesc" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase">Description</label>
            <textarea 
              id="embedDesc"
              bind:value={embed.description} 
              placeholder="Contenu textuel principal de votre embed..."
              class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none h-24 resize-none"
              disabled={!canManageSettings}
            ></textarea>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="space-y-1.5">
              <label for="embedColor" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase">Couleur latérale (Hex ou select)</label>
              <div class="flex gap-2">
                <input 
                  id="embedColor"
                  type="color" 
                  bind:value={embed.color} 
                  class="w-10 h-10 border-0 bg-transparent rounded-xl cursor-pointer"
                  disabled={!canManageSettings}
                />
                <input 
                  type="text" 
                  bind:value={embed.color} 
                  placeholder="#5865F2"
                  class="flex-1 bg-surface-container-high/40 border border-outline-variant/10 rounded-xl px-4 py-2 text-sm focus:outline-none font-mono"
                  disabled={!canManageSettings}
                />
              </div>
            </div>
            
            <div class="space-y-1.5">
              <label for="embedThumbnail" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase">URL de la vignette (haut-droite)</label>
              <input 
                id="embedThumbnail"
                type="url" 
                bind:value={embed.thumbnailUrl} 
                placeholder="https://example.com/thumbnail.png"
                class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                disabled={!canManageSettings}
              />
            </div>
          </div>

          <div class="space-y-1.5">
            <label for="embedImage" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase">URL de la grande image (bas)</label>
            <input 
              id="embedImage"
              type="url" 
              bind:value={embed.imageUrl} 
              placeholder="https://example.com/banner.png"
              class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none"
              disabled={!canManageSettings}
            />
          </div>
        </div>

        <!-- Fields Builder -->
        <div class="space-y-4 pt-4 border-t border-outline-variant/10">
          <div class="flex items-center justify-between">
            <h4 class="text-xs font-semibold uppercase text-on-surface-variant/80 tracking-wider">Champs de l'Embed ({embed.fields.length})</h4>
            <button 
              type="button" 
              onclick={addField} 
              disabled={embed.fields.length >= 25 || !canManageSettings}
              class="text-xs font-bold text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
            >
              <Papicon icon="Plus" size={14} /> Ajouter un champ
            </button>
          </div>

          <div class="space-y-3">
            {#each embed.fields as fld, idx}
              <div class="p-4 rounded-lg bg-surface-container-high/20 border border-outline-variant/5 space-y-3 relative group">
                <div class="flex gap-2">
                  <div class="flex-1 space-y-1">
                    <label for={`fldName-${idx}`} class="text-[10px] font-bold text-on-surface-variant/50 ml-1 uppercase">Titre du champ</label>
                    <input 
                      id={`fldName-${idx}`}
                      type="text" 
                      bind:value={fld.name} 
                      placeholder="Nom du champ" 
                      class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-xl px-3 py-1.5 text-xs focus:outline-none"
                      required
                      disabled={!canManageSettings}
                    />
                  </div>
                  {#if canManageSettings}
                    <button 
                      type="button" 
                      onclick={() => removeField(idx)}
                      class="self-end p-2 text-error hover:bg-error/10 rounded-lg transition-colors"
                    >
                      <Papicon icon="Minus" size={14} />
                    </button>
                  {/if}
                </div>

                <div class="space-y-1">
                  <label for={`fldVal-${idx}`} class="text-[10px] font-bold text-on-surface-variant/50 ml-1 uppercase">Contenu du champ</label>
                  <textarea 
                    id={`fldVal-${idx}`}
                    bind:value={fld.value} 
                    placeholder="Valeur ou texte du champ" 
                    class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-xl px-3 py-1.5 text-xs focus:outline-none h-14 resize-none"
                    required
                    disabled={!canManageSettings}
                  ></textarea>
                </div>

                <div class="flex items-center gap-2">
                  <input 
                    id={`fldInline-${idx}`}
                    type="checkbox" 
                    bind:checked={fld.inline} 
                    class="rounded border-outline-variant/20 text-primary focus:ring-primary/20"
                    disabled={!canManageSettings}
                  />
                  <label for={`fldInline-${idx}`} class="text-[11px] font-bold text-on-surface-variant/60 uppercase">Aligner en ligne (Inline)</label>
                </div>
              </div>
            {/each}
          </div>
        </div>

        <div class="space-y-4 pt-4 border-t border-outline-variant/10">
          <h4 class="text-xs font-semibold uppercase text-on-surface-variant/80 tracking-wider">Pied de Page (Footer)</h4>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="space-y-1.5">
              <label for="footerText" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase">Texte du footer</label>
              <input 
                id="footerText"
                type="text" 
                bind:value={embed.footerText} 
                placeholder="Kotbo Bot © 2026"
                class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                disabled={!canManageSettings}
              />
            </div>
            <div class="space-y-1.5">
              <label for="footerIcon" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase">URL de l'icône du footer</label>
              <input 
                id="footerIcon"
                type="url" 
                bind:value={embed.footerIconUrl} 
                placeholder="https://example.com/footer.png"
                class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                disabled={!canManageSettings}
              />
            </div>
            <div class="flex items-center gap-2 pt-2 sm:col-span-2">
              <input 
                id="embedTimestamp"
                type="checkbox" 
                bind:checked={embed.timestamp} 
                class="rounded border-outline-variant/20 text-primary focus:ring-primary/20"
                disabled={!canManageSettings}
              />
              <label for="embedTimestamp" class="text-[11px] font-bold text-on-surface-variant/60 uppercase">Afficher l'horodatage (Timestamp)</label>
            </div>
          </div>
        </div>

        {#if canManageSettings}
          <div class="pt-6 border-t border-outline-variant/15 flex justify-end">
            <button 
              onclick={handleSend}
              disabled={actionState.state.loading || !targetChannelId}
              class="px-8 py-3.5 bg-primary text-on-primary font-semibold uppercase tracking-widest text-xs rounded-lg  hover:scale-105 transition-all disabled:opacity-50"
            >
              {targetMessageId.trim() ? "Modifier l'embed" : "Publier l'embed"}
            </button>
          </div>
        {/if}
      </section>

      <!-- Live Preview -->
      <section class="space-y-6 h-fit">
        <h3 class="text-xl font-semibold flex items-center gap-3">
          <Papicon icon="Camera" size={20} class="text-secondary" />
          Aperçu en temps réel
        </h3>

        <div class="p-6 rounded-xl bg-surface-container-low/30 border border-outline-variant/10 flex flex-col gap-4 select-none relative overflow-hidden">
          <div class="flex items-start gap-4">
            <div class="w-10 h-10 rounded-full bg-outline-variant/30 flex items-center justify-center text-xs font-semibold text-on-surface-variant/60">
              BOT
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-bold text-primary">Kotbo</span>
                <span class="bg-primary/20 text-primary text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase leading-none">BOT</span>
                <span class="text-[11px] text-on-surface-variant/40">Aujourd'hui à 12:10</span>
              </div>
              
              <!-- Message content (outside embed) -->
              {#if content.trim()}
                <p class="mt-2 text-sm font-medium text-[#dcddde] whitespace-pre-wrap leading-relaxed text-left">{content}</p>
              {/if}

              <!-- Simulated Discord Embed Body -->
              {#if embed.title || embed.description || embed.authorName || embed.footerText || embed.fields.length > 0 || embed.imageUrl || embed.thumbnailUrl}
                <div 
                  class="mt-3 p-4 rounded-md border-l-4 bg-[#2f3136] max-w-lg shadow-md flex gap-4"
                  style={`border-color: ${embed.color || '#5865F2'};`}
                >
                  <div class="flex-1 min-w-0 space-y-2 font-sans text-left">
                    <!-- Author -->
                    {#if embed.authorName}
                      <div class="flex items-center gap-2 text-xs font-bold text-white">
                        {#if embed.authorIconUrl}
                          <img src={embed.authorIconUrl} alt="" class="w-6 h-6 rounded-full object-cover" />
                        {/if}
                        {#if embed.authorUrl}
                          <a href={embed.authorUrl} target="_blank" rel="noopener noreferrer" class="hover:underline text-white">{embed.authorName}</a>
                        {:else}
                          <span>{embed.authorName}</span>
                        {/if}
                      </div>
                    {/if}

                    <!-- Title -->
                    {#if embed.title}
                      <h4 class="text-base font-semibold text-white leading-snug">
                        {#if embed.url}
                          <a href={embed.url} target="_blank" rel="noopener noreferrer" class="text-[#00a8fc] hover:underline">{embed.title}</a>
                        {:else}
                          {embed.title}
                        {/if}
                      </h4>
                    {/if}

                    <!-- Description -->
                    {#if embed.description}
                      <p class="text-sm font-medium text-[#dcddde] whitespace-pre-wrap leading-relaxed">{embed.description}</p>
                    {/if}

                    <!-- Fields Grid -->
                    {#if embed.fields.length > 0}
                      <div class="grid grid-cols-3 gap-3 pt-1">
                        {#each embed.fields as f}
                          {#if f.name && f.value}
                            <div class={f.inline ? "col-span-1" : "col-span-3"}>
                              <h5 class="text-xs font-bold text-white leading-tight">{f.name}</h5>
                              <p class="text-xs text-[#dcddde] mt-0.5 whitespace-pre-wrap leading-normal font-medium">{f.value}</p>
                            </div>
                          {/if}
                        {/each}
                      </div>
                    {/if}

                    <!-- Main Image -->
                    {#if embed.imageUrl}
                      <div class="mt-2 rounded-md overflow-hidden border border-[#202225]">
                        <img src={embed.imageUrl} alt="" class="max-h-80 w-full object-cover" />
                      </div>
                    {/if}

                    <!-- Footer / Timestamp -->
                    {#if embed.footerText || embed.timestamp}
                      <div class="flex items-center gap-2 text-[10px] text-[#72767d] font-bold pt-1">
                        {#if embed.footerIconUrl}
                          <img src={embed.footerIconUrl} alt="" class="w-4 h-4 rounded-full object-cover" />
                        {/if}
                        <span>
                          {embed.footerText}
                          {#if embed.footerText && embed.timestamp}
                            <span class="mx-1">•</span>
                          {/if}
                          {#if embed.timestamp}
                            Aujourd'hui à 12:10
                          {/if}
                        </span>
                      </div>
                    {/if}
                  </div>

                  <!-- Thumbnail -->
                  {#if embed.thumbnailUrl}
                    <div class="w-20 h-20 rounded-md overflow-hidden shrink-0 self-start border border-[#202225]">
                      <img src={embed.thumbnailUrl} alt="" class="w-full h-full object-cover" />
                    </div>
                  {/if}
                </div>
              {:else if !content.trim()}
                <p class="text-xs text-on-surface-variant/40 italic mt-2">Saisissez des informations à gauche pour voir l'aperçu de l'embed.</p>
              {/if}
            </div>
          </div>
        </div>
      </section>
    </div>
  {/if}
</div>
