<script lang="ts">
  import { Route as RouteLegacy } from 'tinro';
  import { registerRouteLoader, type RouteLoader } from '../lazyRoutes';
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

  // Enregistre le loader des la construction (y compris pour les routes non
  // affichees), afin que `prefetchRoute` puisse precharger n'importe quel lien
  // au survol.
  registerRouteLoader(path, load);
</script>

<Route {path} let:meta>
  <LazyPage
    pattern={path}
    {load}
    pageProps={propsFor ? propsFor(meta) : {}}
    remountKey={remountKeyFor ? remountKeyFor(meta) : undefined}
  />
</Route>
