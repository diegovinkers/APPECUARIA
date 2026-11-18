// Genera los íconos de la PWA a partir de public/icono.svg. No es parte del
// armado: se corre a mano cuando cambia el ícono y los PNG se guardan en git.
//   npm i --no-save @vite-pwa/assets-generator@1
//   npx pwa-assets-generator
//   npm prune
// (No queda como dependencia: Render lo instalaría en cada armado sin usarlo.)
// El fondo de maskable (Android) y apple-touch (iPhone) es el mismo verde del
// ícono, para que no quede un borde blanco cuando el sistema lo recorta.
import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

const VERDE = '#2e5e3a'; // campo-600, el fondo del ícono

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: VERDE } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: VERDE } },
  },
  images: ['public/icono.svg'],
});
