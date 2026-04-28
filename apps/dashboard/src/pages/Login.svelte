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

<div class="bg-surface text-on-surface min-h-screen flex flex-col justify-between selection:bg-primary-fixed selection:text-on-primary-fixed relative overflow-hidden transition-colors duration-500">
  
  <header class="fixed top-0 w-full z-50">
    <nav class="flex justify-between items-center w-full px-8 py-6 max-w-7xl mx-auto">
      <div class="text-xl font-bold tracking-tight text-on-surface font-headline uppercase tracking-widest">
        Kotbo
      </div>
      <div class="hidden md:flex gap-6 items-center">
        <span class="text-on-surface-variant/40 font-body text-[10px] font-black uppercase tracking-widest">Maintenance Node: Active</span>
      </div>
    </nav>
  </header>

  
  <main class="flex-grow flex items-center justify-center px-6 pt-20 pb-12 relative z-10">
    <div class="relative w-full max-w-[480px] animate-in fade-in slide-in-from-bottom-4 duration-1000">
      
      <div class="absolute -top-12 -left-12 w-64 h-64 bg-primary opacity-5 rounded-full blur-3xl animate-pulse"></div>
      <div class="absolute -bottom-12 -right-12 w-64 h-64 bg-secondary opacity-5 rounded-full blur-3xl animate-pulse" style="animation-delay: -2s"></div>
      
      <div class="relative bg-surface-container-lowest ambient-shadow rounded-2xl p-10 md:p-14 overflow-hidden ghost-border backdrop-blur-sm">
        
        <div class="flex flex-col items-center text-center mb-12">
          <div class="w-32 h-32 flex items-center justify-center mb-8 group hover:rotate-6 transition-transform duration-500 overflow-visible">
            <img src="/favicon.svg" alt="Kotbo Logo" class="w-full h-full object-contain drop-shadow-2xl group-hover:scale-110 transition-transform" />
          </div>
          <h1 class="font-headline text-3xl font-black tracking-tighter text-on-surface mb-3 leading-tight">
            Bienvenue sur votre Dashboard
          </h1>
          <p class="text-on-surface-variant font-body text-sm leading-relaxed max-w-[320px] opacity-70">
            L'interface centrale pour la gestion modulaire, le monitoring et l'orchestration de votre bot éditorial.
          </p>
        </div>

        
        <div class="space-y-6">
          {#if errorMessage}
            <div class="p-4 rounded-xl bg-error/10 border border-error/20 flex items-center gap-3 animate-in fade-in duration-500">
              <Papicon icon="warning" size={20} class="text-error" />
              <p class="text-xs font-bold text-error leading-relaxed">
                {errorMessage}
              </p>
            </div>
          {/if}

          <button 
            onclick={loginWithDiscord}
            class="w-full bg-primary text-on-primary flex items-center justify-center gap-4 py-4 px-8 rounded-2xl font-black transition-all hover:bg-primary-container active:scale-95 group shadow-xl shadow-primary/20"
          >
            <Papicon icon="account_circle" size={20} class="group-hover:rotate-12 transition-transform" />
            <span class="font-body text-sm tracking-tight uppercase">Se connecter avec Discord</span>
          </button>

          <div class="pt-6 flex items-center gap-4">
            <div class="h-px flex-grow bg-outline-variant opacity-10"></div>
            <span class="text-[9px] font-label font-black uppercase tracking-[0.3em] text-outline opacity-40">Accès Sécurisé</span>
            <div class="h-px flex-grow bg-outline-variant opacity-10"></div>
          </div>

          <div class="grid grid-cols-2 gap-4 pt-4">
            <div class="flex items-center gap-3 p-4 rounded-xl bg-surface-container-low border border-outline-variant/10">
              <Papicon icon="verified_user" size={18} class="text-primary opacity-60" />
              <span class="text-[10px] font-black font-label text-on-surface-variant uppercase tracking-tighter">OAuth2 Séquentiel</span>
            </div>
            <div class="flex items-center gap-3 p-4 rounded-xl bg-surface-container-low border border-outline-variant/10">
              <Papicon icon="encrypted" size={18} class="text-primary opacity-60" />
              <span class="text-[10px] font-black font-label text-on-surface-variant uppercase tracking-tighter">Chiffrement AES</span>
            </div>
          </div>
        </div>
      </div>

      
      <div class="mt-10 text-center">
        <p class="text-on-surface-variant text-[11px] font-body opacity-40 italic">
          Besoin d'assistance ? Contactez l'administrateur système.
        </p>
      </div>
    </div>
  </main>

  
  <footer class="flex flex-col md:flex-row justify-between items-center w-full px-12 py-10 opacity-40 relative z-10 font-body">
    <div class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-6 md:mb-0">
      © {year} Kotbo Orchestrator. Sécurisé par OAuth2.
    </div>
    <div class="flex gap-8">
      <a class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors" href="https://github.com/Klaynight-dev/Kotbo" target="_blank" rel="noreferrer">Confidentialité</a>
      <a class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors" href="https://github.com/Klaynight-dev/Kotbo" target="_blank" rel="noreferrer">Conditions</a>
      <a class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors" href="https://github.com/Klaynight-dev/Kotbo/blob/main/README.md" target="_blank" rel="noreferrer">Documentation</a>
    </div>
  </footer>
</div>

<style>
  :global(body) {
    background: radial-gradient(circle at 0% 0%, var(--surface-container-low) 0%, var(--surface) 100%) !important;
  }
  
  .ghost-border { 
    border: 1px solid rgba(197, 197, 212, 0.15); 
  }
  
  .ambient-shadow { 
    box-shadow: 0 40px 100px rgba(25, 28, 29, 0.08); 
  }

  
  @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes slide-up { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  
  .animate-in {
    animation: slide-up 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
</style>
