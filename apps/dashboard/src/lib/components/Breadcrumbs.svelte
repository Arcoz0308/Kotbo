<script lang="ts">
  import { router } from 'tinro';
  import Papicon from './Papicon.svelte';
  import { allPages } from '../config/pages';

  const crumbs = $derived.by(() => {
    const path = $router.path;
    if (path === '/' || path === '/login' || !path) return [];

    const list = [{ name: 'Accueil', href: '/' }];

    const segments = path.split('/').filter(Boolean);

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
      const matchedPage = allPages.find(p => {
        const [pPath] = p.href.split('?');
        return pPath === `/${segments[0]}`;
      });

      if (matchedPage) {
        list.push({ name: matchedPage.name, href: matchedPage.href });
      } else {
        const name = segments[0].charAt(0).toUpperCase() + segments[0].slice(1).replace(/-/g, ' ');
        list.push({ name, href: `/${segments[0]}` });
      }
    }

    return list;
  });
</script>

{#if crumbs.length > 0}
  <nav class="flex items-center gap-1.5 text-xs text-on-surface-variant mb-5 select-none">
    {#each crumbs as crumb, i}
      {#if i > 0}
        <span class="text-on-surface-variant/30">/</span>
      {/if}

      {#if i === crumbs.length - 1}
        <span class="text-on-surface font-medium">{crumb.name}</span>
      {:else}
        <a
          href={crumb.href}
          class="hover:text-on-surface transition-colors flex items-center gap-1"
        >
          {#if i === 0}
            <Papicon icon="Home" size={12} />
          {/if}
          {crumb.name}
        </a>
      {/if}
    {/each}
  </nav>
{/if}
