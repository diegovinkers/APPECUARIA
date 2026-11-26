// Pasto de los potreros (docs/superpowers/plans/2026-11-26-pasto.md): lo puro.
// Una sola escala para todos los potreros, sin rangos por tipo de campo
// (decisión de Diego, 26/11/2026). Si cambia, se cambia acá y en
// client/src/components/pasto.js.

export const ALTURAS = [
  { valor: 'BAJO', nombre: 'Bajo', ayuda: 'menos de 10 cm' },
  { valor: 'MEDIO', nombre: 'Medio', ayuda: 'de 10 a 20 cm' },
  { valor: 'ALTO', nombre: 'Alto', ayuda: 'más de 20 cm' },
];

export const VALORES_ALTURA = ALTURAS.map((a) => a.valor);

export const nombreAltura = (valor) => ALTURAS.find((a) => a.valor === valor)?.nombre ?? valor;

// Días entre dos fechas 'AAAA-MM-DD' (hasta - desde).
export function diasEntre(desde, hasta) {
  const d = (iso) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return Math.round((d(hasta) - d(desde)) / 86_400_000);
}

// La última lectura que vale (no anulada): la de fecha más nueva y, el mismo
// día, la cargada después. null si no hay.
// lecturas: [{ id, fecha: 'AAAA-MM-DD', altura, momento, anulada? }]
export function ultimaLectura(lecturas) {
  let ultima = null;
  for (const l of lecturas ?? []) {
    if (l.anulada) continue;
    if (!ultima || l.fecha > ultima.fecha || (l.fecha === ultima.fecha && l.id > ultima.id)) ultima = l;
  }
  return ultima;
}

// Cuánto hace que el potrero está como hoy: con ganado (desde que entraron) o
// vacío (desde que salió el último animal). Sale de las versiones de stock.
// versiones: [{ fecha: 'AAAA-MM-DD', cabezas, origen }] de la más vieja a la
// más nueva (el mismo día, en el orden en que se cargaron).
// Devuelve { conGanado, desde, dias, masDe } o null si no hay versiones.
// masDe: ya estaba así en la primera versión que tiene la app y esa versión
// no vino de un movimiento (la carga inicial de la planilla, una corrección a
// mano): no se sabe desde cuándo, son "más de N días". Un potrero sin
// versiones estaba vacío: si su primera versión es un movimiento, entraron ese día.
export function descanso(versiones, hoy) {
  if (!versiones?.length) return null;
  const conAnimales = (v) => v.cabezas > 0;
  const ultima = versiones[versiones.length - 1];
  const conGanado = conAnimales(ultima);
  let i = versiones.length - 1;
  while (i > 0 && conAnimales(versiones[i - 1]) === conGanado) i -= 1;
  const desde = versiones[i].fecha;
  const masDe = i === 0 && versiones[0].origen !== 'MOVIMIENTO';
  return { conGanado, desde, dias: Math.max(0, diasEntre(desde, hoy)), masDe };
}

// ¿Se le puede anotar pasto a este potrero? Los corrales y los feedlots no.
// potrero: { tipo, campo: { tipo } }
export const llevaPasto = (potrero) => potrero.tipo !== 'CORRAL' && potrero.campo?.tipo !== 'CONFINAMIENTO';
