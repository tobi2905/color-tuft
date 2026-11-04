import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/ and https://vitest.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['test/**/*.test.ts'],
    // Plain Node: no DOM, so a core module that touches the browser fails here too.
    environment: 'node',
  },
})
