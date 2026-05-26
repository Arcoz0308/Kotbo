<script lang="ts">
  import { onMount } from 'svelte';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import { createAsyncActionState } from '../lib/asyncAction.svelte';
  import { toast } from '../lib/stores/toast.svelte';
  import { 
    fetchNews, 
    createNews, 
    updateNews, 
    deleteNews, 
    API_BASE_URL, 
    fetchNewsCategoryConfigs, 
    createNewsCategoryConfig, 
    deleteNewsCategoryConfig 
  } from '../lib/api';
  import Papicon from '../lib/components/Papicon.svelte';
  import InlineFeedback from '../lib/components/InlineFeedback.svelte';
  import Skeleton from '../lib/components/Skeleton.svelte';

  // State management
  let articles = $state<any[]>([]);
  let loading = $state(false);
  let showEditor = $state(false);
  let isEditing = $state(false);

  // Tab State
  let activeTab = $state<'articles' | 'configs'>('articles');
  let categoryConfigs = $state<any[]>([]);
  let loadingConfigs = $state(false);

  // Category Config Form State
  let configCategory = $state('');
  let configSubcategory = $state('');
  let configChannelId = $state('');

  // Editor form state
  let currentArticleId = $state<string | null>(null);
  let title = $state('');
  let content = $state('');
  let summary = $state('');
  let imageUrl = $state('');
  let category = $state('Mise à jour');
  let subcategory = $state('');
  let published = $state(false);

  // Filtering & Search
  let searchQuery = $state('');
  let categoryFilter = $state('ALL');
  let guildId = $state(authStore.selectedGuildId || (typeof localStorage !== 'undefined' ? localStorage.getItem('kotbo_guild_id') : '') || '');

  const actionState = createAsyncActionState();

  const categories = ['Mise à jour', 'Patch Note', 'Annonce', 'Blog', 'Staff'];

  const filteredArticles = $derived(
    articles.filter(art => {
      const matchesSearch = art.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (art.summary && art.summary.toLowerCase().includes(searchQuery.toLowerCase())) ||
                            art.authorName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = categoryFilter === 'ALL' || art.category === categoryFilter;
      return matchesSearch && matchesCategory;
    })
  );

  const canEdit = $derived(
    !!dashboardStore.state.featureAccess?.news?.canModerate ||
    !!dashboardStore.state.access?.canModerateContent
  );

  // Récupère l'ID du serveur depuis les articles ou le store
  const currentGuildId = $derived(
    articles[0]?.guildId ||
    guildId ||
    ''
  );
  const rssFeedUrl = $derived(`${API_BASE_URL}/api/public/rss/${currentGuildId}`);

  onMount(async () => {
    // S'assurer que le guildId est bien récupéré
    guildId = authStore.selectedGuildId || localStorage.getItem('kotbo_guild_id') || '';
    await Promise.all([
      dashboardStore.refresh(),
      loadArticles(),
      loadConfigs()
    ]);
  });

  async function loadArticles() {
    loading = true;
    try {
      articles = await fetchNews();
    } catch (err) {
      console.error(err);
    } finally {
      loading = false;
    }
  }

  async function loadConfigs() {
    loadingConfigs = true;
    try {
      categoryConfigs = await fetchNewsCategoryConfigs();
    } catch (err) {
      console.error(err);
    } finally {
      loadingConfigs = false;
    }
  }

  function openCreate() {
    currentArticleId = null;
    title = '';
    content = '';
    summary = '';
    imageUrl = '';
    category = 'Mise à jour';
    subcategory = '';
    published = false;
    isEditing = false;
    showEditor = true;
  }

  function openEdit(art: any) {
    currentArticleId = art.id;
    title = art.title;
    content = art.content;
    summary = art.summary || '';
    imageUrl = art.imageUrl || '';
    category = art.category;
    subcategory = art.subcategory || '';
    published = art.published;
    isEditing = true;
    showEditor = true;
  }

  async function handleSave() {
    if (!title.trim() || !content.trim()) {
      toast.error('Le titre et le contenu sont requis.');
      return;
    }

    const payload = {
      title,
      content,
      summary: summary || undefined,
      imageUrl: imageUrl || undefined,
      category,
      subcategory: subcategory || '',
      published
    };

    await actionState.run(async () => {
      if (isEditing && currentArticleId) {
        await updateNews(currentArticleId, payload);
      } else {
        await createNews(payload);
      }
      showEditor = false;
      await loadArticles();
      return true;
    }, { successMessage: isEditing ? 'Article mis à jour !' : 'Article créé !' });
  }

  async function handleDelete(id: string) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cet article ?')) return;

    await actionState.run(async () => {
      await deleteNews(id);
      await loadArticles();
      return true;
    }, { successMessage: 'Article supprimé.' });
  }

  async function handleSaveConfig() {
    if (!configCategory.trim() || !configChannelId) {
      toast.error('La catégorie et le salon Discord sont requis.');
      return;
    }

    await actionState.run(async () => {
      await createNewsCategoryConfig({
        category: configCategory.trim(),
        subcategory: configSubcategory.trim() || undefined,
        channelId: configChannelId
      });
      configCategory = '';
      configSubcategory = '';
      configChannelId = '';
      await loadConfigs();
      return true;
    }, { successMessage: 'Configuration enregistrée !' });
  }

  async function handleDeleteConfig(id: string) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette configuration ?')) return;

    await actionState.run(async () => {
      await deleteNewsCategoryConfig(id);
      await loadConfigs();
      return true;
    }, { successMessage: 'Configuration supprimée.' });
  }

  function copyRssUrl() {
    navigator.clipboard.writeText(rssFeedUrl);
    toast.success('Lien du flux RSS copié dans le presse-papiers !');
  }

  // Markdown live preview parser
  function interpretMarkdown(text: string) {
    if (!text) return '<p class="text-on-surface-variant/40 italic">Aucun contenu rédigé pour le moment...</p>';
    
    // Escaping simple HTML tags to avoid XSS (just standard practice)
    let escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    return escaped
      // Headers
      .replace(/^### (.*$)/gim, '<h5 class="text-sm font-black uppercase tracking-wider text-primary mt-4 mb-2">$1</h5>')
      .replace(/^## (.*$)/gim, '<h4 class="text-base font-black text-on-surface mt-6 mb-3 border-b border-outline-variant/20 pb-1">$1</h4>')
      .replace(/^# (.*$)/gim, '<h3 class="text-xl font-black text-on-surface mt-8 mb-4">$1</h3>')
      // Bold & Italic
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-primary">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
      // Links
      .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" class="text-primary hover:underline font-bold">$1</a>')
      // Blockquotes
      .replace(/^\> (.*$)/gim, '<blockquote class="border-l-4 border-primary/30 pl-4 py-1 my-2 bg-primary/5 rounded-r-lg italic text-sm text-on-surface-variant">$1</blockquote>')
      // List items
      .replace(/^\- (.*$)/gim, '<li class="ml-4 list-disc text-sm text-on-surface-variant">$1</li>')
      // Line breaks
      .replace(/\n/g, '<br/>');
  }

  function formatDate(date: string) {
    return new Date(date).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
</script>

<div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
  <!-- Header -->
  <header class="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-surface-container-low/40 backdrop-blur-3xl p-8 rounded-4xl border border-outline-variant/30">
    <div class="flex items-center gap-6">
      <div class="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shadow-inner">
        <Papicon icon="rss" size={32} />
      </div>
      <div>
        <h1 class="text-3xl font-black tracking-tight leading-tight">Actualités & RSS</h1>
        <p class="text-on-surface-variant/80 font-medium">Rédigez des annonces, des patch notes et générez le flux RSS du serveur.</p>
      </div>
    </div>
    <div class="flex gap-4">
      {#if showEditor}
        <button 
          onclick={() => showEditor = false}
          class="px-6 py-3 bg-surface-container-high text-on-surface font-black uppercase tracking-widest text-xs rounded-2xl shadow hover:bg-surface-container-highest transition-all"
        >
          Retour à la liste
        </button>
      {:else if canEdit}
        <button 
          onclick={openCreate}
          class="px-8 py-3 bg-primary text-on-primary font-black uppercase tracking-widest text-xs rounded-2xl shadow-lg shadow-primary/20 hover:scale-105 transition-all"
        >
          Créer un article
        </button>
      {/if}
    </div>
  </header>

  <InlineFeedback state={actionState} />

  {#if showEditor}
    <!-- EDITOR WORKSPACE -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <!-- Editor Form -->
      <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-[2.5rem] space-y-6">
        <h3 class="text-xl font-black flex items-center gap-3">
          <Papicon icon="edit" size={20} class="text-primary" />
          {isEditing ? 'Modifier l\'article' : 'Rédiger une actualité'}
        </h3>

        <div class="space-y-4">
          <!-- Title -->
          <div class="space-y-1.5">
            <label for="news-title" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Titre</label>
            <input 
              id="news-title" 
              type="text" 
              bind:value={title} 
              placeholder="Ex: Mise à jour v1.4.0 ou Patch Notes de sécurité..."
              class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-5 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all outline-none"
            />
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <!-- Category -->
            <div class="space-y-1.5">
              <label for="news-category" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Catégorie</label>
              <input 
                id="news-category" 
                type="text"
                list="categories-list"
                bind:value={category} 
                placeholder="Ex: Annonce, Patch Note..."
                class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-5 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all outline-none"
              />
              <datalist id="categories-list">
                {#each categories as cat}
                  <option value={cat}></option>
                {/each}
              </datalist>
            </div>

            <!-- Subcategory -->
            <div class="space-y-1.5">
              <label for="news-subcategory" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Sous-catégorie (optionnel)</label>
              <input 
                id="news-subcategory" 
                type="text"
                bind:value={subcategory} 
                placeholder="Ex: API, Frontend, Web..."
                class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-5 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all outline-none"
              />
            </div>

            <!-- Published checkbox -->
            <div class="flex items-center justify-between p-4 rounded-2xl bg-surface-container-high/20 border border-outline-variant/5">
              <div>
                <p class="text-xs font-bold font-medium leading-tight">Publier immédiatement</p>
                <p class="text-[9px] text-on-surface-variant/50">Visibilité publique & notification</p>
              </div>
              <input 
                type="checkbox" 
                bind:checked={published}
                class="w-5 h-5 rounded border-outline-variant text-primary focus:ring-primary/30"
              />
            </div>
          </div>

          <!-- Image URL -->
          <div class="space-y-1.5">
            <label for="news-image" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">URL de l'image (optionnel)</label>
            <input 
              id="news-image" 
              type="text" 
              bind:value={imageUrl} 
              placeholder="https://example.com/image.png"
              class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-5 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all outline-none"
            />
          </div>

          <!-- Summary -->
          <div class="space-y-1.5">
            <label for="news-summary" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Résumé court (optionnel)</label>
            <textarea 
              id="news-summary" 
              bind:value={summary} 
              rows="2" 
              placeholder="Une description rapide de deux lignes..."
              class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-5 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all outline-none resize-none"
            ></textarea>
          </div>

          <!-- Content (Markdown) -->
          <div class="space-y-1.5">
            <label for="news-content" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Contenu de l'article (Markdown supporté)</label>
            <textarea 
              id="news-content" 
              bind:value={content} 
              rows="12" 
              placeholder="Rédigez votre article ici..."
              class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-5 py-4 text-sm focus:ring-2 focus:ring-primary/30 transition-all outline-none font-mono"
            ></textarea>
          </div>

          <!-- Save Button -->
          <div class="pt-4 flex justify-end gap-4">
            <button 
              onclick={() => showEditor = false}
              class="px-6 py-3 bg-surface-container-high text-on-surface font-bold text-sm rounded-2xl hover:bg-surface-container-highest transition-all"
            >
              Annuler
            </button>
            <button 
              onclick={handleSave}
              class="px-8 py-3 bg-primary text-on-primary font-black uppercase tracking-widest text-xs rounded-2xl shadow-lg shadow-primary/20 hover:scale-105 transition-all"
            >
              {isEditing ? 'Mettre à jour' : 'Créer l\'article'}
            </button>
          </div>
        </div>
      </section>

      <!-- Live Preview -->
      <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-[2.5rem] flex flex-col h-full">
        <h3 class="text-xl font-black flex items-center gap-3 mb-6 shrink-0">
          <Papicon icon="eye" size={20} class="text-secondary" />
          Prévisualisation en direct
        </h3>
        
        <div class="flex-1 bg-surface-container-high/20 border border-outline-variant/10 rounded-3xl p-8 overflow-y-auto max-h-[600px] custom-scrollbar prose prose-invert">
          {#if imageUrl}
            <img src={imageUrl} alt="Illustration" class="w-full h-48 object-cover rounded-2xl mb-6 border border-outline-variant/20" />
          {/if}
          <div class="mb-4 flex flex-wrap gap-2">
            <span class="px-3 py-1 text-[10px] font-black uppercase tracking-wider rounded-full bg-primary/10 text-primary">
              {category}
            </span>
            {#if subcategory}
              <span class="px-3 py-1 text-[10px] font-black uppercase tracking-wider rounded-full bg-secondary/10 text-secondary">
                {subcategory}
              </span>
            {/if}
          </div>
          <h2 class="text-2xl font-black text-on-surface mb-2">{title || 'Titre de l\'article'}</h2>
          {#if summary}
            <p class="text-sm font-medium text-on-surface-variant border-l-2 border-outline-variant/30 pl-4 py-1 italic mb-6">{summary}</p>
          {/if}
          <div class="text-sm text-on-surface-variant leading-relaxed">
            {@html interpretMarkdown(content)}
          </div>
        </div>
      </section>
    </div>
  {:else}
    <!-- Tab Switcher -->
    <div class="flex border-b border-outline-variant/20 mb-8 shrink-0">
      <button 
        onclick={() => activeTab = 'articles'}
        class="px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all relative {activeTab === 'articles' ? 'text-primary font-bold' : 'text-on-surface-variant/40 hover:text-on-surface-variant'}"
      >
        Articles
        {#if activeTab === 'articles'}
          <div class="absolute bottom-0 left-8 right-8 h-0.5 bg-primary rounded-t-full"></div>
        {/if}
      </button>
      <button 
        onclick={() => activeTab = 'configs'}
        class="px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all relative {activeTab === 'configs' ? 'text-primary font-bold' : 'text-on-surface-variant/40 hover:text-on-surface-variant'}"
      >
        Flux & Salons par Catégorie
        {#if activeTab === 'configs'}
          <div class="absolute bottom-0 left-8 right-8 h-0.5 bg-primary rounded-t-full"></div>
        {/if}
      </button>
    </div>

    {#if activeTab === 'articles'}
      <!-- LIST VIEW -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <!-- RSS feed copy link card (Wide on desktop) -->
        <section class="lg:col-span-3 bg-gradient-to-r from-primary/10 via-secondary/5 to-transparent border border-outline-variant/20 p-8 rounded-[2.5rem] flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div class="space-y-2">
            <h3 class="text-lg font-black flex items-center gap-2.5">
              <Papicon icon="globe" size={20} class="text-primary" />
              Votre Flux RSS Public
            </h3>
            <p class="text-xs text-on-surface-variant font-medium max-w-2xl">
              Ce flux RSS est généré dynamiquement à partir des articles marqués comme **publiés**. Vos membres peuvent s'y abonner sur Feedly, Inoreader, ou tout autre lecteur RSS.
            </p>
          </div>
          <div class="flex items-center gap-2 bg-surface-container-low border border-outline-variant/25 px-5 py-3 rounded-2xl w-full md:w-auto md:min-w-[400px]">
            <span class="text-xs font-mono text-on-surface truncate flex-1">{rssFeedUrl}</span>
            <button 
              onclick={copyRssUrl} 
              class="p-2 text-primary hover:bg-primary/10 rounded-xl transition-all"
              title="Copier le lien"
            >
              <Papicon icon="copy" size={18} />
            </button>
          </div>
        </section>

        <!-- Articles list table/cards -->
        <section class="lg:col-span-3 bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-[2.5rem] space-y-6">
          <!-- Search & filters -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="relative flex-1 max-w-md">
              <span class="absolute inset-y-0 left-0 pl-4 flex items-center text-on-surface-variant/40">
                <Papicon icon="search" size={18} />
              </span>
              <input 
                type="text" 
                bind:value={searchQuery} 
                placeholder="Rechercher par titre, résumé ou auteur..." 
                class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl pl-11 pr-5 py-3 text-xs outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>

            <div class="flex items-center gap-2">
              <label for="filter-category" class="text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-wider">Filtrer :</label>
              <select 
                id="filter-category" 
                bind:value={categoryFilter} 
                class="bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-2.5 text-xs outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              >
                <option value="ALL">Toutes catégories</option>
                {#each categories as cat}
                  <option value={cat}>{cat}</option>
                {/each}
              </select>
            </div>
          </div>

          {#if loading}
            <div class="space-y-4">
              {#each Array(3) as _}
                <div class="p-6 bg-surface-container-high/20 border border-outline-variant/5 rounded-2xl flex items-center justify-between">
                  <div class="space-y-2 w-1/3">
                    <Skeleton width="100%" height="16px" />
                    <Skeleton width="60%" height="12px" />
                  </div>
                  <Skeleton width="15%" height="24px" radius="12px" />
                  <Skeleton width="8%" height="32px" radius="8px" />
                </div>
              {/each}
            </div>
          {:else if filteredArticles.length > 0}
            <div class="overflow-x-auto rounded-3xl border border-outline-variant/10">
              <table class="w-full border-collapse text-left">
                <thead>
                  <tr class="bg-surface-container-high/40 text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60">
                    <th class="px-6 py-4">Article</th>
                    <th class="px-6 py-4">Catégorie</th>
                    <th class="px-6 py-4">Auteur</th>
                    <th class="px-6 py-4">Date de pub.</th>
                    <th class="px-6 py-4">État</th>
                    {#if canEdit}
                      <th class="px-6 py-4 text-right">Actions</th>
                    {/if}
                  </tr>
                </thead>
                <tbody class="divide-y divide-outline-variant/5">
                  {#each filteredArticles as art}
                    <tr class="hover:bg-surface-container-high/10 transition-colors">
                      <td class="px-6 py-5">
                        <div class="flex items-center gap-4">
                          {#if art.imageUrl}
                            <img src={art.imageUrl} alt="" class="w-12 h-12 object-cover rounded-xl border border-outline-variant/10" />
                          {:else}
                            <div class="w-12 h-12 bg-primary/5 text-primary rounded-xl flex items-center justify-center">
                              <Papicon icon="newspaper" size={20} />
                            </div>
                          {/if}
                          <div>
                            <p class="font-bold text-sm text-on-surface">{art.title}</p>
                            {#if art.summary}
                              <p class="text-xs text-on-surface-variant/80 line-clamp-1 mt-0.5">{art.summary}</p>
                            {/if}
                          </div>
                        </div>
                      </td>
                      <td class="px-6 py-5">
                        <div class="flex flex-col gap-1">
                          <span class="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-full bg-primary/10 text-primary w-fit">
                            {art.category}
                          </span>
                          {#if art.subcategory}
                            <span class="text-[9px] text-secondary font-bold uppercase tracking-wider ml-1">↳ {art.subcategory}</span>
                          {/if}
                        </div>
                      </td>
                      <td class="px-6 py-5">
                        <div class="flex items-center gap-2">
                          {#if art.authorAvatar}
                            <img src={art.authorAvatar} alt="" class="w-6 h-6 rounded-full" />
                          {/if}
                          <span class="text-xs font-bold text-on-surface-variant">{art.authorName}</span>
                        </div>
                      </td>
                      <td class="px-6 py-5 text-xs text-on-surface-variant font-medium">
                        {formatDate(art.publishedAt)}
                      </td>
                      <td class="px-6 py-5">
                        {#if art.published}
                          <span class="px-2.5 py-1 text-[9px] font-black uppercase tracking-widest rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400">
                            Publié
                          </span>
                        {:else}
                          <span class="px-2.5 py-1 text-[9px] font-black uppercase tracking-widest rounded-full bg-slate-100 text-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
                            Brouillon
                          </span>
                        {/if}
                      </td>
                      {#if canEdit}
                        <td class="px-6 py-5 text-right">
                          <div class="flex items-center justify-end gap-1">
                            <button 
                              onclick={() => openEdit(art)} 
                              class="p-2 text-on-surface-variant hover:text-primary hover:bg-primary/5 rounded-xl transition-all"
                              title="Modifier"
                            >
                              <Papicon icon="edit" size={16} />
                            </button>
                            <button 
                              onclick={() => handleDelete(art.id)} 
                              class="p-2 text-on-surface-variant hover:text-red-500 hover:bg-red-500/5 rounded-xl transition-all"
                              title="Supprimer"
                            >
                              <Papicon icon="trash" size={16} />
                            </button>
                          </div>
                        </td>
                      {/if}
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {:else}
            <div class="flex flex-col items-center justify-center py-20 border border-dashed border-outline-variant/30 rounded-3xl">
              <div class="w-16 h-16 bg-surface-container-high/30 rounded-full flex items-center justify-center text-on-surface-variant/30 mb-4">
                <Papicon icon="rss" size={32} />
              </div>
              <h4 class="text-base font-black text-on-surface">Aucun article trouvé</h4>
              <p class="text-xs text-on-surface-variant/60 font-medium mt-1">Commencez par rédiger votre première mise à jour ou patch note.</p>
              {#if canEdit}
                <button 
                  onclick={openCreate}
                  class="mt-6 px-6 py-2.5 bg-primary text-on-primary font-black uppercase tracking-widest text-[10px] rounded-xl hover:scale-105 transition-all"
                >
                  Créer un article
                </button>
              {/if}
            </div>
          {/if}
        </section>
      </div>
    {:else}
      <!-- CONFIGS VIEW -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in duration-300">
        <!-- Mapping Form -->
        <section class="lg:col-span-1 bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-[2.5rem] space-y-6 h-fit">
          <h3 class="text-xl font-black flex items-center gap-3">
            <Papicon icon="plus" size={20} class="text-primary" />
            Nouveau Salon par Catégorie
          </h3>
          <p class="text-xs text-on-surface-variant/70 leading-relaxed">
            Configurez un salon Discord spécifique pour recevoir les notifications d'une catégorie et/ou sous-catégorie.
          </p>

          <div class="space-y-4">
            <!-- Category Input -->
            <div class="space-y-1.5">
              <label for="config-category" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Catégorie</label>
              <input
                id="config-category"
                type="text"
                list="categories-config-list"
                bind:value={configCategory}
                placeholder="Ex: Annonce, Patch Note..."
                class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-5 py-3 text-sm focus:ring-2 focus:ring-primary/30 outline-none transition-all"
              />
              <datalist id="categories-config-list">
                {#each categories as cat}
                  <option value={cat}></option>
                {/each}
              </datalist>
            </div>

            <!-- Subcategory Input -->
            <div class="space-y-1.5">
              <label for="config-subcategory" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Sous-catégorie (optionnel)</label>
              <input
                id="config-subcategory"
                type="text"
                bind:value={configSubcategory}
                placeholder="Ex: API, Frontend, Web..."
                class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-5 py-3 text-sm focus:ring-2 focus:ring-primary/30 outline-none transition-all"
              />
            </div>

            <!-- Discord Channel Selector -->
            <div class="space-y-1.5">
              <label for="config-channel" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Salon Discord</label>
              <select
                id="config-channel"
                bind:value={configChannelId}
                class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-5 py-3 text-sm focus:ring-2 focus:ring-primary/30 outline-none transition-all"
              >
                <option value="">— Sélectionner un salon —</option>
                {#each dashboardStore.state.discordChannels || [] as channel}
                  <option value={channel.id}>#{channel.name}</option>
                {/each}
              </select>
            </div>

            <!-- Save Config Button -->
            <button
              onclick={handleSaveConfig}
              class="w-full mt-2 py-3 bg-primary text-on-primary font-black uppercase tracking-widest text-xs rounded-2xl shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all"
            >
              Enregistrer la configuration
            </button>
          </div>
        </section>

        <!-- Mapping List & RSS Feeds -->
        <section class="lg:col-span-2 bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-[2.5rem] space-y-6">
          <h3 class="text-xl font-black flex items-center gap-3">
            <Papicon icon="rss" size={20} class="text-secondary" />
            Configuration des Salons & Flux RSS
          </h3>

          {#if loadingConfigs}
            <div class="space-y-4">
              {#each Array(2) as _}
                <div class="p-6 bg-surface-container-high/20 border border-outline-variant/5 rounded-2xl flex items-center justify-between">
                  <div class="space-y-2 w-1/3">
                    <Skeleton width="100%" height="16px" />
                    <Skeleton width="60%" height="12px" />
                  </div>
                  <Skeleton width="10%" height="32px" radius="8px" />
                </div>
              {/each}
            </div>
          {:else if categoryConfigs.length > 0}
            <div class="overflow-x-auto rounded-3xl border border-outline-variant/10">
              <table class="w-full border-collapse text-left">
                <thead>
                  <tr class="bg-surface-container-high/40 text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60">
                    <th class="px-6 py-4">Catégorie / Sous-catégorie</th>
                    <th class="px-6 py-4">Salon Discord</th>
                    <th class="px-6 py-4">Flux RSS Dédié</th>
                    {#if canEdit}
                      <th class="px-6 py-4 text-right">Action</th>
                    {/if}
                  </tr>
                </thead>
                <tbody class="divide-y divide-outline-variant/5">
                  {#each categoryConfigs as config}
                    <tr class="hover:bg-surface-container-high/10 transition-colors text-xs font-medium text-on-surface-variant">
                      <td class="px-6 py-5">
                        <div class="flex flex-col gap-1">
                          <span class="font-bold text-sm text-on-surface">{config.category}</span>
                          {#if config.subcategory}
                            <span class="text-[10px] text-primary font-bold uppercase tracking-wider">↳ {config.subcategory}</span>
                          {/if}
                        </div>
                      </td>
                      <td class="px-6 py-5">
                        <span class="px-2.5 py-1 text-[10px] font-bold rounded-full bg-surface-container-high/65 text-on-surface">
                          #{((dashboardStore.state.discordChannels || []).find(ch => ch.id === config.channelId)?.name) || 'salon-inconnu'}
                        </span>
                      </td>
                      <td class="px-6 py-5 font-mono text-[10px] select-all max-w-[200px] truncate" title={`${API_BASE_URL}/api/public/rss/${currentGuildId}/${encodeURIComponent(config.category)}${config.subcategory ? `/${encodeURIComponent(config.subcategory)}` : ''}`}>
                        {API_BASE_URL}/api/public/rss/{currentGuildId}/{encodeURIComponent(config.category)}{config.subcategory ? `/${encodeURIComponent(config.subcategory)}` : ''}
                      </td>
                      {#if canEdit}
                        <td class="px-6 py-5 text-right">
                          <button
                            onclick={() => handleDeleteConfig(config.id)}
                            class="p-2 text-on-surface-variant hover:text-red-500 hover:bg-red-500/5 rounded-xl transition-all"
                            title="Supprimer"
                          >
                            <Papicon icon="trash" size={16} />
                          </button>
                        </td>
                      {/if}
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {:else}
            <div class="flex flex-col items-center justify-center py-20 border border-dashed border-outline-variant/30 rounded-3xl">
              <div class="w-16 h-16 bg-surface-container-high/30 rounded-full flex items-center justify-center text-on-surface-variant/30 mb-4">
                <Papicon icon="rss" size={32} />
              </div>
              <h4 class="text-base font-black text-on-surface">Aucune configuration de catégorie</h4>
              <p class="text-xs text-on-surface-variant/60 font-medium mt-1">Configurez des salons de notification et flux RSS spécifiques par catégorie à gauche.</p>
            </div>
          {/if}
        </section>
      </div>
    {/if}
  {/if}
</div>
