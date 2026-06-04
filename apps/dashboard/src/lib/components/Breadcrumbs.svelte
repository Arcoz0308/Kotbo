<script lang="ts">
  import { router } from 'tinro';
  import Papicon from './Papicon.svelte';
  import { allPages } from '../config/pages';

  // Dynamic breadcrumbs calculation based on the current Tinro router state
  const crumbs = $derived.by(() => {
    const path = $router.path;
    if (path === '/' || path === '/login' || !path) return [];

    const list = [{ name: 'Accueil', href: '/' }];
    
    // Split segments and filter out empty ones
    const segments = path.split('/').filter(Boolean);
    
    // Gérer les cas particuliers à plusieurs niveaux
    if (segments[0] === 'events') {
      list.push({ name: 'Événements', href: '/events' });
      if (segments[1] === 'edit' && segments[2]) {
        list.push({ name: 'Modifier', href: path });
      } else if (segments[1] === 'control' && segments[2]) {
        list.push({ name: 'Superviser', href: path });
      }
    } else if (segments[0] === 'invitations' && segments[1]) {
      list.push({ name: 'Invitations', href: '/invitations' });
      list.push({ name: `Détail (${segments[1]})`, href: path });
    } else if (segments[0] === 'profile' && segments[1]) {
      list.push({ name: 'Membres', href: '/members' });
      list.push({ name: 'Profil', href: path });
    } else if (segments[0] === 'module-settings' && segments[1]) {
      list.push({ name: 'Modules', href: '/modules' });
      // Map legacy/settings paths
      const moduleNames: Record<string, string> = {
        regulation: 'Règlement',
        sanctions: 'Sanctions',
        logs: 'Logs',
        recruitment: 'Recrutement',
        tickets: 'Tickets',
        meetings: 'Réunions',
        dailyalgo: 'Daily Algo'
      };
      list.push({ name: moduleNames[segments[1]] || segments[1], href: path });
    } else if (segments[0] === 'admin') {
      list.push({ name: 'Administration', href: '/admin' });
      if (segments[1]) {
        const adminNames: Record<string, string> = {
          servers: 'Serveurs',
          shards: 'Shards',
          security: 'Sécurité',
          content: 'Mots globaux',
          config: 'Configuration',
          activation: 'Licences',
          modules: 'Supervision'
        };
        list.push({ name: adminNames[segments[1]] || segments[1], href: path });
      }
    } else {
      // Lookup page configuration
      const matchedPage = allPages.find(p => {
        const [pPath] = p.href.split('?');
        return pPath === `/${segments[0]}`;
      });
      
      if (matchedPage) {
        list.push({ name: matchedPage.name, href: matchedPage.href });
      } else {
        // Fallback title casing
        const name = segments[0].charAt(0).toUpperCase() + segments[0].slice(1).replace(/-/g, ' ');
        list.push({ name, href: `/${segments[0]}` });
      }
    }

    return list;
  });
</script>

{#if crumbs.length > 0}
  <nav class="flex items-center gap-2 text-xs font-bold text-on-surface-variant/50 mb-6 bg-surface-container-low/30 border border-outline-variant/10 px-4 py-2.5 rounded-xl w-fit shadow-xs backdrop-blur-xs select-none animate-in fade-in duration-300">
    {#each crumbs as crumb, i}
      {#if i > 0}
        <span class="text-on-surface-variant/20 font-medium">/</span>
      {/if}
      
      {#if i === crumbs.length - 1}
        <span class="text-primary font-black">{crumb.name}</span>
      {:else}
        <a 
          href={crumb.href} 
          class="hover:text-primary transition-colors duration-200 flex items-center gap-1 text-on-surface-variant/75"
        >
          {#if i === 0}
            <Papicon icon="Home" size={12} class="mr-0.5" />
          {/if}
          {crumb.name}
        </a>
      {/if}
    {/each}
  </nav>
{/if}
