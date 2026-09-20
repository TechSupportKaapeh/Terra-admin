/// <reference types="vitest/config" />
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Los tests (M.7.6) son de `src/lib/`: funciones puras, sin DOM y sin red. Por eso el
  // entorno es `node` y no jsdom — que sería una dependencia más para nada. Los de
  // componentes, si algún día hacen falta, van a pedir jsdom y su propio proyecto.
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
