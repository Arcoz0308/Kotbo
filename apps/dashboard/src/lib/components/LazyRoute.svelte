<script lang="ts">
  import { Route as RouteLegacy, router } from 'tinro';
  import { patternMatches, registerRouteLoader, type RouteLoader } from '../lazyRoutes';
  import LazyPage from './LazyPage.svelte';

  // tinro n'expose pas de types Svelte 5 ; meme traitement que dans App.svelte.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Route = RouteLegacy as any;

  let {
    path,
    load,
    props: propsFor,
    remountKey: remountKeyFor,
  }: {
    path: string;
    load: RouteLoader;
    /**
     * Derive les props de la page depuis les parametres d'URL de tinro.
     * Ex. `props={(meta) => ({ serverId: meta.params.serverId })}`.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    props?: (meta: any) => Record<string, unknown>;
    /** Force un remontage quand la valeur derivee change (cf. LazyPage). */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    remountKey?: (meta: any) => unknown;
  } = $props();

  // Le loader reste disponible pour le prefetch, mais le composant Route de
  // Tinro n'est créé que pour les motifs qui peuvent réellement correspondre
  // à l'URL courante. Cela évite de monter plus de cent routes et LazyPage à
  // chaque affichage du dashboard.
  $effect(() => {
    registerRouteLoader(path, load);
  });

  const active = $derived(patternMatches(path, $router.path));
</script>

{#if active}
  <Route {path} let:meta>
    <LazyPage
      pattern={path}
      {load}
      pageProps={propsFor ? propsFor(meta) : {}}
      remountKey={remountKeyFor ? remountKeyFor(meta) : undefined}
    />
  </Route>
{/if}
