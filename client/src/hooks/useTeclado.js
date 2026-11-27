import { useEffect, useState } from 'react';

// El teclado del celular (27/11, pedido de Diego). Sin esto, al abrirse el
// teclado el navegador corre la pantalla a su manera: en Potreros la barra de
// abajo subía con el buscador, y en el asistente a veces se iba el título y a
// veces la caja de escribir. Con esto la app sabe dónde está el teclado y se
// acomoda en lo que queda libre arriba de él:
// - <html data-teclado> mientras está abierto (variante `teclado:` de
//   index.css: la barra de abajo se esconde, queda "abajo del teclado");
// - --teclado-arriba y --teclado-alto: lo que se ve de la pantalla. Lo usa la
//   clase `sigue-teclado` (el marco de la app, el asistente, la hoja del "+").
// Dos caminos:
// - Chrome en Android: la API VirtualKeyboard (overlaysContent): el navegador
//   no corre nada y avisa el alto exacto del teclado.
// - iPhone (y el resto): visualViewport, lo que se ve de la página.
// Si el campo enfocado quedó tapado, se lo trae a la vista dentro de lo que
// scrollea (sin mover la página entera).

export const UMBRAL = 120; // px: menos que esto no es un teclado (la barra del navegador, por ejemplo)
export const CERRADO = Object.freeze({ abierto: false, arriba: 0, alto: 0 });

const SIN_TECLADO = new Set([
  'button',
  'checkbox',
  'radio',
  'range',
  'color',
  'file',
  'submit',
  'reset',
  'image',
  'hidden',
  'date',
  'datetime-local',
  'month',
  'time',
  'week',
]);

// ¿Ese elemento abre el teclado?
export function esEditable(el) {
  if (!el || el.disabled || el.readOnly) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName !== 'INPUT') return false;
  return !SIN_TECLADO.has(String(el.type || 'text').toLowerCase());
}

// Lo que se ve con el teclado. Con VirtualKeyboard (tecladoAlto no es null)
// manda el alto del teclado; si no, lo que se achicó lo visible (visualViewport)
// contra el alto de la pantalla sin teclado (base), y solo con un campo
// enfocado y sin zoom.
export function calcularTeclado({ tecladoAlto = null, ventanaAlto = 0, base = 0, visibleAlto = 0, visibleArriba = 0, escala = 1, enfocado = false }) {
  if (tecladoAlto != null) {
    if (tecladoAlto < UMBRAL) return CERRADO;
    return { abierto: true, arriba: 0, alto: Math.max(0, Math.round(ventanaAlto - tecladoAlto)) };
  }
  if (!enfocado || Math.abs(escala - 1) > 0.05) return CERRADO;
  if (base - visibleAlto < UMBRAL) return CERRADO;
  return { abierto: true, arriba: Math.max(0, Math.round(visibleArriba)), alto: Math.round(visibleAlto) };
}

const igual = (a, b) => a.abierto === b.abierto && a.arriba === b.arriba && a.alto === b.alto;

// Trae el campo a la vista: lo centra en lo que se ve de su caja que scrollea.
export function traerALaVista(el, { arriba, alto }) {
  if (!el?.getBoundingClientRect) return;
  const abajo = arriba + alto;
  const r = el.getBoundingClientRect();
  if (r.top >= arriba && r.bottom <= abajo) return;
  for (let p = el.parentElement; p; p = p.parentElement) {
    const overflow = getComputedStyle(p).overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && p.scrollHeight > p.clientHeight) {
      const rp = p.getBoundingClientRect();
      const desde = Math.max(rp.top, arriba);
      const hasta = Math.min(rp.bottom, abajo);
      p.scrollTop += r.top + r.height / 2 - (desde + hasta) / 2;
      return;
    }
  }
}

// En un buscador, la tecla "buscar" (Enter) del teclado lo cierra: los
// resultados ya están en pantalla y así se ven enteros.
export function cerrarTecladoConEnter(e) {
  if (e.key === 'Enter' && !e.nativeEvent?.isComposing) {
    e.preventDefault();
    e.currentTarget.blur();
  }
}

// --- Un solo medidor para toda la app (lo prende el primero que lo usa). ---
let estado = CERRADO;
const oyentes = new Set();
let apagar = null;

function aplicar(e) {
  const raiz = document.documentElement;
  if (e.abierto) {
    raiz.setAttribute('data-teclado', '');
    raiz.style.setProperty('--teclado-arriba', `${e.arriba}px`);
    raiz.style.setProperty('--teclado-alto', `${e.alto}px`);
  } else {
    raiz.removeAttribute('data-teclado');
    raiz.style.removeProperty('--teclado-arriba');
    raiz.style.removeProperty('--teclado-alto');
  }
}

function publicar(nuevo) {
  if (igual(nuevo, estado)) return;
  const antes = estado;
  estado = nuevo;
  aplicar(nuevo);
  oyentes.forEach((f) => f(nuevo));
  if (nuevo.abierto) {
    // Después de que la pantalla se acomodó al alto nuevo.
    requestAnimationFrame(() => {
      if (estado.abierto && esEditable(document.activeElement)) traerALaVista(document.activeElement, estado);
    });
  } else if (antes.abierto && window.scrollY) {
    // iPhone: a veces deja la página corrida al cerrar el teclado.
    window.scrollTo(0, 0);
  }
}

function prender() {
  const vk = navigator.virtualKeyboard;
  const vv = window.visualViewport;
  if (vk) vk.overlaysContent = true;
  let base = 0;
  let ancho = 0;
  let cuadro = 0;

  const medir = () => {
    cuadro = 0;
    if (window.innerWidth !== ancho) {
      // Se dio vuelta el celular: otra base.
      ancho = window.innerWidth;
      base = 0;
    }
    if (vk) {
      publicar(calcularTeclado({ tecladoAlto: vk.boundingRect?.height ?? 0, ventanaAlto: window.innerHeight }));
      return;
    }
    if (!vv) return;
    const enfocado = esEditable(document.activeElement);
    // La base es el alto más grande que se vio con este ancho (sin teclado).
    if (!enfocado || !estado.abierto) base = Math.max(base, document.documentElement.clientHeight, window.innerHeight);
    publicar(
      calcularTeclado({
        base,
        visibleAlto: vv.height,
        visibleArriba: vv.offsetTop,
        escala: vv.scale ?? 1,
        enfocado,
      }),
    );
  };
  // Al pasar de un campo a otro, el foco queda un instante en ningún lado.
  const medirDespues = () => {
    if (!cuadro) cuadro = requestAnimationFrame(medir);
  };
  // Con el teclado ya abierto, pasar a otro campo (la tecla "siguiente") no
  // cambia el alto: igual hay que traerlo a la vista.
  const alEnfocar = () => {
    medirDespues();
    requestAnimationFrame(() => {
      if (estado.abierto && esEditable(document.activeElement)) traerALaVista(document.activeElement, estado);
    });
  };

  medir();
  vk?.addEventListener('geometrychange', medir);
  vv?.addEventListener('resize', medir);
  vv?.addEventListener('scroll', medir);
  window.addEventListener('resize', medir);
  document.addEventListener('focusin', alEnfocar);
  document.addEventListener('focusout', medirDespues);

  return () => {
    if (cuadro) cancelAnimationFrame(cuadro);
    vk?.removeEventListener('geometrychange', medir);
    vv?.removeEventListener('resize', medir);
    vv?.removeEventListener('scroll', medir);
    window.removeEventListener('resize', medir);
    document.removeEventListener('focusin', alEnfocar);
    document.removeEventListener('focusout', medirDespues);
    if (vk) vk.overlaysContent = false;
    estado = CERRADO;
    aplicar(CERRADO);
  };
}

function suscribir(oyente) {
  oyentes.add(oyente);
  if (!apagar) apagar = prender();
  oyente(estado);
  return () => {
    oyentes.delete(oyente);
    if (!oyentes.size && apagar) {
      apagar();
      apagar = null;
    }
  };
}

// Lo usa el marco de la app (con sesión). `activo` en false: no mide nada (en
// el login la página es común y el navegador se arregla solo).
// Devuelve { abierto, arriba, alto }.
export default function useTeclado(activo = true) {
  const [e, setE] = useState(estado);
  useEffect(() => (activo ? suscribir(setE) : undefined), [activo]);
  return activo ? e : CERRADO;
}
