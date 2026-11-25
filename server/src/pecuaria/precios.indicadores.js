// Los precios de mercado que guarda la app: claves estables, nombres, unidades,
// grupos y cómo se reconoce cada uno en el Excel y en el informe de INAC.
// Es el único lugar donde están: el lector, la validación, la API y la
// pantalla salen de acá. Ficha de la fuente: docs/PRECIOS_INAC.md.
import { normalizarTexto } from './normalizar.js';

export const UNIDAD = Object.freeze({
  PIE: 'USD_KG_PIE',
  CUARTA: 'USD_KG_4TA',
  GANCHO: 'USD_KG_GANCHO',
});

export const NOMBRE_UNIDAD = Object.freeze({
  USD_KG_PIE: 'USD/kg en pie',
  USD_KG_4TA: 'USD/kg en 4ta balanza',
  USD_KG_GANCHO: 'USD/kg en gancho',
});

export const GRUPOS = Object.freeze(['Novillo', 'Vaca', 'Vaquillona', 'Ovinos']);

// Rango razonable de un precio nuevo, por unidad (USD/kg). Afuera, la semana
// queda en revisión. No se aplica al histórico: en 2000 el novillo en pie
// valía 0,715.
export const RANGOS = Object.freeze({
  USD_KG_PIE: [1, 6],
  USD_KG_4TA: [2, 12],
  USD_KG_GANCHO: [2, 12],
});

// Más que esto contra la semana anterior (en proporción) marca el precio.
export const VARIACION_MAXIMA = 0.15;

// excel: hoja, bloque (lo que dice la primera fila de títulos: "contado" o
// "corrientes") y columna (cómo empieza la segunda fila de títulos), ya
// normalizados. pdf: cómo lo nombra el informe (texto para Claude y para
// reconocer filas). Obligatorio: sin él la importación es un ERROR.
const LISTA = [
  ['NOVILLO_PIE', 'Novillo en pie', 'Novillo', UNIDAD.PIE, 'NOVILLO', 'contado', 'en pie', 'Novillo en pie'],
  ['NOVILLO_4TA', 'Novillo en 4ta balanza', 'Novillo', UNIDAD.CUARTA, 'NOVILLO', 'contado', 'en cuarta balanza', 'Novillo en 4ta bza.', true],
  ['NOVILLO_CAMPO_4TA', 'Novillo campo 4ta balanza', 'Novillo', UNIDAD.CUARTA, 'NOVILLO', 'contado', 'a campo', 'Novillo Campo 4ta bza.'],
  ['NOVILLO_45D', 'Novillo 45 días a levantar', 'Novillo', UNIDAD.CUARTA, 'NOVILLO', 'corrientes', 'a levantar', 'Novillo 45 días a levantar'],
  ['NOVILLO_CAMPO_45D', 'Novillo campo 45 días a levantar', 'Novillo', UNIDAD.CUARTA, 'NOVILLO', 'corrientes', 'campo a levantar', 'Novillo Campo 45 días a levantar'],
  ['VACA_PIE', 'Vaca en pie', 'Vaca', UNIDAD.PIE, 'VACA', 'contado', 'en pie', 'Vaca en pie'],
  ['VACA_4TA', 'Vaca en 4ta balanza', 'Vaca', UNIDAD.CUARTA, 'VACA', 'contado', 'en cuarta balanza', 'Vaca en 4ta bza.', true],
  ['VACA_45D', 'Vaca 45 días a levantar', 'Vaca', UNIDAD.CUARTA, 'VACA', 'corrientes', 'a levantar', 'Vaca 45 días a levantar'],
  ['VAQUILLONA_PIE', 'Vaquillona en pie', 'Vaquillona', UNIDAD.PIE, 'VAQUILLONA', 'contado', 'en pie', 'Vaquillona en pie'],
  ['VAQUILLONA_4TA', 'Vaquillona en 4ta balanza', 'Vaquillona', UNIDAD.CUARTA, 'VAQUILLONA', 'contado', 'en cuarta balanza', 'Vaquillona en 4ta bza.', true],
  ['VAQUILLONA_CAMPO_4TA', 'Vaquillona campo 4ta balanza', 'Vaquillona', UNIDAD.CUARTA, 'VAQUILLONA', 'contado', 'a campo', 'Vaquillona Campo 4ta bza.'],
  ['VAQUILLONA_45D', 'Vaquillona 45 días a levantar', 'Vaquillona', UNIDAD.CUARTA, 'VAQUILLONA', 'corrientes', 'a levantar', 'Vaquillona 45 días a levantar'],
  ['VAQUILLONA_CAMPO_45D', 'Vaquillona campo 45 días a levantar', 'Vaquillona', UNIDAD.CUARTA, 'VAQUILLONA', 'corrientes', 'campo a levantar', 'Vaquillona Campo 45 días a levantar'],
  ['CORDERO_GANCHO', 'Cordero en gancho', 'Ovinos', UNIDAD.GANCHO, 'CORDERO', 'contado', 'en gancho', 'Cordero en Gancho'],
  ['CORDERO_CAMPO', 'Cordero campo', 'Ovinos', UNIDAD.GANCHO, 'CORDERO', 'contado', 'a campo', 'Cordero Campo'],
  ['CORDERO_CAMPO_30D', 'Cordero campo 30 días a levantar', 'Ovinos', UNIDAD.GANCHO, 'CORDERO', 'corrientes', 'campo a levantar', 'Cordero Campo 30 días a levantar'],
  ['OVEJA_GANCHO', 'Oveja en gancho', 'Ovinos', UNIDAD.GANCHO, 'OVEJA', 'contado', 'en gancho', 'Oveja en Gancho'],
];

export const INDICADORES = Object.freeze(
  LISTA.map(([clave, nombre, grupo, unidad, hoja, bloque, columna, pdf, obligatorio = false], orden) =>
    Object.freeze({
      clave,
      nombre,
      grupo,
      unidad,
      orden,
      obligatorio,
      excel: Object.freeze({ hoja, bloque, columna }),
      pdf,
      pdfNormalizado: normalizarTexto(pdf),
    }),
  ),
);

const POR_CLAVE = new Map(INDICADORES.map((i) => [i.clave, i]));

export const CLAVES = Object.freeze(INDICADORES.map((i) => i.clave));
export const OBLIGATORIOS = Object.freeze(INDICADORES.filter((i) => i.obligatorio).map((i) => i.clave));
export const HOJAS = Object.freeze([...new Set(INDICADORES.map((i) => i.excel.hoja))]);

export function indicador(clave) {
  return POR_CLAVE.get(clave) ?? null;
}

// Reconoce un indicador por cómo lo nombra el informe ("Novillo en 4ta bza.").
export function indicadorPorTextoInac(texto) {
  const t = normalizarTexto(texto);
  return INDICADORES.find((i) => i.pdfNormalizado === t) ?? null;
}

// Para después (decisión de Diego): qué precio de INAC usa cada categoría de la
// app (por ejemplo, { 'Novillos 2-3': 'NOVILLO_PIE' }). INAC da precios de
// ganado gordo, no de reposición: por ahora no se une nada.
export const MAPEO_CATEGORIAS = Object.freeze({});

export function indicadorDeCategoria(nombreCategoria, mapeo = MAPEO_CATEGORIAS) {
  return mapeo[nombreCategoria] ?? null;
}
