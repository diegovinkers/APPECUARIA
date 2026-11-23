// Modo claro / oscuro (23/11). La preferencia de cada persona se guarda en el
// navegador: 'auto' (lo que diga el celular o la compu), 'claro' u 'oscuro'.
// El tema que se ve va en <html data-tema="claro|oscuro">; los colores del
// oscuro están en src/index.css.
//
// public/tema-inicial.js hace lo mismo antes de que cargue React (para que
// no se vea un destello blanco al abrir en oscuro): si se cambia algo acá,
// cambiarlo también allá.

export const CLAVE_TEMA = 'tema';
export const PREFERENCIAS = ['claro', 'oscuro', 'auto'];

// El color de la barra del sistema (el de la barra de arriba, --color-barra).
export const COLOR_BARRA = { claro: '#2e5e3a', oscuro: '#1d3a26' };

const CONSULTA_OSCURO = '(prefers-color-scheme: dark)';

export function leerPreferencia(storage = globalThis.localStorage) {
  try {
    const valor = storage?.getItem(CLAVE_TEMA);
    return PREFERENCIAS.includes(valor) ? valor : 'auto';
  } catch {
    return 'auto';
  }
}

export function guardarPreferencia(preferencia, storage = globalThis.localStorage) {
  try {
    if (preferencia === 'auto') storage?.removeItem(CLAVE_TEMA);
    else storage?.setItem(CLAVE_TEMA, preferencia);
  } catch {
    // Sin almacenamiento (ventana privada): el tema vale solo hasta cerrar.
  }
}

export function sistemaOscuro(win = globalThis.window) {
  try {
    return Boolean(win?.matchMedia?.(CONSULTA_OSCURO).matches);
  } catch {
    return false;
  }
}

export function resolverTema(preferencia, prefiereOscuro) {
  if (preferencia === 'claro' || preferencia === 'oscuro') return preferencia;
  return prefiereOscuro ? 'oscuro' : 'claro';
}

export function aplicarTema(tema, doc = globalThis.document) {
  if (!doc) return;
  doc.documentElement.dataset.tema = tema;
  const meta = doc.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', COLOR_BARRA[tema] ?? COLOR_BARRA.claro);
}

// Avisa cuando el celular o la compu cambian de claro a oscuro (o al revés).
export function escucharSistema(alCambiar, win = globalThis.window) {
  const consulta = win?.matchMedia?.(CONSULTA_OSCURO);
  if (!consulta?.addEventListener) return () => {};
  const manejar = (e) => alCambiar(e.matches);
  consulta.addEventListener('change', manejar);
  return () => consulta.removeEventListener('change', manejar);
}
