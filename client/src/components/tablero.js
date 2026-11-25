// El tablero de Procesos (24/11, dibujo de Diego): las 4 secciones del ciclo
// de la vaca. El servidor manda, en cada proceso abierto, sus `grupos` (uno
// por estado, cada uno con su sección); acá se juntan por sección.
// La IATF es la primera oportunidad y el toro la segunda: lo que viene de una
// IATF y pasó al toro va en Entore con otro color (deIatf).

export const SECCIONES_TABLERO = [
  { clave: 'iatf', nombre: 'Inseminación', sub: 'IATF', vacio: 'No hay vacas en inseminación. Se empieza con "+ Nuevo".' },
  { clave: 'entore', nombre: 'Entore', sub: 'Con toros · en otro color, las que vienen de IATF', vacio: 'No hay vacas con toros.' },
  { clave: 'prenadas', nombre: 'Preñadas', sub: 'Hasta el parto', vacio: 'No hay preñadas esperando el parto.' },
  { clave: 'cria', nombre: 'Con cría al pie', sub: 'Hasta el destete', vacio: 'No hay vacas con cría al pie.' },
];

// Qué es cada grupo, en la tarjeta.
export const TEXTO_GRUPO = {
  VIENTRES: 'En servicio',
  VACIAS_REENTORE: 'Vacías para volver a servir',
  VACIAS_A_DECIDIR: 'Vacías: falta decidir',
  PRENADAS: 'Preñadas',
  PARIDAS: 'Paridas',
};

// { iatf: [tarjetas], ..., totales: { iatf: cabezas, ... }, deIatf: { entore: cabezas, ... } }.
// Cada tarjeta es un grupo con su proceso; primero lo que vence antes (lo que
// no tiene fecha, al final).
export function armarTablero(procesos = []) {
  const tablero = Object.fromEntries(SECCIONES_TABLERO.map((s) => [s.clave, []]));
  for (const p of procesos) {
    for (const g of p.grupos ?? []) tablero[g.seccion]?.push({ ...g, proceso: p, clave: `${p.id}-${g.tipo}-${g.deIatf ? 'iatf' : ''}` });
  }
  const totales = {};
  const deIatf = {};
  for (const { clave } of SECCIONES_TABLERO) {
    tablero[clave].sort((a, b) => (a.proxima?.fecha ?? '9999').localeCompare(b.proxima?.fecha ?? '9999') || a.proceso.nombre.localeCompare(b.proceso.nombre));
    totales[clave] = tablero[clave].reduce((s, g) => s + g.cabezas, 0);
    deIatf[clave] = tablero[clave].reduce((s, g) => s + (g.deIatf ? g.cabezas : 0), 0);
  }
  return { ...tablero, totales, deIatf };
}

const dia = (iso) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

// Cuánto pasó del tiempo estimado (0 a 1), de `desde` a `hasta`. null si falta una fecha.
export function avance(desde, hasta, hoy) {
  if (!desde || !hasta) return null;
  const total = dia(hasta) - dia(desde);
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, (dia(hoy) - dia(desde)) / total));
}

// El botón de lo que sigue en la tarjeta: { texto, ruta } (o null).
//   vacías para volver a servir → empezar el entore (Nuevo proceso enganchado;
//                                 arranca con "Entore con toros" elegido)
//   vacías sin decidir          → decidir (la pantalla de la etapa)
//   el resto                    → la pantalla de la etapa que viene
const BOTON = {
  INSEMINACION: 'Anotar inseminación',
  FIN_SERVICIO: 'Fin del servicio',
  DIAGNOSTICO: 'Ecografía',
  PARICION: 'Registrar parición',
  DESTETE: 'Destetar',
};
export function accionDeGrupo(procesoId, g) {
  if (g.tipo === 'VACIAS_REENTORE') return { texto: 'Empezar el entore', ruta: `/pecuaria/procesos/nuevo?desde=${procesoId}` };
  if (g.tipo === 'VACIAS_A_DECIDIR') return { texto: 'Decidir', ruta: `/pecuaria/procesos/${procesoId}/etapa/DECISION` };
  const etapa = g.proxima?.etapa;
  return etapa && BOTON[etapa] ? { texto: BOTON[etapa], ruta: `/pecuaria/procesos/${procesoId}/etapa/${etapa}` } : null;
}

// La tabla de una sección (25/11, Diego: "un Excel, no tarjetas"): ordenar
// los grupos por una columna. Sin fecha, siempre al final.
//   proceso  → nombre del proceso
//   cabezas  → cabezas
//   proxima  → fecha de lo que sigue (por defecto)
//   potreros → el primer potrero
export function ordenarGrupos(grupos = [], { col = 'proxima', dir = 'asc' } = {}) {
  const signo = dir === 'desc' ? -1 : 1;
  const valor = {
    proceso: (g) => g.proceso?.nombre ?? '',
    cabezas: (g) => g.cabezas ?? 0,
    potreros: (g) => g.potreros?.[0] ?? '',
    proxima: (g) => g.proxima?.fecha ?? null,
  }[col] ?? ((g) => g.proxima?.fecha ?? null);
  return [...grupos].sort((a, b) => {
    const va = valor(a);
    const vb = valor(b);
    if (va == null || vb == null) return va == null && vb == null ? 0 : va == null ? 1 : -1;
    const c = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'es', { numeric: true });
    return c * signo || (a.proceso?.nombre ?? '').localeCompare(b.proceso?.nombre ?? '');
  });
}
