// Los datos de cada etapa de un proceso (diseño
// docs/superpowers/specs/2026-11-20-procesos-design.md §5), validados con zod
// como los de los eventos (eventos.datos.js), y su texto corto para la ficha.
// Todo puro.
import { z } from 'zod';

// Acepta 6, "6" o "6,0". Vacío ("", null o ausente) = sin dato.
const numero = (schema) =>
  z.preprocess((v) => (v === '' || v == null ? undefined : typeof v === 'string' ? Number(v.trim().replace(',', '.')) : v), schema);

const entero = (que, min) =>
  numero(
    z
      .int({ error: `${que} tienen que ser un número entero` })
      .min(min, min === 0 ? `${que} no pueden ser negativas` : `${que} tienen que ser al menos ${min}`)
      .max(1_000_000, `${que}: son demasiadas`)
      .optional(),
  );

const CABEZAS = z.object({ cabezas: entero('Las cabezas', 1) });

function validar(schema, valor, en) {
  const r = schema.safeParse(valor ?? {});
  if (r.success) return { datos: r.data };
  return { error: `${r.error.issues[0].message}${en}` };
}

// Una línea de las etapas que solo anotan (repaso, fin del servicio, aborto):
// { cabezas, parte, datos } o { error }. lote: { nombre, cabezas } (hoy).
// El aborto pide cuántas; las demás, por defecto todo el lote.
export function lineaSimple(etapa, linea, lote) {
  const en = ` (lote ${lote.nombre})`;
  const { datos, error } = validar(CABEZAS, linea, en);
  if (error) return { error };
  if (etapa === 'ABORTO' && datos.cabezas == null) return { error: `Escribí cuántas abortaron${en}` };
  const cabezas = datos.cabezas ?? lote.cabezas;
  if (cabezas > lote.cabezas) return { error: `El lote ${lote.nombre} tiene ${lote.cabezas} cabezas` };
  return { cabezas, parte: cabezas < lote.cabezas, datos: {} };
}

const fmt = (n) => Number(n ?? 0).toLocaleString('es-UY');
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const nombreMes = (mes) => (mes === 'sin' ? 'sin mes' : MESES[Number(mes.slice(5, 7)) - 1]);
export const MODALIDAD = { TOROS: 'Entore con toros', IA: 'Inseminación', IATF: 'IATF' };

// Lo de un ancla en una línea corta (la ficha y la lista de eventos).
export function textoAncla(etapa, datos = {}, cabezas = 0) {
  const d = datos ?? {};
  switch (etapa) {
    case 'INICIO':
      return `${MODALIDAD[d.modalidad] ?? 'Servicio'} · ${fmt(cabezas)} cab.`;
    case 'DIAGNOSTICO': {
      const p = d.prenadas;
      const total = typeof p === 'object' && p ? Object.values(p).reduce((s, n) => s + Number(n || 0), 0) : Number(p || 0);
      const porMes =
        typeof p === 'object' && p && Object.keys(p).some((k) => k !== 'sin')
          ? ` (${Object.entries(p)
              .filter(([, n]) => n > 0)
              .map(([mes, n]) => `${nombreMes(mes)} ${fmt(n)}`)
              .join(' · ')})`
          : '';
      return `${fmt(total)} preñadas${porMes} · ${fmt(d.vacias)} vacías`;
    }
    case 'REVISION':
      return [d.aPrenadas && `${fmt(d.aPrenadas)} pasan a preñadas`, d.aVacias && `${fmt(d.aVacias)} pasan a vacías`].filter(Boolean).join(' · ') || 'sin cambios';
    case 'ABORTO':
      return `${fmt(cabezas)} abortos`;
    case 'PARICION':
      return `${fmt(d.madres)} paridas · ${fmt(d.machos)} machos y ${fmt(d.hembras)} hembras${d.muertos ? ` · ${fmt(d.muertos)} nacidos muertos` : ''}`;
    case 'FIN_PARICION':
      return d.falladas ? `${fmt(d.falladas)} no parieron` : 'parieron todas';
    case 'DESTETE':
      return `${fmt(d.destetados ?? cabezas)} destetados${d.pesoPromedioKg ? ` · ${fmt(d.pesoPromedioKg)} kg` : ''}`;
    default:
      return `${fmt(cabezas)} cab.`;
  }
}
