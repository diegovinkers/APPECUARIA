import { Link } from 'react-router-dom';
// Piezas visuales de Pecuaria, pensadas primero para el celular.

export const formatNumero = (n, decimales = 0) =>
  n == null ? '—' : Number(n).toLocaleString('es-UY', { maximumFractionDigits: decimales });

// Dólares: "USD 93.500".
export const formatUsd = (n) => (n == null ? '—' : `USD ${formatNumero(n)}`);

// Dólares en corto, para las tablas del celular: "2,74 M", "391 mil", "800".
export function formatUsdCorto(n) {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${formatNumero(n / 1_000_000, 2)} M`;
  if (n >= 10_000) return `${formatNumero(n / 1_000, 0)} mil`;
  return formatNumero(n);
}

// Kilos o kg/ha que salen (en parte) del peso promedio de la
// categoría: con "≈" adelante.
export const aprox = (estimado, texto) => (estimado ? `≈${texto}` : texto);

// "2026-11-13" → "13/11/2026"
export const formatFecha = (iso) => (iso ? iso.split('-').reverse().join('/') : '—');

// Con "Todas las estancias" el potrero lleva adelante la sigla de su estancia
// ("EG 8.1"): hay nombres repetidos entre estancias (pedido de Diego, 19/11).
export const nombreConSigla = (potrero, todas) => (todas && potrero.campo?.sigla ? `${potrero.campo.sigla} ${potrero.nombre}` : potrero.nombre);

// Partes de un mismo lote repartido (familia de lotes) que quedaron juntas en
// un potrero, con la misma categoría: se pueden unir. Por cada grupo, la que
// se queda (la raíz, o si no está, la más vieja) y las que se le suman.
export function familiasJuntas(lineas = []) {
  const grupos = new Map();
  for (const l of lineas) {
    if (l.familiaId == null || !(l.cabezas > 0)) continue;
    const clave = `${l.familiaId}-${l.categoriaId}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), l]);
  }
  return [...grupos.values()]
    .filter((g) => g.length > 1)
    .map((g) => {
      const queda = g.find((l) => l.loteId === l.familiaId) ?? [...g].sort((a, b) => a.loteId - b.loteId)[0];
      return { queda, suman: g.filter((l) => l !== queda) };
    });
}

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

// Qué hay en un potrero y su uso, para las listas donde se elige un potrero:
// "120 Terneros · 80 Vacas · Campo natural". Un potrero que vino sin esos datos
// (destino en una estancia que el usuario no ve) da ''.
export function queHayYUso(p) {
  if (!p || (!p.stock && !('usoActual' in p))) return '';
  return `${cabezasPorCategoria(p.stock?.lotes)} · ${p.usoActual?.nombre ?? 'sin uso'}`;
}

// El texto de la opción de un potrero en un selector: "8.1 · 350 Terneros · Avena".
export function opcionPotrero(p, prefijo = '') {
  const detalle = queHayYUso(p);
  return `${prefijo}${p.nombre}${detalle ? ` · ${detalle}` : ''}`;
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
    <span className={`rounded px-2 ${chico ? 'min-w-0 max-w-full truncate py-0 leading-4' : 'py-0.5'} text-xs font-medium ${COLOR_GRUPO[uso.grupo] ?? COLOR_GRUPO.OTRO}`}>
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
    <div className="rounded-lg border border-suelo-200 bg-superficie px-4 py-3">
      <p className="text-2xl font-bold">{valor}</p>
      <p className="text-xs text-suelo-600">{etiqueta}</p>
    </div>
  );
}

// --- Feedlot ---

// Una fecha corta para las tablas del celular: "28/12" (si es de otro año que
// hoy, "28/12/27").
export function formatDiaMes(iso, hoy) {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-');
  return hoy && hoy.slice(0, 4) !== a ? `${d}/${m}/${a.slice(2)}` : `${d}/${m}`;
}

// Cuánto falta para la salida: "en 20 d", "hoy" o "hace 3 d" (ya pasó).
export function textoFaltan(dias) {
  if (dias == null) return '—';
  if (dias === 0) return 'hoy';
  return dias > 0 ? `en ${formatNumero(dias)} d` : `hace ${formatNumero(-dias)} d`;
}

// Metros de comedero por cabeza: "0,32 m".
export const formatMetros = (m) => (m == null ? '—' : `${formatNumero(m, 2)} m`);

// El precio de venta real: "USD 3,2/kg" o "USD 4.800/cab".
export const textoPrecio = (precio, por) => (precio == null ? '—' : `USD ${formatNumero(precio, 2)}/${por === 'CABEZA' ? 'cab' : 'kg'}`);

// Una venta con precio, en la lista de movimientos: "USD 11.520 · USD 3,2/kg".
// Sin precio, null.
export function textoVenta(m) {
  if (m?.precioVentaUsd == null) return null;
  const precio = textoPrecio(m.precioVentaUsd, m.precioVentaPor);
  return m.valorVentaUsd == null ? precio : `${formatUsd(m.valorVentaUsd)} · ${precio}`;
}

// "En proceso: Servicio 2026-27 · Vaquillonas (En servicio) ›", en la ficha de
// un lote o de un potrero (diseño de procesos §12). Uno por proceso abierto.
export function EnProceso({ procesos }) {
  if (!procesos?.length) return null;
  return (
    <div data-testid="en-proceso" className="mt-2 space-y-1">
      {procesos.map((p) => (
        <p key={p.id} className="text-sm text-suelo-700">
          En proceso:{' '}
          <Link to={`/pecuaria/procesos/${p.id}`} className="font-medium text-campo-700 hover:underline">
            {p.nombre} ({p.textoEtapa}) ›
          </Link>
        </p>
      ))}
    </div>
  );
}
