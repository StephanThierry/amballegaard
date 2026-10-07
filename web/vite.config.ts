import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// I udvikling proxies API og SignalR til ASP.NET-serveren; produktionsbuild lægges i serverens wwwroot.
// Backend-adresse kan overskrives, fx API_URL=http://localhost:5099 npx vite --port 5174 (til en ekstra testinstans).
const api = process.env.API_URL ?? 'http://localhost:5028'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // data/furniture.json importeres direkte fra repo-roden (hot reload når filen rettes).
    fs: { allow: ['..'] },
    proxy: {
      '/api': api,
      '/hubs': { target: api, ws: true },
    },
  },
  build: {
    outDir: '../src/Amballegaard.Server/wwwroot',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2500,
  },
})
