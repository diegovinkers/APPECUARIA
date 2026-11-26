import { diasCorto, esEmbriones, textoTipo } from './procesos';

// El tablero de Procesos (24/11, dibujo de Diego): las 4 secciones del ciclo
// de la vaca. El servidor manda, en cada proceso abierto, sus `grupos` (uno
// por estado, cada uno con su sección); acá se juntan por sección.
// La IATF es la primera oportunidad y el toro la segunda: lo que viene de una
// IATF y pasó al toro va en Entore con otro color (deIatf). La transferencia
// de embriones (26/11) va como la IATF: en la sección 1, y lo que pasa al toro
// (las no aptas y las vacías) con el color y "de embriones" (vieneDe; corto, para que entre en el celular).

export const SECCIONES_TABLERO = [
  { clave: 'iatf', nombre: 'Inseminación · Embriones', sub: 'IATF y transferencia', vacio: 'No hay vacas en inseminación ni con embriones. Se empieza con "+ Nuevo".' },
  { clave: 'entore', nombre: 'Entore', sub: 'Con toros', vacio: 'No hay vacas con toros.' },
  { clave: 'prenadas', nombre: 'Preñadas', sub: 'Hasta el parto', vacio: 'No hay preñadas esperando el parto.' },
  { clave: 'cria', nombre: 'Con cría al pie', sub: 'Hasta el destete', vacio: 'No hay vacas con cría al pie.' },
];

// Qué es cada grupo, en la tarjeta.
export const TEXTO_GRUPO = {
  VIENTRES: 'En servicio',
  VACIAS_REENTORE: 'Vacías para volver a servir',
  // Solo de antes de las reglas del campo (25/11): ahora la ecografía les da destino.
  VACIAS_A_DECIDIR: 'Vacías: falta decidir',
  PRENADAS: 'Preñadas',
  PARIDAS: 'Paridas',
};

// Qué es el grupo, en su fila: "En servicio · Inseminación"; si el
// diagnóstico quedó a medias (reglas del campo), "Sin ecografiar · faltan 23".
export function textoEstadoGrupo(g, modalidad) {
  if (g.tipo === 'VIENTRES' && g.aMedias) return `Sin ecografiar · ${g.aMedias.replace(/^Diagnóstico a medias: /, '')}`;
  // En una transferencia, las que van al toro son las no aptas y las vacías.
  if (g.tipo === 'VACIAS_REENTORE' && esEmbriones(modalidad)) return 'Al toro: no aptas o vacías';
  return `${TEXTO_GRUPO[g.tipo]}${g.tipo === 'VIENTRES' ? ` · ${textoTipo(modalidad)}` : ''}`;
}

// La etiqueta de lo que va con el color: de dónde viene.
export const textoVieneDe = (g) => (g.vieneDe === 'TE' ? 'de embriones' : 'viene de IATF');

// Debajo del total de la sección: "35 de IATF", "23 de embriones" o los dos.
export function textoDeOrigen(origen = {}) {
  const partes = [];
  if (origen.IATF > 0) partes.push(`${origen.IATF.toLocaleString('es-UY')} de IATF`);
  if (origen.TE > 0) partes.push(`${origen.TE.toLocaleString('es-UY')} de embriones`);
  return partes.join(' · ');
}

// { iatf: [tarjetas], ..., totales: { iatf: cabezas, ... }, deIatf: { entore: cabezas, ... },
//   deOrigen: { entore: { IATF: cabezas, TE: cabezas }, ... } }.
// Cada tarjeta es un grupo con su proceso; primero lo que vence antes (lo que
// no tiene fecha, al final).
export function armarTablero(procesos = []) {
  const tablero = Object.fromEntries(SECCIONES_TABLERO.map((s) => [s.clave, []]));
  for (const p of procesos) {
    for (const g of p.grupos ?? []) tablero[g.seccion]?.push({ ...g, proceso: p, clave: `${p.id}-${g.tipo}-${g.deIatf ? 'iatf' : ''}` });
  }
  const totales = {};
  const deIatf = {};
  const deOrigen = {};
  for (const { clave } of SECCIONES_TABLERO) {
    tablero[clave].sort((a, b) => (a.proxima?.fecha ?? '9999').localeCompare(b.proxima?.fecha ?? '9999') || a.proceso.nombre.localeCompare(b.proceso.nombre));
    totales[clave] = tablero[clave].reduce((s, g) => s + g.cabezas, 0);
    deIatf[clave] = tablero[clave].reduce((s, g) => s + (g.deIatf ? g.cabezas : 0), 0);
    deOrigen[clave] = { IATF: 0, TE: 0 };
    for (const g of tablero[clave]) if (g.deIatf) deOrigen[clave][g.vieneDe === 'TE' ? 'TE' : 'IATF'] += g.cabezas;
  }
  return { ...tablero, totales, deIatf, deOrigen };
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

// Lo que se ve de una sección cerrada (25/11, Diego: "un poco más de
// información" sin abrirla): lo más urgente, en un renglón.
//   - lo atrasado primero: "Ecografía: atrasada 2 días" (o "3 grupos
//     atrasados · Ecografía, atrasada 5 días", el más atrasado);
//   - si no, lo que viene antes: "Parición: faltan 281 días";
//   - si no hay fechas (vacías), qué falta: "Vacías: falta decidir";
//   - sin grupos: null.
// { texto, estado } (estado: el de la sugerencia, para el color).
export function avisoDeSeccion(grupos = []) {
  const conFecha = grupos.filter((g) => g.proxima).sort((a, b) => a.proxima.fecha.localeCompare(b.proxima.fecha));
  const atrasados = conFecha.filter((g) => g.proxima.estado === 'ATRASADA');
  const frase = (g) => `${g.proxima.nombre}${diasCorto(g.proxima) ? `: ${diasCorto(g.proxima)}` : ''}`;
  if (atrasados.length === 1) return { texto: frase(atrasados[0]), estado: 'ATRASADA' };
  if (atrasados.length > 1) {
    const g = atrasados[0];
    return { texto: `${atrasados.length} grupos atrasados · ${g.proxima.nombre}, ${diasCorto(g.proxima)}`, estado: 'ATRASADA' };
  }
  if (conFecha.length) return { texto: frase(conFecha[0]), estado: conFecha[0].proxima.estado };
  if (grupos.length) return { texto: TEXTO_GRUPO[grupos[0].tipo] ?? '', estado: null };
  return null;
}
