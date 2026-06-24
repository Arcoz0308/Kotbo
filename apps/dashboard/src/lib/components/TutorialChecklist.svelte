<script lang="ts">
  import { onboardingStore, checklistTasks } from '../stores/tutorial.svelte';
  import { fly, fade, scale } from 'svelte/transition';
  import { cubicOut, backOut } from 'svelte/easing';
  import { router } from 'tinro';
  import {
    CheckCircle, Circle, ChevronDown, ChevronUp, X, Sparkles, Rocket,
    LayoutGrid, Package, Users, Shield, Trophy, UserCheck, Settings, Keyboard,
    PartyPopper,
  } from 'lucide-svelte';

  const iconMap: Record<string, typeof LayoutGrid> = {
    'layout-grid': LayoutGrid,
    'package': Package,
    'users': Users,
    'shield': Shield,
    'trophy': Trophy,
    'user-check': UserCheck,
    'settings': Settings,
    'keyboard': Keyboard,
  };

  let show = $derived(
    onboardingStore.initialized
    && !onboardingStore.checklistDismissed
    && onboardingStore.welcomeSeen
  );

  let minimized = $derived(onboardingStore.checklistMinimized);
  let completedCount = $derived(onboardingStore.completedCount);
  let totalTasks = $derived(onboardingStore.totalTasks);
  let progress = $derived(onboardingStore.progress);
  let allDone = $derived(onboardingStore.allCompleted);

  let showConfetti = $state(false);
  let prevCompleted = $state(0);

  $effect(() => {
    if (completedCount > prevCompleted && completedCount === totalTasks) {
      showConfetti = true;
      setTimeout(() => (showConfetti = false), 3000);
    }
    prevCompleted = completedCount;
  });

  function navigateTo(route: string) {
    router.goto(route);
  }

  function toggleMinimize() {
    onboardingStore.toggleChecklist();
  }

  function dismiss() {
    onboardingStore.dismissChecklist();
  }
</script>

{#if show}
  <div
    class="fixed bottom-6 right-6 z-[9990] flex flex-col items-end"
    transition:fly={{ y: 30, duration: 350, easing: cubicOut }}
  >
    {#if !minimized}
      <!-- Expanded panel -->
      <div
        class="w-80 bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-xl overflow-hidden"
        transition:scale={{ duration: 250, easing: backOut, start: 0.92 }}
      >
        <!-- Header -->
        <div class="bg-gradient-to-r from-primary/8 to-secondary/8 border-b border-outline-variant">
          <div class="flex items-center justify-between px-4 pt-4 pb-2">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
                {#if allDone}
                  <PartyPopper class="w-4 h-4 text-primary" />
                {:else}
                  <Rocket class="w-4 h-4 text-primary" />
                {/if}
              </div>
              <div>
                <h3 class="text-sm font-semibold text-on-surface leading-none">
                  {#if allDone}
                    Bien joué !
                  {:else}
                    Premiers pas
                  {/if}
                </h3>
                <p class="text-[11px] text-on-surface-variant mt-0.5">
                  {completedCount} / {totalTasks} terminé{completedCount > 1 ? 's' : ''}
                </p>
              </div>
            </div>

            <div class="flex items-center gap-1">
              <button
                onclick={toggleMinimize}
                class="p-1.5 rounded-lg hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors"
                aria-label="Réduire"
              >
                <ChevronDown class="w-4 h-4" />
              </button>
              <button
                onclick={dismiss}
                class="p-1.5 rounded-lg hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors"
                aria-label="Fermer définitivement"
              >
                <X class="w-4 h-4" />
              </button>
            </div>
          </div>

          <!-- Progress bar -->
          <div class="px-4 pb-3">
            <div class="h-1.5 bg-surface-container-high rounded-full overflow-hidden">
              <div
                class="h-full bg-gradient-to-r from-primary to-secondary rounded-full transition-all duration-700 ease-out"
                style="width: {progress}%"
              ></div>
            </div>
          </div>
        </div>

        <!-- Task list -->
        <div class="max-h-72 overflow-y-auto overscroll-contain p-2">
          {#if allDone}
            <div
              class="p-4 text-center"
              in:fly={{ y: 10, duration: 300, easing: cubicOut }}
            >
              <div class="w-14 h-14 mx-auto mb-3 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                <PartyPopper class="w-7 h-7 text-emerald-500" />
              </div>
              <p class="text-sm font-semibold text-on-surface mb-1">Tutoriel terminé !</p>
              <p class="text-xs text-on-surface-variant mb-4">Vous maîtrisez les bases de Kotbo. Explorez le reste à votre rythme.</p>
              <button
                onclick={dismiss}
                class="px-4 py-2 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/15 transition-colors"
              >
                Fermer le guide
              </button>
            </div>
          {:else}
            {#each checklistTasks as task, i (task.id)}
              {@const completed = onboardingStore.isTaskCompleted(task.id)}
              {@const Icon = iconMap[task.icon] || Sparkles}
              <button
                type="button"
                onclick={() => {
                  if (task.route && !completed) navigateTo(task.route);
                }}
                class="
                  w-full flex items-start gap-3 p-2.5 rounded-xl text-left
                  transition-all duration-150 group
                  {completed
                    ? 'opacity-60'
                    : 'hover:bg-surface-container cursor-pointer'}
                "
                disabled={completed && !task.route}
              >
                <!-- Check circle -->
                <div class="mt-0.5 shrink-0">
                  {#if completed}
                    <div
                      class="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center"
                      in:scale={{ duration: 300, easing: backOut, start: 0.5 }}
                    >
                      <CheckCircle class="w-3.5 h-3.5 text-white" />
                    </div>
                  {:else}
                    <div class="w-5 h-5 rounded-full border-2 border-outline-variant group-hover:border-primary transition-colors flex items-center justify-center">
                      <Circle class="w-3 h-3 text-transparent" />
                    </div>
                  {/if}
                </div>

                <!-- Content -->
                <div class="flex-1 min-w-0">
                  <p class="text-[13px] font-medium text-on-surface leading-tight {completed ? 'line-through text-on-surface-variant' : ''}">
                    {task.title}
                  </p>
                  <p class="text-[11px] text-on-surface-variant/70 mt-0.5 leading-relaxed">
                    {task.description}
                  </p>
                </div>

                <!-- Icon -->
                <div class="shrink-0 mt-0.5">
                  <div class="w-7 h-7 rounded-lg {completed ? 'bg-surface-container' : 'bg-primary/8 group-hover:bg-primary/12'} flex items-center justify-center transition-colors">
                    <Icon class="w-3.5 h-3.5 {completed ? 'text-on-surface-variant/50' : 'text-primary'}" />
                  </div>
                </div>
              </button>
            {/each}
          {/if}
        </div>
      </div>

    {:else}
      <!-- Minimized FAB -->
      <button
        onclick={toggleMinimize}
        class="
          group flex items-center gap-2.5 px-4 py-2.5 rounded-2xl
          bg-surface-container-lowest border border-outline-variant
          shadow-lg hover:shadow-xl
          transition-all duration-200
          hover:border-primary/30
        "
        transition:scale={{ duration: 250, easing: backOut, start: 0.85 }}
        aria-label="Ouvrir le guide de démarrage"
      >
        <div class="relative">
          <div class="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/15 transition-colors">
            <Rocket class="w-4 h-4 text-primary" />
          </div>
          {#if !allDone}
            <div class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-[9px] text-on-primary font-bold flex items-center justify-center">
              {totalTasks - completedCount}
            </div>
          {/if}
        </div>

        <div class="hidden sm:block text-left">
          <p class="text-xs font-semibold text-on-surface leading-none">Premiers pas</p>
          <div class="flex items-center gap-2 mt-1">
            <div class="w-16 h-1 bg-surface-container-high rounded-full overflow-hidden">
              <div
                class="h-full bg-gradient-to-r from-primary to-secondary rounded-full transition-all duration-500"
                style="width: {progress}%"
              ></div>
            </div>
            <span class="text-[10px] text-on-surface-variant">{progress}%</span>
          </div>
        </div>

        <ChevronUp class="w-3.5 h-3.5 text-on-surface-variant/50 group-hover:text-on-surface-variant transition-colors" />
      </button>
    {/if}
  </div>
{/if}

<style>
  .overscroll-contain {
    overscroll-behavior: contain;
  }
</style>
