import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/ and https://vitest.dev/config/
export default defineConfig({
  // GitHub Pages serves the app under /color-tuft/, so every asset path needs that prefix.
  base: '/color-tuft/',
  plugins: [react()],
  test: {
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    // Plain Node: no DOM, so a core module that touches the browser fails here too.
    environment: 'node',
  },
})
