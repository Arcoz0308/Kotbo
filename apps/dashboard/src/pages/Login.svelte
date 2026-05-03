<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import { API_BASE_URL } from '../lib/api';
  import { router } from 'tinro';
  import Papicon from '../lib/components/Papicon.svelte';

  let errorMessage = $state(null);
  const oauthLoginUrl = `${API_BASE_URL || ''}/api/auth/discord/login`;

  async function hydrateOAuthConfig() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/config`, {
        headers: { Accept: 'application/json' }
      });
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        errorMessage = API_BASE_URL
          ? `Configuration API invalide: ${API_BASE_URL}/api/config ne renvoie pas du JSON.`
          : 'Configuration API invalide: /api/config renvoie du HTML. Configurez VITE_API_URL vers votre backend.';
        return;
      }

      const data = await response.json() as { discordClientId?: string; error?: string; missing?: string[] };

      if (!response.ok) {
        if (data?.missing?.length) {
          errorMessage = `Configuration OAuth invalide côté serveur: ${data.missing.join(', ')}`;
        } else if (data?.error) {
          errorMessage = data.error;
        }
        return;
      }
    } catch {
      errorMessage = API_BASE_URL
        ? `Impossible de joindre l'API de configuration: ${API_BASE_URL}/api/config`
        : 'Impossible de joindre /api/config. Configurez VITE_API_URL vers le backend.';
    }
  }

  const loginWithDiscord = async () => {
    await hydrateOAuthConfig();

    if (errorMessage) {
      return;
    }

    window.location.href = oauthLoginUrl;
  };

  onMount(async () => {
    await hydrateOAuthConfig();

    if (authStore.isAuthenticated) {
      router.goto('/');
    }

    const urlParams = new URLSearchParams(window.location.search);
    const errorParam = urlParams.get('error');
    if (errorParam) {
      if (errorParam === 'auth_failed') {
        errorMessage = "Échec de l'authentification avec Discord. Veuillez réessayer.";
      } else if (errorParam === 'no_code') {
        errorMessage = "Le code d'autorisation Discord est manquant.";
      } else {
        errorMessage = "Une erreur inattendue est survenue lors de la connexion.";
      }
      
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  });

  const year = new Date().getFullYear();
</script>

<div class="relative min-h-screen w-full overflow-hidden bg-[#020617] text-slate-100 selection:bg-primary/30 selection:text-white flex flex-col font-body">
  
  <!-- Background Mesh & FX -->
  <div class="absolute inset-0 z-0 overflow-hidden pointer-events-none">
    <div class="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] bg-primary/20 rounded-full blur-[120px] animate-mesh opacity-50"></div>
    <div class="absolute top-[20%] -right-[10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[100px] animate-mesh opacity-30" style="animation-delay: -5s"></div>
    <div class="absolute -bottom-[10%] left-[20%] w-[45%] h-[45%] bg-indigo-500/15 rounded-full blur-[110px] animate-mesh opacity-40" style="animation-delay: -10s"></div>
    
    <!-- Pattern Overlay -->
    <div class="absolute inset-0 opacity-[0.03]" style="background-image: radial-gradient(#fff 1px, transparent 1px); background-size: 40px 40px;"></div>
    <div class="absolute inset-0 bg-gradient-to-b from-transparent via-[#020617]/50 to-[#020617]"></div>
  </div>

  <!-- Header -->
  <header class="relative z-20 w-full px-8 py-8 max-w-7xl mx-auto">
    <nav class="flex justify-between items-center">
      <div class="flex items-center gap-4">
        <div class="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20 backdrop-blur-md">
          <img src="/favicon.svg" alt="Kotbo" class="w-6 h-6" />
        </div>
        <span class="text-xl font-black tracking-tighter font-headline uppercase text-white/90">
          Kotbo<span class="text-primary">.io</span>
        </span>
      </div>
      
      <div class="hidden md:flex items-center gap-6">
        <div class="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md">
          <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span class="text-[10px] font-black uppercase tracking-widest text-emerald-400">Core v4.2 Status: Online</span>
        </div>
      </div>
    </nav>
  </header>

  <!-- Main Content -->
  <main class="relative z-10 flex-grow flex items-center justify-center px-6 py-12">
    <div class="w-full max-w-[540px] animate-in fade-in slide-in-from-bottom-8 duration-1000">
      
      <!-- Premium Glass Card -->
      <div class="relative group">
        <!-- Glow effect -->
        <div class="absolute -inset-1 bg-gradient-to-r from-primary/50 to-blue-600/50 rounded-[3.2rem] blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
        
        <div class="relative bg-slate-900/40 backdrop-blur-3xl rounded-[3rem] border border-white/10 p-10 md:p-16 shadow-2xl overflow-hidden">
          
          <!-- Content Staggered -->
          <div class="flex flex-col items-center text-center mb-12">
            <div class="relative mb-10">
              <div class="absolute inset-0 bg-primary/20 blur-3xl rounded-full scale-150 animate-pulse"></div>
              <div class="relative w-32 h-32 flex items-center justify-center group-hover:scale-105 transition-transform duration-700">
                <img src="/favicon.svg" alt="Kotbo Logo" class="w-full h-full object-contain drop-shadow-[0_0_30px_rgba(51,69,87,0.5)]" />
              </div>
            </div>
            
            <div class="space-y-4">
              <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
                 <Papicon icon="chartlineup" size={14} class="text-primary" />
                 <span class="text-[9px] font-black uppercase tracking-[0.2em] text-primary">Intelligence & Control</span>
              </div>
              <h1 class="font-headline text-4xl md:text-5xl font-black tracking-tighter text-white leading-[0.95]">
                Pilotez votre <br/><span class="text-primary">Espace Editorial</span>
              </h1>
              <p class="text-slate-400 font-body text-sm leading-relaxed max-w-[340px] mx-auto opacity-80">
                Accédez à l'orchestrateur modulaire de Kotbo. Visualisez vos performances et gérez votre communauté avec précision.
              </p>
            </div>
          </div>

          <!-- Actions -->
          <div class="space-y-8">
            {#if errorMessage}
              <div class="p-4 rounded-[1.5rem] bg-error/10 border border-error/20 flex items-center gap-4 animate-in fade-in duration-500">
                <div class="bg-error/20 p-2 rounded-xl">
                  <Papicon icon="warning" size={18} class="text-error" />
                </div>
                <p class="text-xs font-bold text-error leading-relaxed flex-grow">
                  {errorMessage}
                </p>
              </div>
            {/if}

            <button 
              onclick={loginWithDiscord}
              class="relative w-full group/btn overflow-hidden"
            >
              <div class="absolute inset-0 bg-primary rounded-[1.5rem] transition-all duration-500 group-hover/btn:scale-105 group-hover/btn:shadow-[0_0_40px_rgba(51,69,87,0.4)]"></div>
              <div class="relative flex items-center justify-center gap-4 py-5 px-8 text-on-primary font-black uppercase tracking-widest text-[11px] transition-transform active:scale-95">
                <div class="bg-white/10 p-2 rounded-xl group-hover/btn:rotate-12 transition-transform">
                  <Papicon icon="discord" size={20} />
                </div>
                <span>Connexion Authentifiée</span>
                <Papicon icon="arrow_forward" size={16} class="group-hover/btn:translate-x-1 transition-transform" />
              </div>
            </button>

            <!-- Tech Stats Overlay -->
            <div class="grid grid-cols-3 gap-3 pt-6 border-t border-white/5">
              <div class="flex flex-col gap-1 text-center">
                <span class="text-[8px] font-black text-slate-500 uppercase tracking-widest">Protocol</span>
                <span class="text-[10px] font-bold text-slate-300">OAuth 2.0</span>
              </div>
              <div class="flex flex-col gap-1 text-center border-x border-white/5 px-2">
                <span class="text-[8px] font-black text-slate-500 uppercase tracking-widest">Security</span>
                <span class="text-[10px] font-bold text-slate-300">AES-256</span>
              </div>
              <div class="flex flex-col gap-1 text-center">
                <span class="text-[8px] font-black text-slate-500 uppercase tracking-widest">Uptime</span>
                <span class="text-[10px] font-bold text-slate-300">99.98%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Helper text -->
      <div class="mt-12 text-center">
        <p class="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em] opacity-40">
          Système de Contrôle Kotbo &copy; {year}
        </p>
      </div>
    </div>
  </main>

  <!-- Footer -->
  <footer class="relative z-20 px-12 py-10">
    <div class="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8 border-t border-white/5 pt-10">
      <div class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
        Infrastructure résiliente. Monitoring en temps réel.
      </div>
      <div class="flex gap-10">
        {#each ['Confidentialité', 'Conditions', 'Documentation'] as link}
          <a href="/" class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 hover:text-primary transition-colors cursor-pointer">{link}</a>
        {/each}
      </div>
    </div>
  </footer>

</div>

<style>
  :global(body) {
    background: #020617 !important;
    overflow-x: hidden;
  }
  
  @keyframes mesh-gradient {
    0% { transform: scale(1) translate(0, 0) rotate(0deg); }
    33% { transform: scale(1.2) translate(10%, 5%) rotate(10deg); }
    66% { transform: scale(1.1) translate(-5%, 15%) rotate(-5deg); }
    100% { transform: scale(1) translate(0, 0) rotate(0deg); }
  }
  
  .animate-mesh {
    animation: mesh-gradient 25s ease-in-out infinite alternate;
  }

  @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes slide-up { from { transform: translateY(40px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  
  .animate-in {
    animation: slide-up 1.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  /* Custom glass effect for the header items if needed */
  header div.flex.items-center.gap-2 {
    box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
  }
</style>

