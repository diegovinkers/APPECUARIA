import { useEffect, useRef, useState } from 'react';

// Tirar para actualizar, como en Instagram (27/11, pedido de Diego). La app
// está fija a la pantalla (sin el "arrastrar de más" del navegador), así que
// se hace a mano: con lo de la pantalla arriba de todo, tirar hacia abajo con
// el dedo y soltar pasado UMBRAL px actualiza. Solo con el dedo (en la compu,
// nada).
export const UMBRAL = 70;
const MAXIMO = 110;
// Para que se vea la ruedita aunque la actualización sea instantánea.
const MINIMO_MS = 700;

// ¿Se puede empezar a tirar desde ahí? Solo si todo lo que scrollea, desde lo
// tocado hasta la caja del contenido, está arriba de todo; nunca dentro de una
// ventana (el detalle de un movimiento) ni de un campo de texto o selector.
export function puedeTirar(tocado, caja) {
  if (!tocado || !caja || !caja.contains(tocado)) return false;
  if (tocado.closest?.('[role="dialog"], input, textarea, select, [data-sin-tirar]')) return false;
  for (let el = tocado; el; el = el.parentElement) {
    if (el.scrollTop > 0) return false;
    if (el === caja) return true;
  }
  return false;
}

// caja: el elemento que scrollea el contenido. onActualizar puede ser async.
// Devuelve { distancia (px que bajó la ruedita), listo (pasó el umbral),
// actualizando }.
export default function useTirarParaActualizar(caja, onActualizar) {
  const [distancia, setDistancia] = useState(0);
  const [actualizando, setActualizando] = useState(false);
  const accion = useRef(onActualizar);
  accion.current = onActualizar;
  const ocupado = useRef(false);

  useEffect(() => {
    if (!caja) return undefined;
    let inicio = null;
    let d = 0;
    const poner = (v) => {
      d = v;
      setDistancia(v);
    };
    const empezar = (e) => {
      inicio = !ocupado.current && e.touches.length === 1 && puedeTirar(e.target, caja) ? e.touches[0].clientY : null;
    };
    const mover = (e) => {
      if (inicio == null) return;
      const dy = e.touches[0].clientY - inicio;
      if (dy < 0) {
        // Para arriba: es un scroll común.
        inicio = null;
        if (d) poner(0);
        return;
      }
      if (e.cancelable) e.preventDefault();
      // Cuesta cada vez más, como un elástico.
      poner(Math.min(MAXIMO, dy * 0.5));
    };
    const soltar = async () => {
      if (inicio == null) return;
      inicio = null;
      if (d < UMBRAL) return poner(0);
      ocupado.current = true;
      setActualizando(true);
      poner(UMBRAL);
      try {
        await Promise.all([Promise.resolve(accion.current?.()), new Promise((r) => setTimeout(r, MINIMO_MS))]);
      } finally {
        ocupado.current = false;
        setActualizando(false);
        poner(0);
      }
    };
    caja.addEventListener('touchstart', empezar, { passive: true });
    caja.addEventListener('touchmove', mover, { passive: false });
    caja.addEventListener('touchend', soltar);
    caja.addEventListener('touchcancel', soltar);
    return () => {
      caja.removeEventListener('touchstart', empezar);
      caja.removeEventListener('touchmove', mover);
      caja.removeEventListener('touchend', soltar);
      caja.removeEventListener('touchcancel', soltar);
    };
  }, [caja]);

  return { distancia, listo: distancia >= UMBRAL, actualizando };
}
