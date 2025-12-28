import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Intentionally lock the dev server to a single port to avoid multiple
  // Vite instances and port-hopping which caused blank pages and routing
  // inconsistencies during development. strictPort=true causes Vite to
  // fail loudly if the port is already in use instead of trying another port.
  server: {
    allowedHosts: true,
    port: 5173,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    extensions: ['.mjs', '.js', '.jsx', '.ts', '.tsx', '.json']
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
      },
    },
  },
}) 