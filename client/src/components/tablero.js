// El tablero de Procesos (24/11, dibujo de Diego): las 4 secciones del ciclo
// de la vaca. El servidor manda, en cada proceso abierto, sus `grupos` (uno
// por estado, cada uno con su sección); acá se juntan por sección.

export const SECCIONES_TABLERO = [
  { clave: 'servicio', nombre: 'En servicio', corto: 'Servicio', sub: 'Entore · IATF', vacio: 'No hay vacas en servicio. Se empieza con "+ Nuevo proceso".' },
  { clave: 'reentore', nombre: 'Reentore', corto: 'Reentore', sub: 'Vacías que se vuelven a servir', vacio: 'No hay vacías para volver a servir.' },
  { clave: 'prenadas', nombre: 'Preñadas', corto: 'Preñadas', sub: 'Hasta el parto', vacio: 'No hay preñadas esperando el parto.' },
  { clave: 'cria', nombre: 'Con cría al pie', corto: 'Cría', sub: 'Hasta el destete', vacio: 'No hay vacas con cría al pie.' },
];
export const esSeccion = (clave) => SECCIONES_TABLERO.some((s) => s.clave === clave);

// Qué es cada grupo, en la tarjeta.
export const TEXTO_GRUPO = {
  VIENTRES: 'En servicio',
  VACIAS_REENTORE: 'Vacías para volver a servir',
  VACIAS_A_DECIDIR: 'Vacías: falta decidir',
  PRENADAS: 'Preñadas',
  PARIDAS: 'Paridas',
};

// { servicio: [tarjetas], ..., totales: { servicio: cabezas, ... } }. Cada
// tarjeta es un grupo con su proceso; primero lo que vence antes (lo que no
// tiene fecha, al final).
export function armarTablero(procesos = []) {
  const tablero = Object.fromEntries(SECCIONES_TABLERO.map((s) => [s.clave, []]));
  for (const p of procesos) {
    for (const g of p.grupos ?? []) tablero[g.seccion]?.push({ ...g, proceso: p, clave: `${p.id}-${g.tipo}` });
  }
  const totales = {};
  for (const { clave } of SECCIONES_TABLERO) {
    tablero[clave].sort((a, b) => (a.proxima?.fecha ?? '9999').localeCompare(b.proxima?.fecha ?? '9999') || a.proceso.nombre.localeCompare(b.proceso.nombre));
    totales[clave] = tablero[clave].reduce((s, g) => s + g.cabezas, 0);
  }
  return { ...tablero, totales };
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
//   vacías para volver a servir → empezar el reentore (Nuevo proceso enganchado)
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
  if (g.tipo === 'VACIAS_REENTORE') return { texto: 'Empezar el reentore', ruta: `/pecuaria/procesos/nuevo?desde=${procesoId}` };
  if (g.tipo === 'VACIAS_A_DECIDIR') return { texto: 'Decidir', ruta: `/pecuaria/procesos/${procesoId}/etapa/DECISION` };
  const etapa = g.proxima?.etapa;
  return etapa && BOTON[etapa] ? { texto: BOTON[etapa], ruta: `/pecuaria/procesos/${procesoId}/etapa/${etapa}` } : null;
}
