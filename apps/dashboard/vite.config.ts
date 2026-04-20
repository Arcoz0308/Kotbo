import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'


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
  ],
  optimizeDeps: {
    include: ['monaco-editor'],
  },
  worker: {
    format: 'es',
  },
})
