<script lang="ts">
  import { onboardingStore } from '../stores/tutorial.svelte';
  import { fade, fly, scale } from 'svelte/transition';
  import { cubicOut, backOut } from 'svelte/easing';
  import { Sparkles, ArrowRight, Rocket, Zap, Shield, LayoutGrid } from 'lucide-svelte';

  let show = $derived(onboardingStore.showWelcome);
  let step = $state(0);

  const features = [
    {
      icon: LayoutGrid,
      title: 'Dashboard complet',
      description: 'Gérez votre serveur depuis une interface moderne et intuitive.',
    },
    {
      icon: Shield,
      title: 'Modération avancée',
      description: 'Sanctions, AutoMod, logs et détection de doubles comptes.',
    },
    {
      icon: Zap,
      title: 'Communauté vivante',
      description: 'Leveling, économie, giveaways, et bien plus encore.',
    },
  ];

  function getStarted() {
    onboardingStore.dismissWelcome();
  }
</script>

{#if show}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-[10000] flex items-center justify-center p-4"
    transition:fade={{ duration: 200 }}
  >
    <div
      class="absolute inset-0 bg-black/60 backdrop-blur-sm"
      onclick={getStarted}
      role="presentation"
    ></div>

    <!-- Modal -->
    <div
      class="relative w-full max-w-lg bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-2xl overflow-hidden"
      transition:scale={{ duration: 400, easing: backOut, start: 0.9 }}
    >
      <!-- Gradient accent top -->
      <div class="h-1 bg-gradient-to-r from-primary via-secondary to-tertiary"></div>

      {#if step === 0}
        <!-- Step 1: Welcome -->
        <div
          class="p-8 text-center"
          in:fly={{ y: 20, duration: 300, delay: 100, easing: cubicOut }}
        >
          <!-- Animated icon -->
          <div class="relative mx-auto w-20 h-20 mb-6">
            <div class="absolute inset-0 bg-primary/10 rounded-2xl rotate-6 animate-pulse"></div>
            <div class="relative w-full h-full bg-gradient-to-br from-primary to-secondary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20">
              <Rocket class="w-10 h-10 text-on-primary" />
            </div>
          </div>

          <h1 class="text-2xl font-bold text-on-surface mb-2 tracking-tight">
            Bienvenue sur Kotbo
          </h1>
          <p class="text-on-surface-variant text-sm leading-relaxed max-w-sm mx-auto mb-8">
            Votre serveur Discord vient d'être connecté. Découvrez tout ce que vous pouvez accomplir avec le dashboard.
          </p>

          <!-- Feature cards -->
          <div class="space-y-3 mb-8">
            {#each features as feature, i}
              <div
                class="flex items-center gap-4 p-3 rounded-xl bg-surface-container border border-outline-variant text-left group hover:border-primary/30 transition-colors"
                in:fly={{ y: 15, duration: 250, delay: 200 + i * 80, easing: cubicOut }}
              >
                <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/15 transition-colors">
                  <feature.icon class="w-5 h-5 text-primary" />
                </div>
                <div class="min-w-0">
                  <p class="text-sm font-semibold text-on-surface">{feature.title}</p>
                  <p class="text-xs text-on-surface-variant leading-relaxed">{feature.description}</p>
                </div>
              </div>
            {/each}
          </div>

          <button
            onclick={() => (step = 1)}
            class="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-primary to-secondary text-on-primary font-semibold text-sm hover:opacity-90 transition-opacity shadow-lg shadow-primary/20"
          >
            Continuer
            <ArrowRight class="w-4 h-4" />
          </button>
        </div>

      {:else}
        <!-- Step 2: Guide overview -->
        <div
          class="p-8 text-center"
          in:fly={{ x: 30, duration: 300, easing: cubicOut }}
        >
          <div class="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
            <Sparkles class="w-8 h-8 text-primary" />
          </div>

          <h2 class="text-xl font-bold text-on-surface mb-2 tracking-tight">
            On vous guide pas à pas
          </h2>
          <p class="text-on-surface-variant text-sm leading-relaxed max-w-sm mx-auto mb-6">
            En explorant le dashboard, vous verrez apparaître des guides contextuels sur chaque page. Un panneau de progression vous accompagnera tout au long de la découverte.
          </p>

          <!-- Visual checklist preview -->
          <div class="bg-surface-container rounded-xl border border-outline-variant p-4 mb-8 text-left">
            <div class="flex items-center gap-2 mb-3">
              <div class="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center">
                <Sparkles class="w-3 h-3 text-primary" />
              </div>
              <span class="text-xs font-semibold text-on-surface">Votre progression</span>
              <span class="ml-auto text-xs text-on-surface-variant">0 / {onboardingStore.totalTasks}</span>
            </div>
            <div class="h-1.5 bg-surface-container-high rounded-full overflow-hidden mb-3">
              <div class="h-full w-0 bg-gradient-to-r from-primary to-secondary rounded-full"></div>
            </div>
            <div class="space-y-2">
              {#each [
                { text: 'Découvrir le dashboard', done: false },
                { text: 'Configurer les modules', done: false },
                { text: 'Consulter les membres', done: false },
              ] as item}
                <div class="flex items-center gap-2.5">
                  <div class="w-4 h-4 rounded-full border-2 border-outline-variant shrink-0"></div>
                  <span class="text-xs text-on-surface-variant">{item.text}</span>
                </div>
              {/each}
              <div class="flex items-center gap-2.5 text-on-surface-variant/40">
                <span class="text-xs ml-6.5">+ {onboardingStore.totalTasks - 3} étapes...</span>
              </div>
            </div>
          </div>

          <div class="flex gap-3">
            <button
              onclick={getStarted}
              class="flex-1 px-6 py-3 rounded-xl border border-outline-variant text-on-surface-variant font-medium text-sm hover:bg-surface-container transition-colors"
            >
              Passer
            </button>
            <button
              onclick={getStarted}
              class="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-primary to-secondary text-on-primary font-semibold text-sm hover:opacity-90 transition-opacity shadow-lg shadow-primary/20"
            >
              C'est parti !
              <Rocket class="w-4 h-4" />
            </button>
          </div>
        </div>
      {/if}

      <!-- Step indicator -->
      <div class="flex justify-center gap-2 pb-6">
        <button
          onclick={() => (step = 0)}
          class="w-2 h-2 rounded-full transition-all duration-300 {step === 0 ? 'w-6 bg-primary' : 'bg-outline-variant hover:bg-outline'}"
          aria-label="Étape 1"
        ></button>
        <button
          onclick={() => (step = 1)}
          class="w-2 h-2 rounded-full transition-all duration-300 {step === 1 ? 'w-6 bg-primary' : 'bg-outline-variant hover:bg-outline'}"
          aria-label="Étape 2"
        ></button>
      </div>
    </div>
  </div>
{/if}
