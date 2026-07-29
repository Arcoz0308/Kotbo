<script lang="ts">
  import { router } from 'tinro';
  import Papicon from './Papicon.svelte';
  import { allPages } from '../config/pages';
  import { m } from '../i18n';

  const crumbs = $derived.by(() => {
    const path = $router.path;
    if (path === '/' || path === '/login' || !path) return [];

    const list = [{ name: m.bc_home(), href: '/' }];

    const segments = path.split('/').filter(Boolean);

    if (segments[0] === 'events') {
      list.push({ name: m.bc_events(), href: '/events' });
      if (segments[1] === 'edit' && segments[2]) {
        list.push({ name: m.bc_edit(), href: path });
      } else if (segments[1] === 'control' && segments[2]) {
        list.push({ name: m.bc_supervise(), href: path });
      }
    } else if (segments[0] === 'invitations' && segments[1]) {
      list.push({ name: m.bc_invitations(), href: '/invitations' });
      list.push({ name: m.bc_detail({ id: segments[1] }), href: path });
    } else if (segments[0] === 'profile' && segments[1]) {
      list.push({ name: m.bc_members(), href: '/members' });
      list.push({ name: m.bc_profile(), href: path });
    } else if (segments[0] === 'module-settings' && segments[1]) {
      list.push({ name: m.bc_modules(), href: '/modules' });
      const moduleNames: Record<string, string> = {
        regulation: m.bc_module_regulation(),
        sanctions: m.bc_module_sanctions(),
        logs: m.bc_module_logs(),
        recruitment: m.bc_module_recruitment(),
        tickets: m.bc_module_tickets(),
        meetings: m.bc_module_meetings(),
        dailyalgo: m.bc_module_dailyalgo()
      };
      list.push({ name: moduleNames[segments[1]] || segments[1], href: path });
    } else if (segments[0] === 'admin') {
      list.push({ name: m.bc_admin(), href: '/admin' });
      if (segments[1]) {
        const adminNames: Record<string, string> = {
          servers: m.bc_admin_servers(),
          shards: m.bc_admin_shards(),
          security: m.bc_admin_security(),
          content: m.bc_admin_content(),
          config: m.bc_admin_config(),
          activation: m.bc_admin_activation(),
          modules: m.bc_admin_modules()
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
  <nav class="breadcrumbs text-xs text-on-surface-variant mb-5 select-none" aria-label="Fil d’Ariane">
    <div class="breadcrumbs__desktop items-center gap-1.5">
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
    </div>

    {#if crumbs.length > 2}
      {@const parent = crumbs[crumbs.length - 2]}
      <a class="breadcrumbs__mobile" href={parent.href} aria-label={`Revenir à ${parent.name}`}>
        <Papicon icon="arrow-left" size={16} />
        <span>{parent.name}</span>
      </a>
    {/if}
  </nav>
{/if}
