// Piezas visuales de Pecuaria, pensadas primero para el celular.

export const formatNumero = (n, decimales = 0) =>
  n == null ? '—' : Number(n).toLocaleString('es-UY', { maximumFractionDigits: decimales });

// "2026-11-13" → "13/11/2026"
export const formatFecha = (iso) => (iso ? iso.split('-').reverse().join('/') : '—');

// Qué hay en un potrero, por categoría: "350 Terneros" o "120 Terneros · 80 Vacas"
// (los lotes de la misma categoría se suman). Sin animales: "vacío".
export function cabezasPorCategoria(lotes = []) {
  const porCategoria = new Map();
  for (const l of lotes) if (l.cabezas > 0) porCategoria.set(l.categoria, (porCategoria.get(l.categoria) ?? 0) + l.cabezas);
  if (!porCategoria.size) return 'vacío';
  return [...porCategoria]
    .sort((a, b) => b[1] - a[1])
    .map(([categoria, n]) => `${formatNumero(n)} ${categoria}`)
    .join(' · ');
}

const COLOR_GRUPO = {
  CN: 'bg-lime-500/15 text-lime-800',
  VERDEO: 'bg-emerald-500/15 text-emerald-800',
  CORRAL: 'bg-amber-500/15 text-amber-800',
  OTRO: 'bg-suelo-200 text-suelo-700',
};

// chico: sin alto de más (para las filas de alto fijo de la tabla).
export function UsoBadge({ uso, chico = false }) {
  if (!uso) return <span className="text-xs text-suelo-500">Sin uso</span>;
  return (
    <span className={`rounded px-2 ${chico ? 'min-w-0 max-w-[75%] shrink-0 truncate py-0 leading-4' : 'py-0.5'} text-xs font-medium ${COLOR_GRUPO[uso.grupo] ?? COLOR_GRUPO.OTRO}`}>
      {uso.nombre}
    </span>
  );
}

export function Hectareas({ hectareas, aConfirmar }) {
  if (aConfirmar) {
    return <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-800">ha a confirmar</span>;
  }
  return <span className="text-sm text-suelo-600">{formatNumero(hectareas, 2)} ha</span>;
}

// Un número grande con su etiqueta, para los resúmenes.
export function Dato({ valor, etiqueta }) {
  return (
    <div className="rounded-lg border border-suelo-200 bg-white px-4 py-3">
      <p className="text-2xl font-bold">{valor}</p>
      <p className="text-xs text-suelo-600">{etiqueta}</p>
    </div>
  );
}
