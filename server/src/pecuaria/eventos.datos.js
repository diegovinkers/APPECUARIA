// Los datos propios de cada tipo de evento (diseño
// docs/superpowers/specs/2026-11-20-eventos-design.md, "3. Datos"). Se validan
// con zod según la clave del tipo:
//   - los comunes, una vez por carga (el producto de la vacuna, la ración);
//   - los de cada lote (el peso de la pesada, las cabezas contadas...).
// Un tipo creado en Configuración (sin clave conocida) solo pide las cabezas.
// Todo es puro: lo usan el servicio (eventos.service.js) y los tests.
import { z } from 'zod';

const textoOpcional = (max, que) =>
  z
    .preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), z.string({ error: `${que} tiene que ser un texto` }).trim().max(max, `${que} no puede superar los ${max} caracteres`).nullish())
    .transform((v) => v ?? null);

// Acepta 250, "250" o "250,5".
const numero = (schema) =>
  z.preprocess((v) => (v === '' || v == null ? undefined : typeof v === 'string' ? Number(v.trim().replace(',', '.')) : v), schema);

// Vacío ("", null o ausente) = sin dato.
const entero = (que, min) =>
  numero(
    z
      .int({ error: `${que} tienen que ser un número entero` })
      .min(min, min === 0 ? `${que} no pueden ser negativas` : `${que} tienen que ser al menos ${min}`)
      .max(1_000_000, `${que}: son demasiadas`)
      .optional(),
  );

// --- Comunes (una vez por carga) ---

const producto = z.object({ producto: textoOpcional(120, 'El producto') });

export const COMUNES = {
  VACUNA_AFTOSA: producto,
  VACUNA_CARBUNCLO: producto,
  TRATAMIENTO: producto,
  ALIMENTACION: z.object({
    racion: textoOpcional(120, 'La ración'),
    kgPorCabezaDia: numero(
      z
        .number({ error: 'Los kg por cabeza por día tienen que ser un número' })
        .positive('Los kg por cabeza por día tienen que ser mayores que cero')
        .max(100, 'Son demasiados kg por cabeza por día')
        .optional(),
    ).transform((v) => v ?? null),
  }),
};

// --- De cada lote ---

export const POR_LOTE = {
  PESADA: z.object({
    pesoPromedioKg: numero(
      z.number({ error: 'Escribí el peso promedio' }).positive('El peso tiene que ser mayor que cero').max(2000, 'El peso es demasiado alto'),
    ),
    pesadas: entero('Las pesadas', 1).optional(),
  }),
  RECUENTO: z.object({
    contadas: entero('Las cabezas contadas', 0).optional(),
    motivo: textoOpcional(120, 'El motivo'),
  }),
  ECOGRAFIA: z.object({
    prenadas: entero('Las preñadas', 0).optional(),
    vacias: entero('Las vacías', 0).optional(),
  }),
};

// Los demás: cuántas cabezas (por defecto, las del lote).
const SOLO_CABEZAS = z.object({ cabezas: entero('Las cabezas', 1).optional() });

// Valida con el schema y devuelve los datos limpios, o el mensaje del primer error.
function validar(schema, valor, prefijo = '') {
  const r = schema.safeParse(valor ?? {});
  if (r.success) return { datos: r.data };
  return { error: `${prefijo}${r.error.issues[0].message}` };
}

export const validarComunes = (clave, datos) => validar(COMUNES[clave] ?? z.object({}), datos);

// La línea de un lote, ya con lo que hace falta para registrarla:
//   { cabezas, datos, parte, cambia: { cabezas?, pesoPromedioKg? } | null }
// lote: { nombre, cabezas, pesoPromedioKg } (lo que tiene hoy).
// Devuelve { error } si algo no cierra.
export function lineaDelLote(clave, linea, lote) {
  const n = lote.cabezas;
  const en = ` (lote ${lote.nombre})`;
  if (clave === 'PESADA') {
    if (linea?.pesoPromedioKg == null || linea.pesoPromedioKg === '') return { error: `Escribí el peso promedio del lote ${lote.nombre}` };
    const { datos, error } = validar(POR_LOTE.PESADA, linea);
    if (error) return { error: error + en };
    const pesadas = datos.pesadas ?? n;
    if (pesadas > n) return { error: `El lote ${lote.nombre} tiene ${n} cabezas: no se pueden haber pesado ${pesadas}` };
    return {
      cabezas: pesadas,
      parte: pesadas < n,
      datos: { pesoPromedioKg: datos.pesoPromedioKg, pesoAnteriorKg: lote.pesoPromedioKg ?? null, pesadas, cabezasLote: n },
      // El peso nuevo es el promedio de los que se pesaron (una muestra).
      cambia: { pesoPromedioKg: datos.pesoPromedioKg },
    };
  }
  if (clave === 'RECUENTO') {
    const { datos, error } = validar(POR_LOTE.RECUENTO, linea);
    if (error) return { error: error + en };
    const contadas = datos.contadas ?? n;
    const diferencia = contadas - n;
    if (diferencia !== 0 && !datos.motivo) return { error: `Hay diferencia en el lote ${lote.nombre} (había ${n}, se contaron ${contadas}): escribí el motivo` };
    return {
      cabezas: contadas,
      parte: false,
      datos: { anteriores: n, contadas, diferencia, motivo: datos.motivo },
      cambia: diferencia !== 0 ? { cabezas: contadas } : null,
    };
  }
  if (clave === 'ECOGRAFIA') {
    const { datos, error } = validar(POR_LOTE.ECOGRAFIA, linea);
    if (error) return { error: error + en };
    const prenadas = datos.prenadas ?? 0;
    const vacias = datos.vacias ?? 0;
    const suma = prenadas + vacias;
    if (suma < 1) return { error: `Escribí cuántas preñadas y cuántas vacías hay en el lote ${lote.nombre}` };
    if (suma > n) return { error: `El lote ${lote.nombre} tiene ${n} cabezas: preñadas y vacías suman ${suma}` };
    return { cabezas: suma, parte: suma < n, datos: { prenadas, vacias }, cambia: null };
  }
  const { datos, error } = validar(SOLO_CABEZAS, linea);
  if (error) return { error: error + en };
  const cabezas = datos.cabezas ?? n;
  if (cabezas > n) return { error: `El lote ${lote.nombre} solo tiene ${n} cabezas` };
  return { cabezas, parte: cabezas < n, datos: {}, cambia: null };
}

const fmt = (n, decimales = 0) => Number(n).toLocaleString('es-UY', { maximumFractionDigits: decimales });

// Lo propio de un evento, en una línea corta (lista, historial):
//   Pesada:   "262 kg (antes 250) · 80 pesadas"
//   Recuento: "había 120, se contaron 116 (se perdieron)"
//   Ecografía: "45 preñadas · 5 vacías"
//   Vacuna:   "Producto: Aftosa bivalente"
export function textoDatos(clave, datos = {}) {
  const d = datos ?? {};
  if (clave === 'PESADA') {
    const antes = d.pesoAnteriorKg != null ? ` (antes ${fmt(d.pesoAnteriorKg, 1)})` : '';
    const muestra = d.pesadas != null && d.cabezasLote != null && d.pesadas < d.cabezasLote ? ` · ${fmt(d.pesadas)} de ${fmt(d.cabezasLote)} pesadas` : '';
    return `${fmt(d.pesoPromedioKg, 1)} kg${antes}${muestra}`;
  }
  if (clave === 'RECUENTO') {
    if (!d.diferencia) return `se contaron ${fmt(d.contadas)}: sin diferencia`;
    return `había ${fmt(d.anteriores)}, se contaron ${fmt(d.contadas)}${d.motivo ? ` (${d.motivo})` : ''}`;
  }
  if (clave === 'ECOGRAFIA') return `${fmt(d.prenadas ?? 0)} preñadas · ${fmt(d.vacias ?? 0)} vacías`;
  if (clave === 'ALIMENTACION') {
    const partes = [d.racion, d.kgPorCabezaDia != null && `${fmt(d.kgPorCabezaDia, 2)} kg/cab/día`].filter(Boolean);
    return partes.join(' · ');
  }
  if (d.producto) return `Producto: ${d.producto}`;
  return '';
}
