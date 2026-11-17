import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// En desarrollo, Vite le pasa /api a la API (puerto 4000), así el front usa
// /api igual que en producción. El Origin del navegador no se cambia: la API
// lo sigue controlando contra CLIENT_URL (http://localhost:5173).
const API_DEV = process.env.API_DEV_URL || 'http://localhost:4000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': { target: API_DEV },
    },
  },
});
