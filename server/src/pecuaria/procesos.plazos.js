// Los plazos de las etapas de un proceso (docs/PECUARIA.md §9): cuándo se
// espera cada una, contando desde la fecha real de lo anterior ("la fecha
// real manda"). Puro, para probarlo sin base. Fechas en ISO (AAAA-MM-DD).
//
// Los plazos vienen de la tabla etapa_plantilla (editables en Configuración):
//   { FIN_SERVICIO: { plazo: 90, unidad: 'DIAS', desde: 'INICIO', avisoDias: 7, nombre }, ... }
// Si falta alguno, se usa el de PLAZOS_INICIALES.
import { sumarDias, sumarMeses } from './procesos.calculos.js';

export { sumarMeses };

// Los valores iniciales: los mismos que la migración `plazos_y_toros` y el seed.
export const PLAZOS_INICIALES = {
  FIN_SERVICIO: { nombre: 'Fin del entore', plazo: 90, unidad: 'DIAS', desde: 'INICIO', avisoDias: 7, orden: 10 },
  DIAGNOSTICO: { nombre: 'Ecografía', plazo: 30, unidad: 'DIAS', desde: 'FIN_SERVICIO', avisoDias: 7, orden: 20 },
  PARICION: { nombre: 'Parición', plazo: 283, unidad: 'DIAS', desde: 'SERVICIO', avisoDias: 7, orden: 30 },
  NUEVO_ENTORE: { nombre: 'Nuevo entore', plazo: 70, unidad: 'DIAS', desde: 'PARTO', avisoDias: 7, orden: 40 },
  DESTETE: { nombre: 'Destete', plazo: 6, unidad: 'MESES', desde: 'PARTO', avisoDias: 7, orden: 50 },
};

// Lo que dice cada "desde", para mostrarlo en Configuración.
export const TEXTO_DESDE = {
  INICIO: 'del inicio del servicio',
  SERVICIO: 'de cada día de servicio (en el entore, del inicio al fin)',
  FIN_SERVICIO: 'del fin del entore (en la inseminación, de cada tanda)',
  PARTO: 'del parto',
};

// Límites de lo que se puede poner en Configuración.
export const LIMITES = { DIAS: { min: 1, max: 400 }, MESES: { min: 1, max: 24 }, aviso: { min: 0, max: 60 } };

// Los nombres iniciales de los estados (el rol del lote en el proceso).
export const ESTADOS_INICIALES = {
  SIN_SERVIR: { nombre: 'Sin servir', orden: 10 },
  VIENTRES: { nombre: 'Servida', orden: 20 },
  PRENADAS: { nombre: 'Preñada', orden: 30 },
  VACIAS: { nombre: 'Vacía', orden: 40 },
  PARIDAS: { nombre: 'Parida con ternero al pie', orden: 50 },
  CRIAS: { nombre: 'Ternero al pie', orden: 60 },
  LIBRES: { nombre: 'Fuera del proceso', orden: 70 },
};

// Los plazos de la base sobre los iniciales.
export function completarPlazos(filas = []) {
  const plazos = structuredClone(PLAZOS_INICIALES);
  for (const f of filas) plazos[f.clave] = { ...plazos[f.clave], nombre: f.nombre, plazo: f.plazo, unidad: f.unidad, desde: f.desde, avisoDias: f.avisoDias, orden: f.orden };
  return plazos;
}

// La fecha esperada de una etapa, contando desde `base`.
export function fechaPlazo(base, { plazo, unidad }) {
  if (!base) return null;
  return unidad === 'MESES' ? sumarMeses(base, plazo) : sumarDias(base, plazo);
}

// Desde cuándo se avisa (la fecha esperada menos los días de aviso).
export const fechaAviso = (fecha, { avisoDias }) => (fecha ? sumarDias(fecha, -avisoDias) : null);

const minimo = (lista) => [...lista].sort()[0] ?? null;
const maximo = (lista) => [...lista].sort().at(-1) ?? null;

// Las fechas esperadas de un proceso, con lo que ya pasó de verdad.
//   modalidad  TOROS (entore) o IATF (inseminación)
//   inicio     el primer día del servicio
//   finReal    el fin del entore, si ya se cargó (manda sobre los 90 días)
//   tandas     los días de inseminación (IATF; el primero suele ser el inicio)
//   partos     las fechas de las tandas de parición
// Devuelve:
//   finEntore            (solo entore) la salida de los toros
//   ecografias           [fechas]: en el entore, una desde el fin; en la
//                        inseminación, una por tanda
//   paricion             { desde, hasta }: entore, inicio + gestación a fin +
//                        gestación; inseminación, de la primera a la última tanda + gestación
//   porParto             [{ parto, nuevoEntore, destete }]
export function fechasDelPlan({ modalidad, inicio, finReal = null, tandas = [], partos = [] }, plazos = PLAZOS_INICIALES) {
  const p = { ...PLAZOS_INICIALES, ...plazos };
  const entore = modalidad !== 'IATF';
  const diasServicio = entore ? [inicio].filter(Boolean) : (tandas.length ? tandas : [inicio].filter(Boolean));

  const finEntore = entore ? (finReal ?? fechaPlazo(inicio, p.FIN_SERVICIO)) : null;
  const ecografias = entore ? [fechaPlazo(finEntore, p.DIAGNOSTICO)].filter(Boolean) : diasServicio.map((t) => fechaPlazo(t, p.DIAGNOSTICO));
  const paricion = entore
    ? { desde: fechaPlazo(inicio, p.PARICION), hasta: fechaPlazo(finEntore, p.PARICION) }
    : { desde: fechaPlazo(minimo(diasServicio), p.PARICION), hasta: fechaPlazo(maximo(diasServicio), p.PARICION) };
  const porParto = [...partos].sort().map((parto) => ({ parto, nuevoEntore: fechaPlazo(parto, p.NUEVO_ENTORE), destete: fechaPlazo(parto, p.DESTETE) }));
  return { finEntore, ecografias, paricion, porParto };
}
