import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { projectThemeCss, themeSources } from './project-theme.mjs'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'mydashboard-existing-theme',
      resolveId(id) {
        if (id === 'virtual:project-theme.css') return '\0project-theme.css'
      },
      load(id) {
        if (id !== '\0project-theme.css') return
        for (const source of themeSources) this.addWatchFile(fileURLToPath(source))
        return projectThemeCss()
      },
    },
  ],
  base: './',
  server: {
    fs: {
      allow: ['.', '../../../assets', '../../../src/renderer/assets'].map((path) =>
        fileURLToPath(new URL(path, import.meta.url)),
      ),
    },
  },
})
