import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      mqtt: fileURLToPath(new URL('../backend/node/node_modules/mqtt/dist/mqtt.esm.js', import.meta.url)),
    },
  },
})
