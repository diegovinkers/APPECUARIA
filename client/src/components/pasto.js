// Pasto de los potreros (docs/superpowers/plans/2026-11-26-pasto.md): lo puro.
// Una sola escala para todos los potreros (decisión de Diego, 26/11/2026). Si
// cambia, se cambia acá y en server/src/pecuaria/pasto.js.

// letra: la marca chica de la tabla en el celular. color: la etiqueta; punto: el círculo.
export const ALTURAS = [
  { valor: 'BAJO', nombre: 'Bajo', letra: 'B', ayuda: 'menos de 10 cm', color: 'bg-tierra-100 text-tierra-700', punto: 'bg-tierra-600' },
  { valor: 'MEDIO', nombre: 'Medio', letra: 'M', ayuda: 'de 10 a 20 cm', color: 'bg-trigo-100 text-trigo-600', punto: 'bg-trigo-500' },
  { valor: 'ALTO', nombre: 'Alto', letra: 'A', ayuda: 'más de 20 cm', color: 'bg-campo-100 text-campo-700', punto: 'bg-campo-500' },
];

export const altura = (valor) => ALTURAS.find((a) => a.valor === valor) ?? null;

const MOMENTO = { ENTRADA: 'al entrar', SALIDA: 'al salir', RECORRIDA: 'en una recorrida' };
export const textoMomento = (momento) => MOMENTO[momento] ?? '';

// Días de calendario entre dos fechas 'AAAA-MM-DD'.
function diasEntre(desde, hasta) {
  const d = (iso) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return Math.round((d(hasta) - d(desde)) / 86_400_000);
}

// "hoy", "ayer", "hace 3 días".
export function hace(fecha, hoy) {
  const n = diasEntre(fecha, hoy);
  if (n <= 0) return 'hoy';
  if (n === 1) return 'ayer';
  return `hace ${n} días`;
}

// "Medio · hace 3 días". null si no hay pasto anotado.
export function textoPasto(pasto, hoy) {
  if (!pasto) return null;
  return `${altura(pasto.altura)?.nombre ?? pasto.altura} · ${hace(pasto.fecha, hoy)}`;
}

// Los días, cortos: "12 d" o, si no se sabe desde cuándo, "+13 d".
export const diasCortos = (d) => `${d.masDe ? '+' : ''}${d.dias} d`;

// "descansa 12 d", "descansa más de 13 d", "con ganado 5 d". null sin dato.
export function textoDescanso(d) {
  if (!d) return null;
  const dias = `${d.masDe ? 'más de ' : ''}${d.dias} ${d.dias === 1 ? 'día' : 'días'}`;
  return d.conGanado ? `con ganado hace ${dias}` : `descansa hace ${dias}`;
}

// Para ordenar la tabla: Bajo < Medio < Alto (sin dato, null).
export const ordenPasto = (pasto) => (pasto ? ALTURAS.findIndex((a) => a.valor === pasto.altura) + 1 : null);

// Para ordenar por descanso: primero los que descansan hace más; después los
// que tienen ganado (los recién entrados al final). Sin dato, null.
export const ordenDescanso = (d) => (d ? (d.conGanado ? -d.dias - 1 : d.dias) : null);

// Las lecturas que manda una recorrida: solo las de los potreros marcados.
// marcas: { [potreroId]: 'BAJO' | 'MEDIO' | 'ALTO' | '' }
export const lecturasDe = (marcas) =>
  Object.entries(marcas)
    .filter(([, a]) => a)
    .map(([potreroId, a]) => ({ potreroId: Number(potreroId), altura: a }));
