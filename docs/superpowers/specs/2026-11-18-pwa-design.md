# PWA básica: diseño

Aprobado por Diego el 18/11/2026.

## Para qué

Que Diego instale la app de SAPSA en su celular (ícono, pantalla completa,
abre rápido) y que siga recibiendo cada versión que se publica en Render.
Por ahora la instala solo él; cualquiera con usuario podrá instalarla después
sin hacer nada especial.

## Objetivos

- Instalable en Android (Chrome) y iPhone (Safari, "Agregar a inicio").
- Abre rápido: las pantallas de la app quedan guardadas en el celular.
- Cuando hay una versión nueva, un cartel "Hay una versión nueva — Actualizar".
  Nunca se actualiza sola a mitad de una carga.
- Sin conexión, la app abre y avisa "Sin conexión" en vez de fallar sin decir nada.

## Fuera de alcance

- Trabajar sin señal (guardar movimientos en el celular y sincronizar): es un
  módulo aparte (conflictos entre celulares, stock viejo, datos en el teléfono).
- Notificaciones.

## Lo que no puede pasar

- Que el service worker guarde respuestas de `/api` (datos, sesión): nadie ve
  datos viejos y no queda información en un celular perdido.
- Que un usuario quede atascado en una versión vieja.
- Que se recargue la página sola mientras alguien está cargando un movimiento.

## Enfoques considerados

1. **`vite-plugin-pwa` (elegido).** La versión 2.0 es compatible con Vite 8.
   Genera el manifiesto y el service worker (Workbox) y trae el registro con
   aviso de actualización.
2. Service worker escrito a mano: más código propio para mantener, sin ventaja.
3. Solo el manifiesto: se instala, pero no abre más rápido ni avisa versiones nuevas.

## Cómo

- **Manifiesto:** nombre "SAPSA", `display: standalone`, `lang: es-UY`,
  colores de la app.
- **Ícono provisorio:** una "S" con los colores de la app (192, 512, maskable
  y apple-touch-icon). Se cambia por el logo de SAPSA si lo hay.
- **Service worker:** precachea solo el front compilado (`index.html`, `/assets`,
  íconos). `navigateFallback` a `index.html` con `/api` en la lista de excluidos;
  sin `runtimeCaching` para `/api`.
- **Registro:** modo `prompt`. Componente con el cartel de versión nueva
  (botón "Actualizar") y aviso de "Sin conexión" (`navigator.onLine` + eventos).
- **Servidor:** `sw.js` y el manifiesto sin caché larga (hoy `front.js` ya da
  `no-cache` a todo lo que no está en `/assets`). Revisar que helmet (CSP) no
  bloquee el service worker ni el manifiesto.
- **Desarrollo:** el service worker apagado en `npm run dev`, para no confundir.
- **Tests:** del servidor (headers de `sw.js` y del manifiesto, que `/api` siga
  `no-store`) y del armado (el service worker generado no menciona `/api` en el
  precache y excluye `/api` del fallback).
- **Prueba real:** publicar en Render e instalar en el celular de Diego.

## Queda a criterio de quien lo construya

- Los colores exactos (sacarlos de la app).
- Dónde va el cartel en pantalla, siempre que no tape botones.
