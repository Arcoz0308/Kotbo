<script lang="ts">
  import { tutorialStore, tutorialSteps, type TutorialStep } from '../stores/tutorial.svelte';
  import { router } from 'tinro';
  import { onMount } from 'svelte';
  import { ArrowLeft, ArrowRight, X, Check, RotateCcw, Sparkles, ChevronRight, Layout, LayoutGrid, Package, Users, Shield, Gavel, Trophy, Coins, Settings, Keyboard, CheckCircle } from 'lucide-svelte';
  import Papicon from './Papicon.svelte';

  let currentStep = $derived(tutorialStore.currentStep);
  let completed = $derived(tutorialStore.completed);
  let dismissed = $derived(tutorialStore.dismissed);
  let step = $derived(tutorialSteps[currentStep]);

  let show = $derived(!dismissed && !completed);
  let targetElement: HTMLElement | null = null;
  let highlightPosition = $state<{ top: number; left: number; width: number; height: number } | null>(null);

  const iconMap: Record<string, any> = {
    sparkles: Sparkles,
    layout: Layout,
    'layout-grid': LayoutGrid,
    package: Package,
    users: Users,
    shield: Shield,
    gavel: Gavel,
    trophy: Trophy,
    coins: Coins,
    settings: Settings,
    keyboard: Keyboard,
    'check-circle': CheckCircle,
  };

  const currentIcon = $derived(step?.icon ? iconMap[step.icon] : Sparkles);

  onMount(() => {
    if (step?.target && !step.target.startsWith('/')) {
      setTimeout(() => {
        const element = document.querySelector(step.target!) as HTMLElement;
        if (element) {
          targetElement = element;
          updateHighlightPosition();
        }
      }, 100);
    }
  });

  function updateHighlightPosition() {
    if (!targetElement) return;
    
    const rect = targetElement.getBoundingClientRect();
    highlightPosition = {
      top: rect.top + window.scrollY,
      left: rect.left + window.scrollX,
      width: rect.width,
      height: rect.height,
    };
  }

  function nextStep() {
    if (step?.target && step.target.startsWith('/')) {
      router.goto(step.target);
    }
    tutorialStore.nextStep();
    
    targetElement = null;
    highlightPosition = null;
    
    const nextStepIndex = currentStep + 1;
    if (nextStepIndex < tutorialSteps.length) {
      const nextStepData = tutorialSteps[nextStepIndex];
      if (nextStepData?.target && !nextStepData.target.startsWith('/')) {
        setTimeout(() => {
          const element = document.querySelector(nextStepData.target!) as HTMLElement;
          if (element) {
            targetElement = element;
            updateHighlightPosition();
          }
        }, 300);
      }
    }
  }

  function prevStep() {
    tutorialStore.prevStep();
    targetElement = null;
    highlightPosition = null;
  }

  function dismiss() {
    tutorialStore.dismiss();
    show = false;
  }

  function restart() {
    tutorialStore.reset();
    show = true;
  }

  function skip() {
    tutorialStore.dismiss();
    show = false;
  }
</script>

{#if show}
  <div class="fixed inset-0 z-[9999] pointer-events-none">
    <!-- Backdrop -->
    <div class="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300"></div>
    
    <!-- Highlight overlay -->
    {#if highlightPosition}
      <div
        class="absolute bg-primary/30 border-2 border-primary rounded-xl transition-all duration-300 shadow-lg shadow-primary/50"
        style="top: {highlightPosition.top}px; left: {highlightPosition.left}px; width: {highlightPosition.width}px; height: {highlightPosition.height}px;"
      ></div>
    {/if}

    <!-- Tutorial card -->
    <div class="fixed inset-0 flex items-center justify-center p-4">
      <div class="bg-surface border border-outline/50 rounded-3xl shadow-2xl max-w-xl w-full pointer-events-auto animate-in fade-in zoom-in duration-300 overflow-hidden">
        <!-- Gradient header -->
        <div class="bg-gradient-to-r from-primary/20 to-secondary/20 p-6 border-b border-outline/30">
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <div class="flex items-center gap-3 mb-3">
                <div class="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                  {#if step?.icon === 'sparkles'}
                    <Sparkles class="w-5 h-5 text-primary" />
                  {:else if step?.icon === 'layout'}
                    <Layout class="w-5 h-5 text-primary" />
                  {:else if step?.icon === 'layout-grid'}
                    <LayoutGrid class="w-5 h-5 text-primary" />
                  {:else if step?.icon === 'package'}
                    <Package class="w-5 h-5 text-primary" />
                  {:else if step?.icon === 'users'}
                    <Users class="w-5 h-5 text-primary" />
                  {:else if step?.icon === 'shield'}
                    <Shield class="w-5 h-5 text-primary" />
                  {:else if step?.icon === 'gavel'}
                    <Gavel class="w-5 h-5 text-primary" />
                  {:else if step?.icon === 'trophy'}
                    <Trophy class="w-5 h-5 text-primary" />
                  {:else if step?.icon === 'coins'}
                    <Coins class="w-5 h-5 text-primary" />
                  {:else if step?.icon === 'settings'}
                    <Settings class="w-5 h-5 text-primary" />
                  {:else if step?.icon === 'keyboard'}
                    <Keyboard class="w-5 h-5 text-primary" />
                  {:else if step?.icon === 'check-circle'}
                    <CheckCircle class="w-5 h-5 text-primary" />
                  {:else}
                    <Sparkles class="w-5 h-5 text-primary" />
                  {/if}
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-bold px-2.5 py-1 rounded-full bg-primary/20 text-primary border border-primary/30">
                      Étape {currentStep + 1} / {tutorialSteps.length}
                    </span>
                    {#if completed}
                      <span class="text-xs font-bold px-2.5 py-1 rounded-full bg-green-500/20 text-green-500 border border-green-500/30 flex items-center gap-1">
                        <Check class="w-3 h-3" />
                        Terminé
                      </span>
                    {/if}
                  </div>
                </div>
              </div>
              <h2 class="text-2xl font-bold text-on-surface">{step?.title}</h2>
            </div>
            <button
              onclick={dismiss}
              class="p-2 hover:bg-surface-container/80 rounded-xl transition-all duration-200 text-on-surface-variant hover:text-on-surface hover:rotate-90"
              aria-label="Fermer"
            >
              <X class="w-5 h-5" />
            </button>
          </div>
        </div>

        <!-- Content -->
        <div class="p-6">
          <p class="text-on-surface-variant/90 leading-relaxed mb-4 text-base">{step?.description}</p>
          {#if step?.action}
            <div class="bg-gradient-to-r from-primary/10 to-secondary/10 rounded-xl p-4 border border-primary/20">
              <div class="flex items-start gap-3">
                <div class="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                  <ChevronRight class="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p class="text-sm font-semibold text-primary mb-1">Action recommandée</p>
                  <p class="text-sm text-on-surface-variant/80">{step.action}</p>
                </div>
              </div>
            </div>
          {/if}
        </div>

        <!-- Footer -->
        <div class="p-6 border-t border-outline/30 bg-surface-container/30">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <button
                onclick={prevStep}
                disabled={currentStep === 0}
                class="flex items-center gap-2 px-4 py-2.5 rounded-xl hover:bg-surface-container/80 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent text-on-surface font-medium"
              >
                <ArrowLeft class="w-4 h-4" />
                Précédent
              </button>
              
              <button
                onclick={skip}
                class="text-sm font-medium text-on-surface-variant/70 hover:text-on-surface-variant transition-colors px-3 py-2"
              >
                Passer
              </button>
            </div>

            <div class="flex items-center gap-3">
              {#if completed}
                <button
                  onclick={restart}
                  class="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary to-secondary text-on-primary hover:opacity-90 transition-all duration-200 font-medium shadow-lg shadow-primary/25"
                >
                  <RotateCcw class="w-4 h-4" />
                  Recommencer
                </button>
              {:else}
              <button
                onclick={nextStep}
                class="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary to-secondary text-on-primary hover:opacity-90 transition-all duration-200 font-medium shadow-lg shadow-primary/25"
              >
                {currentStep === tutorialSteps.length - 1 ? 'Terminer' : 'Suivant'}
                <ArrowRight class="w-4 h-4" />
              </button>
            {/if}
            </div>
          </div>
        </div>

        <!-- Progress bar -->
        <div class="h-1.5 bg-surface-container/50">
          <div
            class="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-500 ease-out"
            style="width: {((currentStep + 1) / tutorialSteps.length) * 100}%"
          ></div>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes zoom-in {
    from {
      transform: scale(0.92);
    }
    to {
      transform: scale(1);
    }
  }

  .animate-in {
    animation: fade-in 0.4s ease-out, zoom-in 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  }
</style>
