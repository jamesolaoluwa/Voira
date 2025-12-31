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
  // Make the port configurable via environment variables so you can
  // override the default 5173 in local runs when needed (eg. PORT=5174).
  // Vite also accepts the CLI flag `--port` when running scripts.
  port: Number(process.env.VITE_PORT || process.env.PORT || 5173),
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