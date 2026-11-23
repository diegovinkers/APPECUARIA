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

const MES = /^\d{4}-\d{2}$/;
const ENTERO_CERO = numero(z.int({ error: 'tienen que ser un número entero' }).min(0, 'no pueden ser negativas').max(1_000_000, 'son demasiadas').optional());

// Una línea del diagnóstico: { cabezas, datos: { metodo, prenadas: { [mes | 'sin']: n }, vacias } }
// o { error }. Las preñadas vienen por mes de parición esperado (o 'sin').
export function lineaDiagnostico(linea, lote, metodo) {
  const en = ` (lote ${lote.nombre})`;
  const prenadas = {};
  const crudo = linea?.prenadas ?? {};
  if (typeof crudo !== 'object' || Array.isArray(crudo)) return { error: `Las preñadas tienen que venir por mes${en}` };
  for (const [mes, valor] of Object.entries(crudo)) {
    if (mes !== 'sin' && !MES.test(mes)) return { error: `El mes ${mes} no es válido${en}` };
    const r = ENTERO_CERO.safeParse(valor);
    if (!r.success) return { error: `Las preñadas ${r.error.issues[0].message}${en}` };
    if (r.data) prenadas[mes] = r.data;
  }
  const v = ENTERO_CERO.safeParse(linea?.vacias);
  if (!v.success) return { error: `Las vacías ${v.error.issues[0].message}${en}` };
  const vacias = v.data ?? 0;
  const total = Object.values(prenadas).reduce((s, n) => s + n, 0) + vacias;
  if (total < 1) return { error: `Escribí cuántas preñadas y cuántas vacías hay${en}` };
  if (total > lote.cabezas) return { error: `El lote ${lote.nombre} tiene ${lote.cabezas} cabezas: preñadas y vacías suman ${total}` };
  return { cabezas: total, datos: { metodo: metodo ?? 'ECOGRAFIA', prenadas, vacias } };
}

// Una línea de la revisión: { cabezas, datos: { aPrenadas, aVacias }, aLoteId } o { error }.
export function lineaRevision(linea, lote) {
  const en = ` (lote ${lote.nombre})`;
  const a = ENTERO_CERO.safeParse(linea?.aPrenadas);
  const b = ENTERO_CERO.safeParse(linea?.aVacias);
  if (!a.success || !b.success) return { error: `Las cabezas de la revisión tienen que ser números enteros${en}` };
  const aPrenadas = a.data ?? 0;
  const aVacias = b.data ?? 0;
  if (aPrenadas + aVacias < 1) return { error: `Escribí cuántas cambian${en}` };
  if (aPrenadas + aVacias > lote.cabezas) return { error: `El lote ${lote.nombre} tiene ${lote.cabezas} cabezas` };
  return { cabezas: aPrenadas + aVacias, datos: { aPrenadas, aVacias }, aLoteId: linea.aLoteId ?? null };
}

// Una línea de la parición: { datos: { madres, machos, hembras, muertos, madresMuertas }, avisos } o { error }.
// lote: { nombre, cabezas } (las que quedan sin parir). Vacío = 0.
export function lineaParicion(linea, lote) {
  const en = ` (lote ${lote.nombre})`;
  const datos = {};
  for (const [campo, que] of [
    ['madres', 'Las madres que parieron'],
    ['machos', 'Los terneros'],
    ['hembras', 'Las terneras'],
    ['muertos', 'Los nacidos muertos'],
    ['madresMuertas', 'Las madres muertas'],
  ]) {
    const r = ENTERO_CERO.safeParse(linea?.[campo]);
    if (!r.success) return { error: `${que} ${r.error.issues[0].message}${en}` };
    datos[campo] = r.data ?? 0;
  }
  const { madres, machos, hembras, muertos, madresMuertas } = datos;
  if (madres + madresMuertas + machos + hembras + muertos < 1) return { error: `Escribí cuántas parieron${en}` };
  if (madres + madresMuertas > lote.cabezas) {
    return { error: `En el lote ${lote.nombre} quedan ${lote.cabezas} sin parir: no pueden haber parido ${madres} y muerto ${madresMuertas}` };
  }
  const nacidos = machos + hembras + muertos;
  if (nacidos < madres) return { error: `En el lote ${lote.nombre} parieron ${madres} madres, pero nacieron ${nacidos} (vivos y muertos)` };
  const avisos = nacidos > madres + madresMuertas ? [`En el lote ${lote.nombre} nacieron más terneros que madres: ¿mellizos?`] : [];
  // La caravana de los terneros: dato opcional, texto libre (fase 7).
  const caravanas = linea?.caravanas == null ? '' : String(linea.caravanas).trim();
  if (caravanas.length > 2000) return { error: `Las caravanas son demasiado largas (máximo 2000 letras)${en}` };
  return { datos, avisos, ...(caravanas && { caravanas }) };
}

const fmt = (n) => Number(n ?? 0).toLocaleString('es-UY');
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const nombreMes = (mes) => (mes === 'sin' ? 'sin mes' : MESES[Number(mes.slice(5, 7)) - 1]);
// IA: los procesos de antes de los ajustes del 20/11 (ahora es IATF).
export const MODALIDAD = { TOROS: 'Entore con toros', IA: 'IATF', IATF: 'IATF' };

// Lo de un ancla en una línea corta (la ficha y la lista de eventos).
export function textoAncla(etapa, datos = {}, cabezas = 0) {
  const d = datos ?? {};
  switch (etapa) {
    case 'INICIO':
      return `${MODALIDAD[d.modalidad] ?? 'Servicio'} · ${fmt(cabezas)} cab.${
        d.reparto?.length ? ` · repartidas: ${d.reparto.map((r) => `${r.potrero} ${fmt(r.cabezas)}${r.toros ? ` (${fmt(r.toros)} ${r.toros === 1 ? 'toro' : 'toros'})` : ''}`).join(', ')}` : ''
      }${textoToros(d)}`;
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
    case 'DECISION':
      return { VENTA: 'venta', INVERNADA: 'a invernada', REENTORE: 'para volver a servir', SALEN: 'salen del proceso', MOVER: 'a otro potrero' }[d.destino] ?? 'decisión';
    case 'INSEMINACION':
      return `${fmt(cabezas)} inseminadas`;
    case 'FIN_INSEMINACION':
      return `${fmt(cabezas)} sin inseminar: ${d.destino === 'REPASO' ? 'al repaso con toro' : 'salen del proceso'}`;
    case 'PARICION':
      return `${fmt(d.madres)} paridas · ${fmt(d.machos)} machos y ${fmt(d.hembras)} hembras${d.muertos ? ` · ${fmt(d.muertos)} nacidos muertos` : ''}${d.potrero ? ` · a ${d.potrero}` : ''}${d.caravanas ? ` · caravanas: ${d.caravanas}` : ''}`;
    case 'FIN_PARICION':
      return d.falladas ? `${fmt(d.falladas)} no parieron` : 'parieron todas';
    case 'DESTETE':
      return `${fmt(d.destetados ?? cabezas)} destetados${d.pesoPromedioKg ? ` · ${fmt(d.pesoPromedioKg)} kg` : ''}`;
    case 'TANDA':
      return `Otra tanda · ${fmt(cabezas)} cab.${textoToros(d)}`;
    case 'TOROS':
      return textoToros(d).replace(/^ · /, '') || 'toros';
    case 'BAJA':
      return `${fmt(cabezas)} ${d.quien === 'CRIA' ? (cabezas === 1 ? 'cría muerta' : 'crías muertas') : cabezas === 1 ? 'vaca muerta' : 'vacas muertas'}${d.causa ? ` · ${d.causa}` : ''}`;
    default:
      // El fin del servicio (y otras) con los toros que salieron.
      return `${fmt(cabezas)} cab.${textoToros(d)}`;
  }
}

// Los toros de una carga (datos.toros: [{ identificacion, accion: ENTRA | SALE }]):
// " · entran T-014 y T-022 · sale T-009".
export function textoToros(d = {}) {
  const lista = d?.toros ?? [];
  const de = (accion) => lista.filter((t) => t.accion === accion).map((t) => t.identificacion);
  const y = (nombres) => (nombres.length > 1 ? `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}` : nombres[0]);
  const partes = [];
  const entran = de('ENTRA');
  const salen = de('SALE');
  if (entran.length) partes.push(`${entran.length === 1 ? 'entra el toro' : 'entran los toros'} ${y(entran)}`);
  if (salen.length) partes.push(`${salen.length === 1 ? 'sale el toro' : 'salen los toros'} ${y(salen)}`);
  return partes.length ? ` · ${partes.join(' · ')}` : '';
}

// Los toros que entran o salen en una carga: [{ toroId, potreroId? }].
export const torosSchema = z
  .array(
    z.object({
      toroId: z.int({ error: 'El toro no es válido' }).positive('El toro no es válido'),
      potreroId: z.int({ error: 'El potrero del toro no es válido' }).positive('El potrero del toro no es válido').optional(),
    }),
    { error: 'Los toros tienen que ser una lista' },
  )
  .max(50, 'Demasiados toros juntos')
  .refine((lista) => new Set(lista.map((t) => t.toroId)).size === lista.length, 'Hay un toro elegido dos veces');

// Valida una lista de toros ({ lista } o { error }).
export function listaToros(valor) {
  if (valor == null) return { lista: [] };
  const r = torosSchema.safeParse(valor);
  return r.success ? { lista: r.data } : { error: r.error.issues[0].message };
}
