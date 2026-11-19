// Piezas de las tablas tipo Excel (Potreros y Movimientos): títulos que
// ordenan, celdas con líneas y el paginador.

export const FILAS_POR_PAGINA = 50;

// Los números que muestra el paginador (pedido de Diego, 19/11): la primera,
// la página donde estás y las 5 siguientes, un salto del 30% y otro del 50%
// del total contados desde donde estás, y la última. Entre números que no son
// seguidos va "…".
// Ej.: en la 1 de 100 → 1 2 3 4 5 6 … 30 … 50 … 100
//      en la 40 de 100 → 1 … 40 41 42 43 44 45 … 69 … 89 … 100
export function paginasVisibles(actual, total) {
  if (total <= 1) return [];
  const p = Math.min(Math.max(1, actual), total);
  const numeros = new Set([1, total]);
  for (let n = p; n <= Math.min(total, p + 5); n++) numeros.add(n);
  for (const salto of [0.3, 0.5]) {
    const n = p - 1 + Math.round(total * salto);
    if (n > p + 5 && n < total) numeros.add(n);
  }
  const orden = [...numeros].sort((a, b) => a - b);
  const salida = [];
  orden.forEach((n, i) => {
    if (i > 0 && n - orden[i - 1] > 1) salida.push('…');
    salida.push(n);
  });
  return salida;
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
  const boton = 'min-w-9 rounded-md px-2 py-1.5 text-sm tabular-nums';
  return (
    // Una sola línea si entra: queda fija debajo de la tabla, siempre a la vista.
    <nav aria-label="Páginas" className="mt-2 flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1">
      <div className="flex flex-wrap items-center justify-center gap-1">
        <button type="button" disabled={pagina <= 1} onClick={() => onCambiar(pagina - 1)} aria-label="Página anterior" className={`${boton} text-campo-700 hover:bg-suelo-100 disabled:opacity-30`}>
          ‹
        </button>
        {paginasVisibles(pagina, total).map((n, i) =>
          n === '…' ? (
            <span key={`s${i}`} className="px-1 text-suelo-400" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={n}
              type="button"
              onClick={() => onCambiar(n)}
              aria-current={n === pagina ? 'page' : undefined}
              className={`${boton} ${n === pagina ? 'bg-campo-600 font-semibold text-white' : 'text-suelo-700 hover:bg-suelo-100'}`}
            >
              {n}
            </button>
          ),
        )}
        <button type="button" disabled={pagina >= total} onClick={() => onCambiar(pagina + 1)} aria-label="Página siguiente" className={`${boton} text-campo-700 hover:bg-suelo-100 disabled:opacity-30`}>
          ›
        </button>
      </div>
      <p className="text-xs text-suelo-500">
        Filas {desde}–{hasta} de {de}
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
      className={`sticky top-0 border-b border-r border-suelo-300 bg-suelo-100 px-2 py-1.5 font-medium last:border-r-0 ${fija ? 'left-0 z-20' : 'z-10'} ${derecha ? 'text-right' : ''} ${className}`}
    >
      <button type="button" onClick={() => onOrdenar(col)} className="inline-flex items-center gap-1 whitespace-nowrap hover:text-suelo-900">
        {titulo}
        <span aria-hidden="true" className="text-suelo-400">
          {activa ? (orden.dir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
}

// Clase de una celda: líneas como en Excel.
export const celda = 'border-b border-r border-suelo-200 px-2 py-1.5 align-top last:border-r-0';
