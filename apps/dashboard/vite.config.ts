import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { paraglideVitePlugin } from '@inlang/paraglide-js'


const dashboardDir = dirname(fileURLToPath(import.meta.url))
const localEnvDir = resolve(dashboardDir, '.')
const rootEnvDir = resolve(dashboardDir, '../..')
const envDir = existsSync(resolve(localEnvDir, '.env')) ? localEnvDir : rootEnvDir

export default defineConfig({
  envDir,
  envPrefix: ['VITE_', 'DISCORD_'],
  plugins: [
    svelte(),
    tailwindcss(),
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/lib/paraglide',
      strategy: ['localStorage', 'preferredLanguage', 'baseLocale'],
    }),
  ],
  optimizeDeps: {
    include: ['monaco-editor'],
  },
  worker: {
    format: 'es',
  },
  build: {
    // Le calcul de la taille gzip de chaque asset au build est purement
    // informatif et coute plusieurs secondes sur un projet de cette taille.
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Les bibliotheques d'icones (lucide-svelte + papicons, ce dernier
          // entrainant React) sont resolues dynamiquement par nom dans
          // Papicon.svelte : elles sont donc embarquees en entier et ne peuvent
          // pas etre elaguees. Les isoler dans un chunk dedie evite au moins
          // qu'elles soient retelechargees a chaque deploiement : leur contenu
          // ne bouge pas, donc leur hash non plus, et le `expires 1y` de nginx
          // les garde en cache navigateur.
          if (
            id.includes('node_modules/lucide-svelte') ||
            id.includes('node_modules/@getpapillon/papicons') ||
            id.includes('node_modules/react')
          ) {
            return 'vendor-icons'
          }
          return undefined
        },
      },
    },
  },
})
