// Piezas visuales de Pecuaria, pensadas primero para el celular.

export const formatNumero = (n, decimales = 0) =>
  n == null ? '—' : Number(n).toLocaleString('es-UY', { maximumFractionDigits: decimales });

// "2026-11-13" → "13/11/2026"
export const formatFecha = (iso) => (iso ? iso.split('-').reverse().join('/') : '—');

const COLOR_GRUPO = {
  CN: 'bg-lime-500/15 text-lime-300',
  VERDEO: 'bg-emerald-500/15 text-emerald-300',
  CORRAL: 'bg-amber-500/15 text-amber-300',
  OTRO: 'bg-zinc-600/40 text-zinc-300',
};

export function UsoBadge({ uso }) {
  if (!uso) return <span className="text-xs text-zinc-500">Sin uso</span>;
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${COLOR_GRUPO[uso.grupo] ?? COLOR_GRUPO.OTRO}`}>{uso.nombre}</span>
  );
}

export function Hectareas({ hectareas, aConfirmar }) {
  if (aConfirmar) {
    return <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300">ha a confirmar</span>;
  }
  return <span className="text-sm text-zinc-400">{formatNumero(hectareas, 2)} ha</span>;
}

// Un número grande con su etiqueta, para los resúmenes.
export function Dato({ valor, etiqueta }) {
  return (
    <div className="rounded-lg bg-zinc-800 px-4 py-3">
      <p className="text-2xl font-bold">{valor}</p>
      <p className="text-xs text-zinc-400">{etiqueta}</p>
    </div>
  );
}
