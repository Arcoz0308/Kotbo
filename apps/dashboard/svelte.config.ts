import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/**
 * custom_element_props_identifier ne concerne que la compilation en custom
 * elements, que le dashboard n'utilise pas : les composants qui transmettent
 * un `...rest` a leur element racine declencheraient l'avertissement sans
 * qu'aucune correction n'ait de sens ici.
 */
const IGNORED_WARNINGS = new Set(['custom_element_props_identifier'])

export default {
  preprocess: vitePreprocess(),
  compilerOptions: {
    warningFilter: (warning: { code: string }) => !IGNORED_WARNINGS.has(warning.code),
  },
}
