import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    // Fix for sockjs-client: Add global polyfill
    global: 'globalThis',
  },
  server: {
    allowedHosts: [
      '.ngrok-free.app',
      'submaxillary-unsanguinely-vivienne.ngrok-free.dev'
    ]
  }
})
