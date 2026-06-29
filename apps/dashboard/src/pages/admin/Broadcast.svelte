<script lang="ts">
  import { onMount } from 'svelte';
  import { toast } from '../../lib/stores/toast.svelte';
  import {
    sendBroadcast,
    fetchBroadcastHistory,
    deleteBroadcastLog,
    fetchBroadcastEmojis,
    fetchAdminGuilds,
    type BroadcastPayload,
    type BroadcastLogEntry,
    type BroadcastEmoji,
  } from '../../lib/api';
  import Papicon from '../../lib/components/Papicon.svelte';
  import AdminLayout from '../../lib/components/AdminLayout.svelte';

  // ── State ──
  let title = $state('📢 Annonce Globale Kotbo');
  let message = $state('');
  let color = $state('#5865F2');
  let thumbnailUrl = $state('');
  let imageUrl = $state('');
  let footerText = $state("Système d'annonce globale Kotbo");
  let target = $state<'ALL' | 'ACTIVATED' | 'CUSTOM'>('ALL');
  let channelPref = $state<'NEWS' | 'PUBLIC' | 'STAFF' | 'FALLBACK'>('NEWS');
  let selectedGuilds = $state<string[]>([]);
  let guildSearch = $state('');

  let sending = $state(false);
  let loading = $state(true);
  let showEmojiPicker = $state(false);
  let activeTab = $state<'compose' | 'history'>('compose');

  let history = $state<BroadcastLogEntry[]>([]);
  let emojis = $state<BroadcastEmoji[]>([]);
  let guilds = $state<{ id: string; name: string; icon: string | null; activated: boolean; memberCount: number }[]>([]);

  // ── Derived ──
  const filteredEmojis = $derived(emojis);

  const filteredGuilds = $derived(
    guilds.filter(g =>
      g.name.toLowerCase().includes(guildSearch.toLowerCase()) ||
      g.id.includes(guildSearch)
    )
  );

  const targetLabel = $derived(
    target === 'ALL' ? 'Tous les serveurs' :
    target === 'ACTIVATED' ? 'Serveurs activés' :
    `${selectedGuilds.length} serveur(s) sélectionné(s)`
  );

  const channelLabel = $derived(
    channelPref === 'NEWS' ? 'Salon news' :
    channelPref === 'PUBLIC' ? 'Salon public' :
    channelPref === 'STAFF' ? 'Salon staff' :
    'Fallback auto'
  );

  const colorInt = $derived(parseInt(color.replace('#', ''), 16));

  // ── Init ──
  onMount(async () => {
    try {
      const [histData, emojiData, guildData] = await Promise.all([
        fetchBroadcastHistory(),
        fetchBroadcastEmojis(),
        fetchAdminGuilds(),
      ]);
      history = histData.logs;
      emojis = emojiData.emojis;
      guilds = guildData.guilds || [];
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      loading = false;
    }
  });

  // ── Actions ──
  function insertEmoji(emoji: BroadcastEmoji) {
    const match = emoji.formatted.match(/<a?:(\w+):\d+>/);
    const name = match?.[1] || emoji.discordName || emoji.key;
    message += ` :${name}: `;
    showEmojiPicker = false;
  }

  function renderEmojiPreview(text: string): string {
    if (!text) return '';
    let result = text;
    for (const e of emojis) {
      const match = e.formatted.match(/<a?:(\w+):(\d+)>/);
      if (!match) continue;
      const discordName = match[1];
      const emojiId = match[2];
      const imgTag = `<img src="https://cdn.discordapp.com/emojis/${emojiId}.webp?size=20" alt="${e.key}" class="inline-block w-5 h-5 align-text-bottom" />`;
      result = result.replaceAll(`:${discordName}:`, imgTag);
      if (e.key !== discordName) {
        result = result.replaceAll(`:${e.key}:`, imgTag);
      }
    }
    return result;
  }

  async function handleDryRun() {
    if (!message.trim()) { toast.error('Message requis'); return; }
    try {
      const payload = buildPayload(true);
      const res = await sendBroadcast(payload);
      toast.success(`Dry run : ${res.totalTargeted} serveur(s) ciblé(s)`);
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function handleSend() {
    if (!message.trim()) { toast.error('Message requis'); return; }
    if (!confirm(`Envoyer ce broadcast sur ${targetLabel} via ${channelLabel} ?`)) return;
    sending = true;
    try {
      const payload = buildPayload(false);
      const res = await sendBroadcast(payload);
      toast.success(`Broadcast envoyé ! ${res.successCount} succès, ${res.failCount} échecs sur ${res.totalTargeted} ciblés`);
      message = '';
      const histData = await fetchBroadcastHistory();
      history = histData.logs;
      activeTab = 'history';
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      sending = false;
    }
  }

  function buildPayload(dryRun: boolean): BroadcastPayload {
    return {
      title: title.trim() || undefined,
      message: message.trim(),
      color: color || undefined,
      thumbnailUrl: thumbnailUrl.trim() || undefined,
      imageUrl: imageUrl.trim() || undefined,
      footerText: footerText.trim() || undefined,
      target,
      targetGuilds: target === 'CUSTOM' ? selectedGuilds : undefined,
      channelPref,
      dryRun,
    };
  }

  async function handleDeleteLog(id: string) {
    if (!confirm('Supprimer cette entrée ?')) return;
    try {
      await deleteBroadcastLog(id);
      history = history.filter(h => h.id !== id);
      toast.success('Entrée supprimée');
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  function toggleGuild(id: string) {
    if (selectedGuilds.includes(id)) {
      selectedGuilds = selectedGuilds.filter(g => g !== id);
    } else {
      selectedGuilds = [...selectedGuilds, id];
    }
  }

  function formatDate(d: string): string {
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  const COLOR_PRESETS = [
    { label: 'Blurple', value: '#5865F2' },
    { label: 'Vert', value: '#57F287' },
    { label: 'Rouge', value: '#ED4245' },
    { label: 'Jaune', value: '#FEE75C' },
    { label: 'Rose', value: '#EB459E' },
    { label: 'Sombre', value: '#2B2D31' },
  ];
</script>

<AdminLayout>
  <div class="space-y-6 pb-12 animate-in fade-in slide-in-from-bottom-3 duration-600">

    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-container-low/40 p-5 rounded-xl border border-outline-variant/30">
      <div>
        <h2 class="text-lg font-bold text-on-surface tracking-tight">Broadcast</h2>
        <p class="text-sm text-on-surface-variant/50 font-medium">Annonces globales configurables vers les serveurs</p>
      </div>
      <div class="flex items-center gap-2">
        <button
          onclick={() => activeTab = 'compose'}
          class="px-4 py-2 rounded-xl text-xs font-black transition-all duration-200
            {activeTab === 'compose' ? 'bg-primary text-on-primary shadow-md shadow-primary/25' : 'bg-on-surface/5 text-on-surface-variant/60 hover:bg-on-surface/10'}"
        >
          <Papicon icon="PenLine" size={13} class="inline mr-1.5" />Composer
        </button>
        <button
          onclick={() => activeTab = 'history'}
          class="px-4 py-2 rounded-xl text-xs font-black transition-all duration-200
            {activeTab === 'history' ? 'bg-primary text-on-primary shadow-md shadow-primary/25' : 'bg-on-surface/5 text-on-surface-variant/60 hover:bg-on-surface/10'}"
        >
          <Papicon icon="History" size={13} class="inline mr-1.5" />Historique
          {#if history.length > 0}
            <span class="ml-1.5 px-1.5 py-0.5 rounded-full bg-on-surface/10 text-[10px]">{history.length}</span>
          {/if}
        </button>
      </div>
    </div>

    {#if loading}
      <div class="flex items-center justify-center py-20">
        <div class="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></div>
      </div>

    {:else if activeTab === 'compose'}
      <div class="grid grid-cols-1 xl:grid-cols-5 gap-6">

        <!-- ═══ Left: Embed Builder (3 cols) ═══ -->
        <div class="xl:col-span-3 space-y-5">

          <!-- Title -->
          <div class="bg-surface-container-low/50 border border-outline-variant/10 rounded-2xl p-5 space-y-4">
            <div class="flex items-center gap-3 mb-1">
              <div class="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/15 flex items-center justify-center text-blue-400">
                <Papicon icon="Type" size={16} />
              </div>
              <p class="font-black text-on-surface text-sm">Contenu de l'embed</p>
            </div>

            <div class="space-y-3">
              <div>
                <label class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 mb-1 block">Titre</label>
                <input
                  bind:value={title}
                  placeholder="Titre de l'annonce"
                  class="w-full bg-on-surface/4 border border-outline-variant/10 rounded-xl px-4 py-2.5 text-sm text-on-surface placeholder-on-surface-variant/30 focus:outline-none focus:border-primary/40 transition-all"
                />
              </div>

              <div class="relative">
                <div class="flex items-center justify-between mb-1">
                  <label class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Message</label>
                  <button
                    onclick={() => showEmojiPicker = !showEmojiPicker}
                    class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all duration-200
                      {showEmojiPicker ? 'bg-primary/15 text-primary border border-primary/20' : 'bg-on-surface/5 text-on-surface-variant/50 hover:bg-on-surface/10 border border-transparent'}"
                  >
                    <Papicon icon="Smile" size={12} />
                    Emojis Kotbo
                  </button>
                </div>

                <!-- Emoji Picker -->
                {#if showEmojiPicker}
                  <div class="absolute right-0 top-6 z-50 w-80 max-h-64 overflow-y-auto bg-surface-container border border-outline-variant/20 rounded-xl shadow-2xl shadow-black/30 p-3 space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div class="grid grid-cols-6 gap-1.5">
                      {#each filteredEmojis as emoji}
                        {@const match = emoji.formatted.match(/<a?:\w+:(\d+)>/)}
                        {#if match}
                          <button
                            onclick={() => insertEmoji(emoji)}
                            title={`:${emoji.formatted.match(/<a?:(\w+):\d+>/)?.[1] || emoji.key}:`}
                            class="group w-10 h-10 rounded-lg bg-on-surface/5 hover:bg-primary/15 border border-transparent hover:border-primary/20 flex items-center justify-center transition-all duration-150"
                          >
                            <img
                              src="https://cdn.discordapp.com/emojis/{match[1]}.webp?size=32"
                              alt={emoji.key}
                              class="w-6 h-6 group-hover:scale-110 transition-transform"
                            />
                          </button>
                        {/if}
                      {/each}
                    </div>
                    {#if emojis.length === 0}
                      <p class="text-xs text-on-surface-variant/40 text-center py-4">Aucun emoji disponible</p>
                    {/if}
                  </div>
                {/if}

                <textarea
                  bind:value={message}
                  placeholder="Rédigez votre annonce... Utilisez :emoji_key: pour les emojis custom"
                  rows={6}
                  class="w-full bg-on-surface/4 border border-outline-variant/10 rounded-xl px-4 py-3 text-sm text-on-surface placeholder-on-surface-variant/30 focus:outline-none focus:border-primary/40 transition-all resize-none font-medium"
                  required
                ></textarea>
              </div>

              <div>
                <label class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 mb-1 block">Footer</label>
                <input
                  bind:value={footerText}
                  placeholder="Texte du footer"
                  class="w-full bg-on-surface/4 border border-outline-variant/10 rounded-xl px-4 py-2.5 text-sm text-on-surface placeholder-on-surface-variant/30 focus:outline-none focus:border-primary/40 transition-all"
                />
              </div>
            </div>
          </div>

          <!-- Apparence -->
          <div class="bg-surface-container-low/50 border border-outline-variant/10 rounded-2xl p-5 space-y-4">
            <div class="flex items-center gap-3 mb-1">
              <div class="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/15 flex items-center justify-center text-purple-400">
                <Papicon icon="Palette" size={16} />
              </div>
              <p class="font-black text-on-surface text-sm">Apparence</p>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <!-- Color picker -->
              <div>
                <label class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 mb-2 block">Couleur</label>
                <div class="flex items-center gap-2 flex-wrap">
                  {#each COLOR_PRESETS as preset}
                    <button
                      onclick={() => color = preset.value}
                      title={preset.label}
                      class="w-8 h-8 rounded-lg border-2 transition-all duration-200 hover:scale-110
                        {color === preset.value ? 'border-white shadow-lg scale-110' : 'border-transparent hover:border-white/30'}"
                      style="background-color: {preset.value}"
                    ></button>
                  {/each}
                  <input
                    type="color"
                    bind:value={color}
                    class="w-8 h-8 rounded-lg border-0 cursor-pointer bg-transparent"
                  />
                </div>
              </div>

              <!-- Thumbnail URL -->
              <div>
                <label class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 mb-1 block">Thumbnail URL</label>
                <input
                  bind:value={thumbnailUrl}
                  placeholder="https://..."
                  class="w-full bg-on-surface/4 border border-outline-variant/10 rounded-xl px-4 py-2.5 text-sm text-on-surface placeholder-on-surface-variant/30 focus:outline-none focus:border-primary/40 transition-all"
                />
              </div>

              <!-- Image URL -->
              <div class="sm:col-span-2">
                <label class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 mb-1 block">Image URL (grande)</label>
                <input
                  bind:value={imageUrl}
                  placeholder="https://..."
                  class="w-full bg-on-surface/4 border border-outline-variant/10 rounded-xl px-4 py-2.5 text-sm text-on-surface placeholder-on-surface-variant/30 focus:outline-none focus:border-primary/40 transition-all"
                />
              </div>
            </div>
          </div>

          <!-- Ciblage -->
          <div class="bg-surface-container-low/50 border border-outline-variant/10 rounded-2xl p-5 space-y-4">
            <div class="flex items-center gap-3 mb-1">
              <div class="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/15 flex items-center justify-center text-emerald-400">
                <Papicon icon="Target" size={16} />
              </div>
              <p class="font-black text-on-surface text-sm">Ciblage</p>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <!-- Target -->
              <div>
                <label class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 mb-2 block">Cible</label>
                <div class="flex flex-col gap-1.5">
                  {#each [
                    { val: 'ALL', label: 'Tous les serveurs', icon: 'Globe' },
                    { val: 'ACTIVATED', label: 'Serveurs activés', icon: 'CheckCircle' },
                    { val: 'CUSTOM', label: 'Sélection manuelle', icon: 'ListChecks' },
                  ] as opt}
                    <button
                      onclick={() => target = opt.val as any}
                      class="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 text-left
                        {target === opt.val
                          ? 'bg-primary/10 text-primary border border-primary/20'
                          : 'bg-on-surface/4 text-on-surface-variant/60 hover:bg-on-surface/8 border border-transparent'}"
                    >
                      <Papicon icon={opt.icon} size={14} />
                      {opt.label}
                    </button>
                  {/each}
                </div>
              </div>

              <!-- Channel preference -->
              <div>
                <label class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 mb-2 block">Canal préféré</label>
                <div class="flex flex-col gap-1.5">
                  {#each [
                    { val: 'NEWS', label: 'Salon news', icon: 'Newspaper' },
                    { val: 'PUBLIC', label: 'Salon public', icon: 'Hash' },
                    { val: 'STAFF', label: 'Salon staff', icon: 'Shield' },
                    { val: 'FALLBACK', label: 'Fallback auto', icon: 'Shuffle' },
                  ] as opt}
                    <button
                      onclick={() => channelPref = opt.val as any}
                      class="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 text-left
                        {channelPref === opt.val
                          ? 'bg-primary/10 text-primary border border-primary/20'
                          : 'bg-on-surface/4 text-on-surface-variant/60 hover:bg-on-surface/8 border border-transparent'}"
                    >
                      <Papicon icon={opt.icon} size={14} />
                      {opt.label}
                    </button>
                  {/each}
                </div>
              </div>
            </div>

            <!-- Custom guild selector -->
            {#if target === 'CUSTOM'}
              <div class="mt-3 space-y-3 border-t border-outline-variant/10 pt-4">
                <div class="flex items-center justify-between">
                  <label class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Sélection des serveurs</label>
                  <span class="text-xs font-bold text-primary">{selectedGuilds.length} sélectionné(s)</span>
                </div>
                <input
                  bind:value={guildSearch}
                  placeholder="Rechercher un serveur..."
                  class="w-full bg-on-surface/4 border border-outline-variant/10 rounded-xl px-4 py-2.5 text-sm text-on-surface placeholder-on-surface-variant/30 focus:outline-none focus:border-primary/40 transition-all"
                />
                <div class="max-h-48 overflow-y-auto space-y-1 pr-1">
                  {#each filteredGuilds as guild}
                    <button
                      onclick={() => toggleGuild(guild.id)}
                      class="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150 text-left
                        {selectedGuilds.includes(guild.id)
                          ? 'bg-primary/10 text-primary border border-primary/20'
                          : 'bg-on-surface/3 text-on-surface-variant/60 hover:bg-on-surface/6 border border-transparent'}"
                    >
                      {#if guild.icon}
                        <img src="https://cdn.discordapp.com/icons/{guild.id}/{guild.icon}.webp?size=32" alt="" class="w-6 h-6 rounded-lg" />
                      {:else}
                        <div class="w-6 h-6 rounded-lg bg-on-surface/10 flex items-center justify-center text-[10px] font-bold">{guild.name.charAt(0)}</div>
                      {/if}
                      <span class="flex-1 truncate">{guild.name}</span>
                      <span class="text-[10px] text-on-surface-variant/30">{guild.memberCount}</span>
                      {#if selectedGuilds.includes(guild.id)}
                        <Papicon icon="Check" size={14} class="text-primary" />
                      {/if}
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        </div>

        <!-- ═══ Right: Preview + Actions (2 cols) ═══ -->
        <div class="xl:col-span-2 space-y-5">

          <!-- Live Preview -->
          <div class="bg-surface-container-low/50 border border-outline-variant/10 rounded-2xl p-5 space-y-4 sticky top-6">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/15 flex items-center justify-center text-indigo-400">
                <Papicon icon="Eye" size={16} />
              </div>
              <p class="font-black text-on-surface text-sm">Aperçu Discord</p>
            </div>

            <!-- Discord-style embed preview -->
            <div class="bg-[#2B2D31] rounded-lg overflow-hidden">
              <div class="flex">
                <!-- Color bar -->
                <div class="w-1 shrink-0 rounded-l" style="background-color: {color}"></div>

                <div class="flex-1 p-4 space-y-2">
                  <!-- Title -->
                  {#if title.trim()}
                    <p class="font-bold text-white text-sm">{title}</p>
                  {/if}

                  <!-- Description -->
                  {#if message.trim()}
                    <div class="text-sm text-[#DBDEE1] leading-relaxed whitespace-pre-wrap break-words">
                      {@html renderEmojiPreview(message)}
                    </div>
                  {:else}
                    <p class="text-sm text-[#DBDEE1]/40 italic">Votre message apparaîtra ici...</p>
                  {/if}

                  <!-- Image -->
                  {#if imageUrl.trim()}
                    <div class="mt-2">
                      <img src={imageUrl} alt="preview" class="max-w-full rounded-lg max-h-48 object-cover" onerror={(e: any) => e.target.style.display = 'none'} />
                    </div>
                  {/if}

                  <!-- Footer -->
                  {#if footerText.trim()}
                    <div class="flex items-center gap-2 pt-2 border-t border-white/5">
                      <p class="text-[11px] text-[#DBDEE1]/50">{footerText}</p>
                    </div>
                  {/if}
                </div>

                <!-- Thumbnail -->
                {#if thumbnailUrl.trim()}
                  <div class="p-4 shrink-0">
                    <img src={thumbnailUrl} alt="thumb" class="w-16 h-16 rounded-lg object-cover" onerror={(e: any) => e.target.style.display = 'none'} />
                  </div>
                {/if}
              </div>
            </div>

            <!-- Target summary -->
            <div class="grid grid-cols-2 gap-2">
              <div class="bg-on-surface/4 rounded-xl p-3 space-y-1">
                <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Cible</p>
                <p class="text-xs font-bold text-on-surface">{targetLabel}</p>
              </div>
              <div class="bg-on-surface/4 rounded-xl p-3 space-y-1">
                <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Canal</p>
                <p class="text-xs font-bold text-on-surface">{channelLabel}</p>
              </div>
            </div>

            <!-- Action buttons -->
            <div class="flex flex-col gap-2.5 pt-2">
              <button
                onclick={handleDryRun}
                disabled={!message.trim() || sending}
                class="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-black text-xs transition-all duration-200
                  {!message.trim() || sending
                    ? 'bg-on-surface/10 text-on-surface-variant/40 cursor-not-allowed'
                    : 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 border border-amber-500/20'}"
              >
                <Papicon icon="FlaskConical" size={14} />
                Dry Run (test sans envoi)
              </button>

              <button
                onclick={handleSend}
                disabled={!message.trim() || sending}
                class="flex items-center justify-center gap-2.5 py-3 px-5 rounded-xl font-black text-sm transition-all duration-200
                  {!message.trim() || sending
                    ? 'bg-on-surface/10 text-on-surface-variant/40 cursor-not-allowed'
                    : 'bg-blue-500 text-white hover:bg-blue-600 hover:scale-[1.02] active:scale-95 shadow-lg shadow-blue-500/20'}"
              >
                {#if sending}
                  <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Envoi en cours...
                {:else}
                  <Papicon icon="Send" size={15} />
                  Envoyer le broadcast
                {/if}
              </button>
            </div>
          </div>
        </div>
      </div>

    {:else}
      <!-- ═══ History Tab ═══ -->
      <div class="space-y-4">
        {#if history.length === 0}
          <div class="flex flex-col items-center justify-center py-20 gap-4 text-center bg-on-surface/3 border border-outline-variant/10 rounded-2xl">
            <div class="w-14 h-14 rounded-2xl bg-on-surface/5 border border-outline-variant/10 flex items-center justify-center text-on-surface-variant/30">
              <Papicon icon="Megaphone" size={28} />
            </div>
            <div>
              <p class="font-black text-on-surface text-lg">Aucun broadcast</p>
              <p class="text-sm text-on-surface-variant/50 mt-1">Les annonces envoyées apparaîtront ici</p>
            </div>
          </div>
        {:else}
          {#each history as log}
            <div class="bg-surface-container-low/50 border border-outline-variant/10 rounded-2xl p-5 space-y-3 hover:border-outline-variant/20 transition-all duration-200">
              <div class="flex items-start justify-between gap-3">
                <div class="flex items-center gap-3">
                  {#if log.avatarUrl}
                    <img src={log.avatarUrl} alt="" class="w-8 h-8 rounded-full" />
                  {:else}
                    <div class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary"><Papicon icon="user" size={16} /></div>
                  {/if}
                  <div>
                    <p class="font-bold text-on-surface text-sm">{log.title}</p>
                    <p class="text-[10px] text-on-surface-variant/40">par {log.username || log.sentBy} — {formatDate(log.createdAt)}</p>
                  </div>
                </div>
                <button
                  onclick={() => handleDeleteLog(log.id)}
                  class="p-1.5 rounded-lg hover:bg-error/10 text-on-surface-variant/30 hover:text-error transition-all"
                >
                  <Papicon icon="Trash2" size={14} />
                </button>
              </div>

              <p class="text-sm text-on-surface-variant/70 line-clamp-3">{log.message}</p>

              <div class="flex items-center gap-3 flex-wrap">
                <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 text-[10px] font-bold">
                  <Papicon icon="Check" size={10} />
                  {log.successCount} succès
                </div>
                {#if log.failCount > 0}
                  <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 text-[10px] font-bold">
                    <Papicon icon="X" size={10} />
                    {log.failCount} échecs
                  </div>
                {/if}
                <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-on-surface/5 text-on-surface-variant/50 text-[10px] font-bold">
                  <Papicon icon="Target" size={10} />
                  {log.totalTargeted} ciblés
                </div>
                <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-on-surface/5 text-on-surface-variant/50 text-[10px] font-bold">
                  {log.target === 'ALL' ? 'Tous' : log.target === 'ACTIVATED' ? 'Activés' : 'Custom'}
                </div>
                <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-on-surface/5 text-on-surface-variant/50 text-[10px] font-bold">
                  {log.channelPref}
                </div>
                <div class="w-3 h-3 rounded-sm border border-white/10" style="background-color: {log.color}"></div>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    {/if}
  </div>
</AdminLayout>
