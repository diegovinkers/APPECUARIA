// Configuración de la PWA (vite-plugin-pwa). Vive aparte de vite.config.js
// para poder testearla sin compilar (pwa.config.test.js).
//
// Reglas (docs/superpowers/specs/2026-11-18-pwa-design.md):
// - El service worker guarda solo el front compilado. Nunca toca /api: ni la
//   guarda, ni la intercepta, ni le contesta con index.html.
// - Nunca se actualiza solo: cuando hay versión nueva, la app muestra un cartel
//   y se aplica al tocar "Actualizar" (registerType 'prompt').
// - Apagado en desarrollo (npm run dev), para no confundir con versiones viejas.
const COLOR_FONDO = '#18181b'; // zinc-900, el fondo de la app

export const pwaOptions = {
  registerType: 'prompt',
  // El registro lo hace AvisosApp.jsx (virtual:pwa-register/react).
  injectRegister: false,
  manifest: {
    name: 'SAPSA',
    short_name: 'SAPSA',
    description: 'App interna de SAPSA',
    lang: 'es-UY',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    theme_color: COLOR_FONDO,
    background_color: COLOR_FONDO,
    icons: [
      { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
      { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
      { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
    navigateFallback: 'index.html',
    // /api, /api/... nunca reciben index.html del caché (sí /apicultura, si existiera).
    navigateFallbackDenylist: [/^\/api(\/|$)/],
    cleanupOutdatedCaches: true,
  },
  devOptions: { enabled: false },
};
