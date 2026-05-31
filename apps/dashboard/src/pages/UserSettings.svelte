<script lang="ts">
  import { authStore } from '../lib/stores/auth.svelte';
  import { userPrefs } from '../lib/stores/userPreferences.svelte';
  import { themeStore } from '../lib/stores/theme.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import ToggleSwitch from '../lib/components/ToggleSwitch.svelte';

  import type { AccentColor, DateFormat, Language, SidebarBehavior } from '../lib/stores/userPreferences.svelte';

  const getUserAvatar = () => {
    if (!authStore.user || !authStore.user.id || !authStore.user.avatar) {
      return 'https://cdn.discordapp.com/embed/avatars/0.png';
    }
    return `https://cdn.discordapp.com/avatars/${authStore.user.id}/${authStore.user.avatar}.png`;
  };

  let savedFeedback = $state(false);
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  function showSavedFeedback() {
    savedFeedback = true;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      savedFeedback = false;
    }, 2000);
  }

  function handleToggle<K extends keyof typeof userPrefs.prefs>(key: K, value: any) {
    userPrefs.set(key, value);
    if (key === 'theme') {
      themeStore.dark = value === 'dark';
    }
    showSavedFeedback();
  }

  const accentColors: { id: AccentColor; label: string; class: string; hex: string }[] = [
    { id: 'violet', label: 'Violet', class: 'bg-violet-500', hex: '#8b5cf6' },
    { id: 'blue',   label: 'Bleu',   class: 'bg-blue-500',   hex: '#3b82f6' },
    { id: 'green',  label: 'Vert',   class: 'bg-emerald-500',hex: '#10b981' },
    { id: 'rose',   label: 'Rose',   class: 'bg-rose-500',   hex: '#f43f5e' },
    { id: 'orange', label: 'Orange', class: 'bg-orange-500', hex: '#f97316' },
    { id: 'cyan',   label: 'Cyan',   class: 'bg-cyan-500',   hex: '#06b6d4' },
  ];

  const languages: { id: Language; label: string; flag: string }[] = [
    { id: 'fr', label: 'Français', flag: '🇫🇷' },
    { id: 'en', label: 'English',  flag: '🇬🇧' },
  ];

  const dateFormats: { id: DateFormat; label: string; example: string }[] = [
    { id: 'relative', label: 'Relative', example: 'il y a 3 jours' },
    { id: 'absolute', label: 'Absolue',  example: '28 mai 2026' },
    { id: 'both',     label: 'Les deux', example: 'il y a 3 jours (28 mai 2026)' },
  ];

  const sidebarBehaviors: { id: SidebarBehavior; label: string; desc: string }[] = [
    { id: 'auto',         label: 'Automatique',     desc: 'Se replie sur les petits écrans' },
    { id: 'always-open',  label: 'Toujours ouvert', desc: 'La sidebar reste toujours étendue' },
    { id: 'always-closed',label: 'Toujours replié', desc: 'La sidebar reste toujours réduite' },
  ];
</script>

<div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12">

  <!-- Hero Header -->
  <header class="relative overflow-hidden flex flex-col md:flex-row md:items-center gap-6 bg-surface-container-low/40 backdrop-blur-3xl p-8 rounded-4xl border border-outline-variant/30">
    <div class="absolute inset-0 pointer-events-none">
      <div class="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-primary/5 blur-3xl"></div>
      <div class="absolute -bottom-8 -left-8 w-40 h-40 rounded-full bg-secondary/5 blur-2xl"></div>
    </div>
    <div class="relative flex items-center gap-6 flex-1">
      <!-- Avatar -->
      <div class="relative shrink-0">
        <div class="absolute -inset-1 bg-linear-to-tr from-primary/40 to-secondary/40 rounded-2xl blur-lg opacity-60"></div>
        <div class="relative w-20 h-20 rounded-2xl border-2 border-white/30 shadow-xl overflow-hidden">
          <img src={getUserAvatar()} alt="Avatar" class="w-full h-full object-cover" />
        </div>
      </div>
      <div>
        <h1 class="text-3xl font-black tracking-tight leading-tight">Préférences Utilisateur</h1>
        <p class="text-on-surface-variant/70 font-medium mt-1">
          Personnalisez votre expérience sur le dashboard
          {#if authStore.user?.username}
            · <span class="text-primary font-bold">{authStore.user.username}</span>
          {/if}
        </p>
      </div>
    </div>

    <!-- Save feedback badge -->
    <div class="relative shrink-0">
      <div class="flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-sm transition-all duration-500 {savedFeedback ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400' : 'bg-surface-container-high/30 border border-outline-variant/20 text-on-surface-variant/50'}">
        {#if savedFeedback}
          <Papicon icon="check" size={16} />
          Sauvegardé automatiquement
        {:else}
          <Papicon icon="Gears" size={16} />
          Sauvegarde automatique
        {/if}
      </div>
    </div>
  </header>

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">

    <!-- ─── Apparence ─────────────────────────────────────────── -->
    <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-[2.5rem] space-y-8">
      <h2 class="text-xl font-black flex items-center gap-3">
        <div class="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
          <Papicon icon="Palette" size={16} class="text-primary" />
        </div>
        Apparence
      </h2>

      <!-- Theme Toggle -->
      <div class="space-y-3">
        <p class="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest">Thème</p>
        <div class="grid grid-cols-2 gap-3">
          {#each [{ id: 'dark', label: 'Sombre', icon: 'moon' }, { id: 'light', label: 'Clair', icon: 'sun' }] as opt}
            <button
              onclick={() => handleToggle('theme', opt.id as any)}
              class="flex flex-col items-center gap-2.5 p-5 rounded-2xl border-2 transition-all duration-300 font-bold text-sm
                {userPrefs.prefs.theme === opt.id
                  ? 'border-primary bg-primary/10 text-primary shadow-sm shadow-primary/20'
                  : 'border-outline-variant/20 bg-surface-container-high/20 text-on-surface-variant hover:border-primary/40 hover:bg-primary/5'}"
            >
              <Papicon icon={opt.icon} size={22} />
              {opt.label}
            </button>
          {/each}
        </div>
      </div>

      <!-- Accent Color -->
      <div class="space-y-3">
        <p class="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest">Couleur d'accentuation</p>
        <div class="flex flex-wrap gap-3">
          {#each accentColors as color}
            <button
              onclick={() => handleToggle('accentColor', color.id)}
              title={color.label}
              class="relative w-10 h-10 rounded-xl transition-all duration-200 hover:scale-110 {userPrefs.prefs.accentColor === color.id ? 'ring-2 ring-offset-2 ring-offset-surface-container-low scale-110' : ''}"
              style="background-color: {color.hex}; {userPrefs.prefs.accentColor === color.id ? `--tw-ring-color: ${color.hex}` : ''}"
            >
              {#if userPrefs.prefs.accentColor === color.id}
                <div class="absolute inset-0 flex items-center justify-center">
                  <Papicon icon="check" size={16} class="text-white" />
                </div>
              {/if}
            </button>
          {/each}
        </div>
        <p class="text-[10px] text-on-surface-variant/40">Couleur principale de l'interface <span class="italic">(bientôt disponible)</span></p>
      </div>

      <!-- Compact Mode -->
      <div class="flex items-center justify-between p-4 rounded-2xl bg-surface-container-high/20 border border-outline-variant/5 hover:bg-surface-container-high/40 transition-colors">
        <div>
          <p class="text-sm font-bold">Mode compact</p>
          <p class="text-[10px] text-on-surface-variant/50">Réduit les marges et espacements</p>
        </div>
        <ToggleSwitch
          checked={userPrefs.prefs.compactMode}
          onToggle={(v: boolean) => handleToggle('compactMode', v)}
        />
      </div>

      <!-- Animations -->
      <div class="flex items-center justify-between p-4 rounded-2xl bg-surface-container-high/20 border border-outline-variant/5 hover:bg-surface-container-high/40 transition-colors">
        <div>
          <p class="text-sm font-bold">Animations de l'interface</p>
          <p class="text-[10px] text-on-surface-variant/50">Transitions et micro-animations</p>
        </div>
        <ToggleSwitch
          checked={userPrefs.prefs.animationsEnabled}
          onToggle={(v: boolean) => handleToggle('animationsEnabled', v)}
        />
      </div>
    </section>

    <!-- ─── Langue & Dates ────────────────────────────────────── -->
    <div class="space-y-8">
      <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-[2.5rem] space-y-8">
        <h2 class="text-xl font-black flex items-center gap-3">
          <div class="w-8 h-8 rounded-xl bg-secondary/10 flex items-center justify-center">
            <Papicon icon="Globe" size={16} class="text-secondary" />
          </div>
          Langue &amp; Région
        </h2>

        <!-- Language -->
        <div class="space-y-3">
          <p class="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest">Langue de l'interface</p>
          <div class="grid grid-cols-2 gap-3">
            {#each languages as lang}
              <button
                onclick={() => handleToggle('language', lang.id)}
                class="flex items-center gap-3 p-4 rounded-2xl border-2 transition-all duration-200 font-bold text-sm
                  {userPrefs.prefs.language === lang.id
                    ? 'border-secondary bg-secondary/10 text-secondary'
                    : 'border-outline-variant/20 bg-surface-container-high/20 text-on-surface-variant hover:border-secondary/40'}"
              >
                <span class="text-xl">{lang.flag}</span>
                {lang.label}
                {#if lang.id === 'en'}
                  <span class="ml-auto text-[9px] text-on-surface-variant/40 italic font-medium">bientôt</span>
                {/if}
              </button>
            {/each}
          </div>
        </div>

        <!-- Date format -->
        <div class="space-y-3">
          <p class="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest">Format des dates</p>
          <div class="space-y-2">
            {#each dateFormats as fmt}
              <button
                onclick={() => handleToggle('dateFormat', fmt.id)}
                class="w-full flex items-center gap-4 p-3.5 rounded-xl border transition-all duration-200 text-left
                  {userPrefs.prefs.dateFormat === fmt.id
                    ? 'border-secondary/40 bg-secondary/8 text-on-surface'
                    : 'border-outline-variant/10 bg-surface-container-high/10 text-on-surface-variant hover:border-secondary/20'}"
              >
                <div class="w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center
                  {userPrefs.prefs.dateFormat === fmt.id ? 'border-secondary' : 'border-outline-variant/40'}">
                  {#if userPrefs.prefs.dateFormat === fmt.id}
                    <div class="w-2 h-2 rounded-full bg-secondary"></div>
                  {/if}
                </div>
                <div>
                  <p class="text-sm font-bold">{fmt.label}</p>
                  <p class="text-[10px] text-on-surface-variant/50">{fmt.example}</p>
                </div>
              </button>
            {/each}
          </div>
        </div>
      </section>
    </div>

    <!-- ─── Sidebar ───────────────────────────────────────────── -->
    <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-[2.5rem] space-y-8">
      <h2 class="text-xl font-black flex items-center gap-3">
        <div class="w-8 h-8 rounded-xl bg-tertiary/10 flex items-center justify-center">
          <Papicon icon="Menu" size={16} class="text-tertiary" />
        </div>
        Navigation
      </h2>

      <!-- Sidebar behavior -->
      <div class="space-y-3">
        <p class="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest">Comportement de la sidebar</p>
        <div class="space-y-2">
          {#each sidebarBehaviors as behavior}
            <button
              onclick={() => handleToggle('sidebarBehavior', behavior.id)}
              class="w-full flex items-center gap-4 p-3.5 rounded-xl border transition-all duration-200 text-left
                {userPrefs.prefs.sidebarBehavior === behavior.id
                  ? 'border-tertiary/40 bg-tertiary/8 text-on-surface'
                  : 'border-outline-variant/10 bg-surface-container-high/10 text-on-surface-variant hover:border-tertiary/20'}"
            >
              <div class="w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center
                {userPrefs.prefs.sidebarBehavior === behavior.id ? 'border-tertiary' : 'border-outline-variant/40'}">
                {#if userPrefs.prefs.sidebarBehavior === behavior.id}
                  <div class="w-2 h-2 rounded-full bg-tertiary"></div>
                {/if}
              </div>
              <div>
                <p class="text-sm font-bold">{behavior.label}</p>
                <p class="text-[10px] text-on-surface-variant/50">{behavior.desc}</p>
              </div>
            </button>
          {/each}
        </div>
      </div>
    </section>

    <!-- ─── Notifications & Confidentialité ──────────────────── -->
    <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-[2.5rem] space-y-8">
      <h2 class="text-xl font-black flex items-center gap-3">
        <div class="w-8 h-8 rounded-xl bg-rose-500/10 flex items-center justify-center">
          <Papicon icon="Bell" size={16} class="text-rose-500" />
        </div>
        Notifications &amp; Confidentialité
      </h2>

      <div class="space-y-3">
        {#each [
          { key: 'soundNotifications', label: 'Sons de notification', desc: 'Jouer un son lors des notifications', color: 'rose' },
          { key: 'desktopNotifications', label: 'Notifications Bureau', desc: 'Notifications système du navigateur', color: 'rose' },
          { key: 'showOnlineStatus', label: 'Afficher mon statut en ligne', desc: 'Visible par les autres membres du staff', color: 'rose' },
        ] as item}
          <div class="flex items-center justify-between p-4 rounded-2xl bg-surface-container-high/20 border border-outline-variant/5 hover:bg-surface-container-high/40 transition-colors">
            <div>
              <p class="text-sm font-bold">{item.label}</p>
              <p class="text-[10px] text-on-surface-variant/50">{item.desc}</p>
            </div>
            <ToggleSwitch
              checked={(userPrefs.prefs as any)[item.key]}
              onToggle={(v: boolean) => handleToggle(item.key as any, v)}
            />
          </div>
        {/each}
      </div>
    </section>
  </div>

  <!-- ─── Danger Zone ───────────────────────────────────────────── -->
  <section class="bg-rose-500/5 border border-rose-500/20 p-8 rounded-[2.5rem] space-y-4">
    <h2 class="text-xl font-black text-rose-500 flex items-center gap-3">
      <Papicon icon="AlertTriangle" size={20} />
      Zone de réinitialisation
    </h2>
    <p class="text-sm text-on-surface-variant/70">
      Réinitialise toutes vos préférences utilisateur aux valeurs par défaut. Cette action ne supprime pas vos données.
    </p>
    <button
      onclick={() => { userPrefs.reset(); showSavedFeedback(); }}
      class="px-6 py-2.5 rounded-xl border-2 border-rose-500/40 text-rose-500 font-bold text-sm hover:bg-rose-500/10 transition-all duration-200 hover:border-rose-500/60"
    >
      Réinitialiser les préférences
    </button>
  </section>
</div>
