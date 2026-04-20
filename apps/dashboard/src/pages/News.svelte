<script lang="ts">
  import { onMount } from 'svelte';
  import ToggleSwitch from '../lib/components/ToggleSwitch.svelte';
  import FilterChips from '../lib/components/FilterChips.svelte';
  import FormInput from '../lib/components/FormInput.svelte';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { authStore } from '../lib/stores/auth.svelte';

  let isGazetteMode = $state(true);
  let isDarkTheme = $state(false);
  let translating = $state(false);
  let isTranslated = $state(false);

  let localNews = $state([]);
  let searchQuery = $state('');
  let selectedSource = $state('Toutes les sources');
  let selectedCategory = $state('Toutes');
  let sortOrder = $state<'newest' | 'oldest'>('newest');

  let guildName = $derived(dashboardStore.state.guildName);
  let loading = $derived(dashboardStore.state.loading);
  let error = $derived(dashboardStore.state.error);

  const rawItems = $derived(isTranslated ? localNews : (dashboardStore.state.contentItems || []));
  
  const uniqueSources = $derived.by(() => {
    const items = rawItems || [];
    const filtered = selectedCategory === 'Toutes' 
      ? items 
      : items.filter(item => item.feed?.category === selectedCategory);
    
    return [
      'Toutes les sources',
      ...new Set(filtered.map(item => item.feed?.name).filter(Boolean))
    ];
  });

  const uniqueCategories = $derived([
    'Toutes',
    ...new Set((rawItems || []).map(item => item.feed?.category).filter(Boolean))
  ]);

  const filteredNews = $derived.by(() => {
    let items = [...rawItems];

    // Category Filter (Top Nav)
    if (selectedCategory !== 'Toutes') {
      items = items.filter(item => item.feed?.category === selectedCategory);
    }

    // Source Filter (Chips)
    if (selectedSource !== 'Toutes les sources') {
      items = items.filter(item => item.feed?.name === selectedSource);
    }

    // Search Filter
    const query = searchQuery.toLowerCase().trim();
    if (query) {
      items = items.filter(item => {
        const title = item.title || '';
        const excerpt = item.excerpt || '';
        const author = item.author || '';
        return title.toLowerCase().includes(query) || 
               excerpt.toLowerCase().includes(query) || 
               author.toLowerCase().includes(query);
      });
    }

    // Sorting
    items.sort((a, b) => {
      const dateA = a.scheduleAt ? new Date(a.scheduleAt).getTime() : 0;
      const dateB = b.scheduleAt ? new Date(b.scheduleAt).getTime() : 0;
      
      if (sortOrder === 'newest') {
        return dateB - dateA;
      } else {
        return dateA - dateB;
      }
    });

    return items;
  });

  const formatter = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  async function translateAll() {
    if (isTranslated || translating) return;
    translating = true;
    
    try {
      const articlesToTranslate = dashboardStore.state.contentItems.filter(n => {
        const text = (n.title + ' ' + (n.excerpt || '')).toLowerCase();
        return text.includes(' the ') || text.includes(' and ') || text.includes(' with ');
      });

      if (articlesToTranslate.length === 0) {
        localNews = [...dashboardStore.state.contentItems];
        isTranslated = true;
        translating = false;
        return;
      }

      const results = await Promise.all(articlesToTranslate.map(async (article) => {
        const textToTranslate = encodeURIComponent(`${article.title}|||${article.excerpt || ''}`);
        const response = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=fr&dt=t&q=${textToTranslate}`);
        const json = await response.json();
        
        let translatedText = '';
        if (json[0]) {
          translatedText = json[0].map(s => s[0]).join('');
        }
        
        const [translatedTitle, translatedExcerpt] = translatedText.split('|||');
        return { 
          id: article.id, 
          title: translatedTitle?.trim() || article.title, 
          excerpt: translatedExcerpt?.trim() || article.excerpt 
        };
      }));

      localNews = dashboardStore.state.contentItems.map(n => {
        const translated = results.find(r => r.id === n.id);
        return translated ? { ...n, title: translated.title, excerpt: translated.excerpt } : { ...n };
      });

      isTranslated = true;
    } catch (e) {
      console.error('Translation failed:', e);
    } finally {
      translating = false;
    }
  }

  $effect(() => {
    if (isDarkTheme) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('news_theme', isDarkTheme ? 'dark' : 'light');
  });

  $effect(() => {
    localStorage.setItem('news_layout_mode', isGazetteMode ? 'gazette' : 'modern');
  });

  function toggleTheme(value: boolean) {
    isDarkTheme = value;
  }

  function toggleGazetteMode(value: boolean) {
    isGazetteMode = value;
  }

  onMount(() => {
    // Load persisted preferences
    const savedTheme = localStorage.getItem('news_theme');
    const savedMode = localStorage.getItem('news_layout_mode');
    
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
      isDarkTheme = true;
    } else {
      isDarkTheme = false;
    }

    if (savedMode === 'modern') {
      isGazetteMode = false;
    } else {
      isGazetteMode = true;
    }
    
    if (dashboardStore.state.contentItems.length === 0 && authStore.isAuthenticated) {
      dashboardStore.refresh();
    }
  });

  function processExcerpt(text: string | null) {
    if (!text) return '';
    let cleaned = text.replace(/<[^>]*>/g, '').trim();
    if (cleaned.length > 0) {
      cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }
    
    if (cleaned.length > 500) {
      const truncated = cleaned.substring(0, 500);
      const lastSpace = truncated.lastIndexOf(' ');
      cleaned = (lastSpace > 400 ? truncated.substring(0, lastSpace) : truncated) + '...';
    }
    
    return cleaned;
  }
</script>

<svelte:head>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="">
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=Lora:ital,wght@0,400;0,700;1,400&family=UnifrakturMaguntia&family=Spectral:ital,wght@0,400;0,700;1,400;1,700&display=swap" rel="stylesheet">
</svelte:head>

{#snippet FilterBar()}
  <div class="mb-10 {isGazetteMode ? 'border-y-2 border-[#1a1a1a] dark:border-[#f0f0f0] py-4' : 'bg-surface-container/30 backdrop-blur-sm rounded-2xl p-4 border border-outline-variant/10 shadow-sm'}">
    <div class="flex flex-col lg:flex-row lg:items-center gap-6">
      <!-- Search -->
      <div class="w-full lg:w-64 relative">
        <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-sm opacity-50">search</span>
        <FormInput 
          bind:value={searchQuery} 
          placeholder={isGazetteMode ? 'RECHERCHER...' : 'Rechercher un article...'}
          className="w-full pl-9 bg-transparent border-none {isGazetteMode ? 'font-[\'Lora\'] italic text-sm placeholder:opacity-50' : 'text-xs font-bold'}"
        />
        {#if isGazetteMode}
          <div class="absolute bottom-0 left-9 right-0 h-px bg-[#1a1a1a]/20 dark:bg-[#f0f0f0]/20"></div>
        {/if}
      </div>

      <!-- Sources (FilterChips) -->
      <div class="flex-1 overflow-x-auto no-scrollbar w-full">
        <FilterChips 
          options={uniqueSources} 
          selected={selectedSource} 
          onSelect={(s) => selectedSource = s}
          containerClass="flex items-center gap-3"
          buttonClass="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap"
          activeClass={isGazetteMode ? 'border-b-2 border-[#1a1a1a] dark:border-[#f0f0f0]' : 'bg-primary text-on-primary rounded-full shadow-lg shadow-primary/20'}
          inactiveClass={isGazetteMode ? 'opacity-40 hover:opacity-100' : 'opacity-60 hover:opacity-100 hover:text-primary'}
        />
      </div>

      <!-- Sort Toggle -->
      <button 
        onclick={() => sortOrder = sortOrder === 'newest' ? 'oldest' : 'newest'}
        class="flex items-center gap-2 px-4 py-2 {isGazetteMode ? 'font-[\'Lora\'] italic text-sm border border-[#1a1a1a]/20 dark:border-[#f0f0f0]/20' : 'text-[10px] font-black uppercase tracking-widest bg-surface-container rounded-lg'}"
      >
        <span class="material-symbols-outlined text-sm">
          {sortOrder === 'newest' ? 'arrow_downward' : 'arrow_upward'}
        </span>
        {isGazetteMode ? (sortOrder === 'newest' ? 'Plus récents' : 'Plus anciens') : (sortOrder === 'newest' ? 'Récents' : 'Ancients')}
      </button>
    </div>
    
    <!-- Counters -->
    <div class="mt-4 flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.2em] opacity-50 px-2">
      <span>{filteredNews.length} Article{filteredNews.length > 1 ? 's' : ''} trouvé{filteredNews.length > 1 ? 's' : ''}</span>
      {#if searchQuery || selectedSource !== 'Toutes les sources'}
        <button onclick={() => { searchQuery = ''; selectedSource = 'Toutes les sources'; }} class="hover:text-primary underline">Réinitialiser les filtres</button>
      {/if}
    </div>
  </div>
{/snippet}

{#snippet StatusMessage()}
  {#if loading}
    <div class="flex flex-col items-center justify-center py-32 space-y-4 animate-pulse">
      <div class="h-1 bg-[#1a1a1a] dark:bg-[#f0f0f0] w-32"></div>
      <p class="text-xl italic font-bold">Rédaction en cours...</p>
    </div>
  {:else if error}
    <div class="text-center py-32">
      <p class="text-2xl font-bold text-red-800">Dépêche interrompue: {error}</p>
    </div>
  {:else if !filteredNews || filteredNews.length === 0}
    <div class="text-center py-32">
      <p class="text-2xl font-bold italic">Pas de nouvelles aujourd'hui. Le calme avant la tempête.</p>
    </div>
  {/if}
{/snippet}

{#snippet NewsContent()}
  {#if !loading && !error && filteredNews && filteredNews.length > 0}
    <div class="max-w-4xl mx-auto space-y-12 {isGazetteMode ? '' : 'mt-12 px-4'}">
      {#each filteredNews as item, i}
        {#if isGazetteMode}
          <article class="{i > 0 ? 'pt-12 border-t border-[#1a1a1a]/30 dark:border-[#f0f0f0]/30' : ''}">
            <p class="text-[10px] font-bold uppercase tracking-widest opacity-60 italic mb-2">
              {item.feed?.name}
            </p>
            <h2 class="text-3xl md:text-5xl font-['Playfair_Display'] font-bold leading-tight mb-4 transition-all">
              <a href={item.url} target="_blank" class="hover:underline">{item.title}</a>
            </h2>
            
            <div class="flex items-center gap-4 text-xs font-bold uppercase tracking-widest mb-6 italic opacity-70">
              <span>{item.author || 'Notre Correspondant'}</span>
              <span class="w-1 h-1 bg-[#1a1a1a] dark:bg-[#f0f0f0] rounded-full"></span>
              <span>{item.scheduleAt ? new Date(item.scheduleAt).toLocaleDateString() : ''}</span>
            </div>

            {#if item.imageUrl}
              <div class="mb-8 border-4 border-double border-[#1a1a1a] dark:border-[#f0f0f0] p-1 bg-white dark:bg-black overflow-hidden group">
                <img 
                  src={item.imageUrl} 
                  alt={item.title} 
                  class="w-full h-auto max-h-[400px] object-cover filter grayscale sepia-[0.3] contrast-125 group-hover:grayscale-0 transition-all duration-700"
                />
              </div>
            {/if}

            <div class="text-justify leading-relaxed text-lg font-['Lora'] whitespace-pre-line {isDarkTheme ? 'opacity-90' : ''}">
              {#if item.excerpt}
                {@const processed = processExcerpt(item.excerpt)}
                <span class="float-left text-7xl font-['Playfair_Display'] font-black mr-3 mt-1 leading-[0.8] border-b-4 border-[#1a1a1a] dark:border-[#f0f0f0]">
                  {processed.charAt(0)}
                </span>
                {processed.slice(1)}
              {/if}
            </div>
            
            <div class="mt-8">
              <a href={item.url} target="_blank" class="inline-block border-b-2 border-[#1a1a1a] dark:border-[#f0f0f0] font-bold uppercase tracking-wider text-xs hover:border-b-4 transition-all">
                Lire l'article complet &rarr;
              </a>
            </div>
          </article>
        {:else}
          <article class="group grid md:grid-cols-[1fr_300px] gap-8 pb-12 border-b border-outline-variant/30">
            <div class="space-y-4">
              <div class="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] text-primary">
                <span class="bg-primary/10 px-2 py-0.5 rounded-sm">{item.feed?.name || 'Flash Info'}</span>
                <span class="opacity-40">●</span>
                <span class="opacity-40">{item.scheduleAt ? new Date(item.scheduleAt).toLocaleDateString() : ''}</span>
              </div>
              
              <h2 class="text-3xl md:text-4xl font-['Spectral'] font-black leading-tight group-hover:text-primary transition-colors">
                <a href={item.url} target="_blank">{item.title}</a>
              </h2>
              
              <p class="text-lg text-on-surface-variant font-['Spectral'] leading-relaxed line-clamp-3">
                {processExcerpt(item.excerpt)}
              </p>
              
              <div class="flex items-center gap-4 pt-2">
                <span class="text-xs italic opacity-60">Par {item.author || 'La Rédaction'}</span>
                <a href={item.url} target="_blank" class="text-xs font-bold uppercase tracking-widest text-primary hover:underline">Découvrir →</a>
              </div>
            </div>
            
            <div class="hidden md:block">
              <div class="w-full aspect-[4/3] bg-surface-container rounded-sm overflow-hidden border border-outline-variant/20 relative group-hover:border-primary/30 transition-colors">
                 {#if item.imageUrl}
                   <img src={item.imageUrl} alt={item.title} class="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                 {:else}
                   <div class="absolute inset-0 flex items-center justify-center opacity-10">
                      <span class="text-6xl font-['UnifrakturMaguntia']">K</span>
                   </div>
                 {/if}
                 <div class="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
              </div>
            </div>
          </article>
        {/if}
      {/each}
    </div>
  {/if}
{/snippet}


{#snippet Footer()}
  <footer class="mt-20 pt-8 border-t-2 border-[#1a1a1a] dark:border-[#f0f0f0] text-center {isGazetteMode ? '' : 'px-4 mb-12'}">
    <p class="text-xs font-bold uppercase tracking-[0.4em]">
      &copy; {new Date().getFullYear()} Kotbo Tech Publishing House. All Rights Reserved.
    </p>
  </footer>
{/snippet}



<div class="min-h-screen transition-all duration-700 {isGazetteMode ? 'bg-[#fdfbf7] dark:bg-[#0a0a0a] text-[#1a1a1a] dark:text-[#f0f0f0] selection:bg-[#fee75c]/30 p-4 md:p-8 lg:p-12' : 'bg-surface text-on-surface p-0 md:p-4'}">

  {#if isGazetteMode}
    <div class="max-w-6xl mx-auto border-double border-4 border-[#1a1a1a] dark:border-[#f0f0f0]/40 p-2 bg-[#fdfbf7] dark:bg-[#111] dark:text-[#f0f0f0] transition-colors duration-500 shadow-2xl relative overflow-hidden">
      <div class="absolute inset-0 pointer-events-none opacity-[0.03] mix-blend-multiply dark:hidden" style="background-image: url('https://www.transparenttextures.com/patterns/paper-fibers.png');"></div>
      

      <div class="border border-[#1a1a1a] dark:border-[#f0f0f0]/20 p-4 md:p-8">
        <header class="text-center space-y-4 mb-12">
          <div class="flex items-center justify-between border-b-2 border-[#1a1a1a] dark:border-[#f0f0f0] pb-2 text-[10px] md:text-sm font-bold uppercase tracking-widest italic">
            <div class="flex items-center gap-4">
               <span>Vol. {new Date().getFullYear()} No. {Math.floor(new Date().getTime() / 1000000000)}</span>
               <div class="hidden lg:flex items-center gap-2 border-l border-[#1a1a1a]/20 dark:border-[#f0f0f0]/20 pl-4">
                 <span class="text-[9px] opacity-60">Style Gazette</span>
                 <ToggleSwitch checked={isGazetteMode} onToggle={(v) => toggleGazetteMode(v)} size="sm" />
                 <span class="text-[9px] opacity-60 ml-2">Mode Sombre</span>
                 <ToggleSwitch checked={isDarkTheme} onToggle={(v) => toggleTheme(v)} size="sm" />
               </div>
            </div>
            
            <span class="hidden md:inline">Kotbo by <a href="https://klaynight.fr" target="_blank" class="hover:underline">Klaynight</a> & <a href="https://nathaan.me" target="_blank" class="hover:underline">GNU-Nathan</a></span>
            
            <div class="flex items-center gap-4">
              <button 
                onclick={translateAll} 
                class="hover:underline disabled:opacity-50 text-primary uppercase font-black tracking-tighter"
                disabled={translating || isTranslated}
              >
                {translating ? '...' : isTranslated ? 'FR ✓' : 'Translate'}
              </button>
              <span>{guildName || 'Kotbo Gazette'} Edition</span>
            </div>
          </div>
          <h1 class="text-6xl md:text-8xl lg:text-9xl font-['Playfair_Display'] font-black uppercase tracking-tighter leading-none py-4 border-b-4 border-[#1a1a1a] dark:border-[#f0f0f0]">The Kotbo Gazette</h1>
          <div class="flex items-center justify-between pt-2 text-[10px] md:text-sm font-bold uppercase tracking-widest italic">
            <span>Paris, {formatter.format(new Date())}</span>
            <span>Prix: Gratuit / Connaissances</span>
          </div>
          {#if uniqueCategories.length > 1}
            <nav class="flex items-center justify-center gap-6 pt-4 border-t border-[#1a1a1a]/20 dark:border-[#f0f0f0]/20 flex-wrap">
              {#each uniqueCategories as cat}
                <button 
                  onclick={() => { selectedCategory = cat; selectedSource = 'Toutes les sources'; }}
                  class="text-[10px] font-black uppercase tracking-widest transition-all pb-1 border-b-2 whitespace-nowrap {selectedCategory === cat ? 'opacity-100 border-[#1a1a1a] dark:border-[#f0f0f0]' : 'opacity-40 border-transparent hover:opacity-100'}"
                >
                  {cat === 'Toutes' ? 'Tous les sujets' : cat}
                </button>
              {/each}
            </nav>
          {/if}
        </header>

        {@render FilterBar()}
        {@render StatusMessage()}
        {@render NewsContent()}
        {@render Footer()}
      </div>
    </div>
  {:else}
    <div class="modern-layout">
      <header class="sticky top-0 bg-surface/80 backdrop-blur-md border-b border-outline-variant z-40">
        <div class="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <div class="flex-1 hidden md:flex items-center gap-6 text-[10px] font-bold uppercase tracking-widest opacity-60">
            <span>{formatter.format(new Date())}</span>
            <span class="w-px h-4 bg-outline-variant"></span>
            <span>Le Journal de Kotbo</span>
          </div>
          <div class="flex-shrink-0">
            <h1 class="text-4xl font-['UnifrakturMaguntia'] tracking-tight">Kotbo</h1>
          </div>
          <div class="flex-1 flex justify-end items-center gap-6">
            <div class="flex items-center gap-4 border-r border-outline-variant pr-6">
              <div class="flex items-center gap-2">
                <span class="text-[10px] font-black uppercase tracking-tighter opacity-70">Gazette</span>
                <ToggleSwitch checked={isGazetteMode} onToggle={(v) => toggleGazetteMode(v)} size="sm" />
              </div>
              <div class="flex items-center gap-2">
                <span class="text-[10px] font-black uppercase tracking-tighter opacity-70">Dark</span>
                <ToggleSwitch checked={isDarkTheme} onToggle={(v) => toggleTheme(v)} size="sm" />
              </div>
            </div>
            
            <button 
              onclick={translateAll}
              disabled={translating || isTranslated}
              class="text-xs font-black uppercase tracking-widest text-primary hover:opacity-70 disabled:opacity-50 transition-all"
            >
              {translating ? 'Traduction...' : isTranslated ? 'En Français ✓' : 'Traduire'}
            </button>

          </div>
        </div>
        <nav class="max-w-7xl mx-auto px-4 pb-2 flex items-center justify-center gap-8 overflow-x-auto no-scrollbar border-t border-outline-variant/10 pt-2">
          {#each uniqueCategories as cat}
            <button 
              onclick={() => { selectedCategory = cat; selectedSource = 'Toutes les sources'; }}
              class="text-[10px] font-black uppercase tracking-widest transition-all pb-1 border-b-2 whitespace-nowrap {selectedCategory === cat ? 'opacity-100 text-primary border-primary' : 'opacity-60 border-transparent hover:opacity-100 hover:text-primary hover:border-primary'}"
            >
              {cat === 'Toutes' ? 'À la une' : cat}
            </button>
          {/each}
        </nav>
      </header>

      <div class="mt-8 max-w-7xl mx-auto px-4">
        {@render FilterBar()}
        <div class="mt-8">
          {@render StatusMessage()}
          {@render NewsContent()}
          {@render Footer()}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
  }
  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }
  .no-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
</style>
