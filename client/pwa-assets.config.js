// Genera los íconos de la PWA a partir de public/icono.svg. No es parte del
// armado: se corre a mano cuando cambia el ícono y los PNG se guardan en git.
//   npm i --no-save @vite-pwa/assets-generator@1
//   npx pwa-assets-generator
//   npm prune
// (No queda como dependencia: Render lo instalaría en cada armado sin usarlo.)
// El fondo de maskable (Android) y apple-touch (iPhone) es el mismo blanco del
// ícono, para que no quede un borde de otro color cuando el sistema lo recorta.
import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

const FONDO = '#ffffff'; // el fondo del ícono (las barras del logo sobre blanco)

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: FONDO } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: FONDO } },
  },
  images: ['public/icono.svg'],
});
