// Piezas de las tablas tipo Excel (Potreros y Movimientos): títulos que
// ordenan, celdas con líneas y el paginador.
import { useLayoutEffect, useState } from 'react';

export const FILAS_POR_PAGINA = 50;

// Los números que muestra el paginador (regla de Diego, 19/11): siempre la
// primera y la última, y la anterior y la siguiente a donde estás. En la
// primera se ven las 2 siguientes; en la última, las 2 anteriores. Entre
// números que no son seguidos va "…".
// Ej. (7 páginas): en la 1 → 1 2 3 … 7 · en la 2 → 1 2 3 … 7 ·
//   en la 3 → 1 2 3 4 … 7 · en la 4 → 1 … 3 4 5 … 7 · en la 5 → 1 … 4 5 6 7 ·
//   en la 7 → 1 … 5 6 7
export function paginasVisibles(actual, total) {
  if (total <= 1) return [];
  const p = Math.min(Math.max(1, actual), total);
  const numeros = new Set([1, total, p - 1, p, p + 1]);
  if (p === 1) numeros.add(3);
  if (p === total) numeros.add(total - 2);
  const orden = [...numeros].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const salida = [];
  orden.forEach((n, i) => {
    if (i > 0 && n - orden[i - 1] > 1) salida.push('…');
    salida.push(n);
  });
  return salida;
}

// Cuántas filas entran en la caja de la tabla sin scrollear (pedido de Diego,
// 19/11: "un paginado prolijo, la planilla siempre derecha"). Mide el alto
// libre (la caja, que tiene la tabla y el paginador, menos los títulos, el
// total y el paginador) y lo divide por el alto de una fila, que es fijo. Se
// recalcula si cambia el tamaño de la pantalla o si aparece o desaparece el
// paginador. Sin ResizeObserver (los tests) queda en FILAS_POR_PAGINA.
// altoBase(): el alto mínimo de una fila en px. Lo que sobra (menos de una
// fila) se reparte entre las filas (alto), así el paginador queda pegado abajo.
export function useFilasQueEntran(caja, hayPaginador, altoBase) {
  const [estado, setEstado] = useState({ filas: FILAS_POR_PAGINA, medido: false, alto: null });
  useLayoutEffect(() => {
    if (!caja || typeof ResizeObserver === 'undefined') return undefined;
    const medir = () => {
      const base = altoBase?.() || caja.querySelector('tbody tr')?.offsetHeight;
      if (!base) return;
      const altoDe = (sel) => caja.querySelector(sel)?.offsetHeight ?? 0;
      const paginador = caja.querySelector('nav[aria-label="Páginas"]') ? altoDe('nav[aria-label="Páginas"]') + 8 : 0;
      // 2: el borde de la caja de la tabla.
      const libre = caja.clientHeight - altoDe('thead') - altoDe('tfoot') - paginador - 2;
      const filas = Math.max(3, Math.floor(libre / base));
      const alto = Math.max(base, Math.floor(libre / filas));
      setEstado((e) => (e.filas === filas && e.alto === alto && e.medido ? e : { filas, alto, medido: true }));
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(caja);
    // Si el paginador cambia de alto, se vuelve a medir.
    const nav = caja.querySelector('nav[aria-label="Páginas"]');
    if (nav) observador.observe(nav);
    return () => observador.disconnect();
  }, [caja, hayPaginador, altoBase]);
  return estado;
}

export const totalPaginas = (filas, tam = FILAS_POR_PAGINA) => Math.max(1, Math.ceil(filas / tam));

// Las filas de una página (la página se ajusta si quedó fuera de rango).
export function paginar(filas, pagina, tam = FILAS_POR_PAGINA) {
  const total = totalPaginas(filas.length, tam);
  const p = Math.min(Math.max(1, pagina || 1), total);
  return { filas: filas.slice((p - 1) * tam, p * tam), pagina: p, total, desde: filas.length ? (p - 1) * tam + 1 : 0, hasta: Math.min(p * tam, filas.length) };
}

export function Paginador({ pagina, total, onCambiar, desde, hasta, de }) {
  if (total <= 1) return null;
  const boton = 'min-w-8 rounded-md px-1.5 py-1 text-sm tabular-nums';
  return (
    // Una sola línea si entra: queda fija debajo de la tabla, siempre a la vista.
    <nav aria-label="Páginas" className="mt-2 flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1">
      <div className="flex items-center justify-center gap-0.5">
        <button type="button" disabled={pagina <= 1} onClick={() => onCambiar(pagina - 1)} aria-label="Página anterior" className={`${boton} text-campo-700 hover:bg-suelo-100 disabled:opacity-30`}>
          ‹
        </button>
        {paginasVisibles(pagina, total).map((n, i) =>
          n === '…' ? (
            <span key={`s${i}`} className="px-0.5 text-suelo-400" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={n}
              type="button"
              onClick={() => onCambiar(n)}
              aria-current={n === pagina ? 'page' : undefined}
              className={`${boton} ${n === pagina ? 'bg-boton font-semibold text-white' : 'text-suelo-700 hover:bg-suelo-100'}`}
            >
              {n}
            </button>
          ),
        )}
        <button type="button" disabled={pagina >= total} onClick={() => onCambiar(pagina + 1)} aria-label="Página siguiente" className={`${boton} text-campo-700 hover:bg-suelo-100 disabled:opacity-30`}>
          ›
        </button>
      </div>
      {/* En el celular no se muestra: así el paginador entra siempre en un renglón
          (en la 4 de 9: ‹ 1 … 3 4 5 … 9 ›). El total ya dice cuántos hay. */}
      <p className="hidden text-xs text-suelo-500 sm:block">
        {desde}–{hasta} de {de}
      </p>
    </nav>
  );
}

// Un título de columna que ordena al tocarlo (▲ ▼; ↕ si no es la elegida).
export function TituloOrdenable({ col, titulo, orden, onOrdenar, derecha, fija, className = '' }) {
  const activa = orden.col === col;
  return (
    <th
      scope="col"
      aria-sort={activa ? (orden.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`sticky top-0 border-b border-r border-suelo-300 bg-suelo-100 px-1.5 py-1.5 md:px-2 font-medium last:border-r-0 ${fija ? 'left-0 z-20' : 'z-10'} ${derecha ? 'text-right' : ''} ${className}`}
    >
      <button type="button" onClick={() => onOrdenar(col)} className="inline-flex items-center gap-1 whitespace-nowrap hover:text-suelo-900">
        {titulo}
        {/* En el celular, la flechita ↕ de las que no ordenan no se muestra (ocupa lugar). */}
        <span aria-hidden="true" className={`text-suelo-400 ${activa ? '' : 'hidden md:inline'}`}>
          {activa ? (orden.dir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
}

// Clase de una celda: líneas como en Excel.
export const celda = 'border-b border-r border-suelo-200 px-1.5 py-1.5 align-top last:border-r-0 md:px-2';
