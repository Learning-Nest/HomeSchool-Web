import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  // GitHub Pages serves the console from /admin/ (the pages workflow sets VITE_BASE_PATH); everywhere else it is /.
  // loadEnv also picks up VITE_* variables from the process environment, so no Node typings are needed here.
  const env = loadEnv(mode, '.', 'VITE_')
  return {
    base: env.VITE_BASE_PATH || '/',
    plugins: [react()],
    build: { target: 'es2022' },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
    },
  }
})
