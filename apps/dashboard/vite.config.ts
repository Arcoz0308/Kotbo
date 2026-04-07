import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'


const localEnvDir = resolve(process.cwd(), '.')
const rootEnvDir = resolve(process.cwd(), '../..')
const envDir = existsSync(resolve(localEnvDir, '.env')) ? localEnvDir : rootEnvDir

export default defineConfig({
  envDir,
  envPrefix: ['VITE_', 'DISCORD_'],
  plugins: [
    svelte(),
    tailwindcss(),
  ],
})
