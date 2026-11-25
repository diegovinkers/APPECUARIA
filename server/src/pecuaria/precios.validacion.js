// Control de una semana de precios antes de publicarla. Puro.
//  - ERROR: no se publica nada (fechas mal, falta un precio obligatorio).
//  - EN_REVISION: se guarda pero no se publica hasta que alguien la apruebe
//    (un precio fuera de su rango o que varió mucho contra la semana anterior).
//  - OK: se publica.
import {
  CLAVES, INDICADORES, NOMBRE_UNIDAD, RANGOS, VARIACION_MAXIMA, indicador,
} from './precios.indicadores.js';
import { sumarDias } from './precios.inac.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const fechaValida = (iso) => typeof iso === 'string' && ISO.test(iso) && !Number.isNaN(Date.parse(`${iso}T00:00:00Z`))
  && new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso;

const dm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const dma = (iso) => `${dm(iso)}/${iso.slice(0, 4)}`;
const precio = (n) => n.toLocaleString('es-UY', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const porciento = (n) => n.toLocaleString('es-UY', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Variación en %, con un decimal. null si falta alguno.
export function variacion(actual, anterior) {
  if (actual == null || anterior == null || Number(anterior) === 0) return null;
  return Math.round(((Number(actual) - Number(anterior)) / Number(anterior)) * 1000) / 10;
}

/**
 * @param {{ semana: { desde, hasta, valores }, anterior?: { valores } | null, hoy: string }} p
 *   hoy en 'AAAA-MM-DD' (Uruguay).
 * @param {{ rangos?, variacionMaxima? }} reglas para los tests o para ajustar.
 * @returns {{ estado: 'OK'|'EN_REVISION'|'ERROR', errores: string[], marcas: object[], avisos: string[] }}
 */
export function validarSemana({ semana, anterior = null, hoy }, reglas = {}) {
  const rangos = reglas.rangos ?? RANGOS;
  const maxima = reglas.variacionMaxima ?? VARIACION_MAXIMA;
  const errores = [];
  const marcas = [];
  const avisos = [];
  const valores = semana?.valores ?? {};

  const { desde, hasta } = semana ?? {};
  if (!fechaValida(desde) || !fechaValida(hasta)) {
    errores.push('La semana no tiene fechas válidas.');
  } else {
    if (sumarDias(desde, 6) !== hasta) errores.push(`La semana del ${dma(desde)} al ${dma(hasta)} no dura 7 días.`);
    if (hoy && hasta > hoy) errores.push(`La semana termina el ${dma(hasta)}, que todavía no pasó.`);
  }

  for (const ind of INDICADORES) {
    if (valores[ind.clave] != null) continue;
    if (ind.obligatorio) errores.push(`Falta el precio de ${ind.nombre}.`);
    else avisos.push(`No vino el precio de ${ind.nombre}.`);
  }

  for (const [clave, bruto] of Object.entries(valores)) {
    if (bruto == null) continue;
    const ind = indicador(clave);
    if (!ind) {
      avisos.push(`Precio desconocido: ${clave}. No se guarda.`);
      continue;
    }
    const valor = Number(bruto);
    const [min, max] = rangos[ind.unidad];
    if (!(valor >= min && valor <= max)) {
      marcas.push({
        indicador: clave,
        motivo: 'RANGO',
        valor,
        rango: [min, max],
        texto: `${ind.nombre}: ${precio(valor)} ${NOMBRE_UNIDAD[ind.unidad]}, fuera de lo esperable (de ${min} a ${max}).`,
      });
    }
    const ant = anterior?.valores?.[clave];
    const v = variacion(valor, ant);
    if (v != null && Math.abs(v) > maxima * 100) {
      marcas.push({
        indicador: clave,
        motivo: 'VARIACION',
        valor,
        anterior: Number(ant),
        variacion: v,
        texto: `${ind.nombre}: ${v > 0 ? 'subió' : 'bajó'} ${porciento(Math.abs(v))} % contra la semana anterior (de ${precio(Number(ant))} a ${precio(valor)}).`,
      });
    }
  }

  const estado = errores.length ? 'ERROR' : marcas.length ? 'EN_REVISION' : 'OK';
  return { estado, errores, marcas, avisos };
}

// Solo las claves conocidas, en el orden de los indicadores.
export function valoresConocidos(valores) {
  return Object.fromEntries(CLAVES.filter((c) => valores?.[c] != null).map((c) => [c, valores[c]]));
}
