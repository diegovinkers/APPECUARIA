// El análisis del feedlot (confinamiento), corral por corral (pedido de
// Diego, 19/11). Un feedlot se mira distinto que una estancia: no importa la
// carga por hectárea sino cuánto hace que entraron los animales, cuánto pesan
// hoy y cuándo salen.
//   Días de encierre  = hoy − fecha de entrada del lote
//   Peso estimado hoy = peso de entrada + días × GMD (parámetro GMD_FEEDLOT_KG).
//                       Con una pesada (eventos, 20/11): el peso de la última
//                       pesada + días desde la pesada × GMD.
//   GMD real          = con una pesada: (peso de la pesada − peso de la pesada
//                       anterior, o si no hay, el de entrada) ÷ los días entre las dos
//   Salida probable   = fecha de entrada + días del ciclo (CICLO_FEEDLOT_DIAS)
//   m de comedero/cab = metros de comedero del corral ÷ cabezas del corral
//   cm de comedero/cab = lo mismo en centímetros (tabla de Corrales, 25/11),
//                       contra el objetivo FEEDLOT_CM_COMEDERO: menos es "apretado"
//   Valor             = con el peso estimado y el precio de la categoría
//   Etapa             = según los días de encierre (20/11): Adaptación (hasta
//                       FEEDLOT_ADAPTACION_DIAS), Engorde (hasta
//                       FEEDLOT_ENGORDE_DIAS), Terminación (hasta el ciclo) y
//                       Para salir (más del ciclo). Sin fecha de entrada: "Sin fecha".
// Si falta un dato, lo que depende de él queda en null ("—"): no se inventa.
// Nada se guarda calculado.
import { prisma } from '../db.js';
import { badRequest, notFound } from '../errors.js';
import { calcularPotrero, valorVenta } from './calculos.js';
import { aFecha, fechaISO, hoyISO } from './importaciones.service.js';
import { findCampo } from './lugares.repository.js';
import { parametrosCarga } from './stock.service.js';
import { ultimasPesadas } from './eventos.service.js';

// Valores de CIGAM (TEA4SISTMANEJO), si el parámetro no está cargado.
export const GMD_POR_DEFECTO = 1.5;
export const CICLO_POR_DEFECTO = 120;
// Las etapas del encierre, si los parámetros no están cargados.
export const ADAPTACION_POR_DEFECTO = 20;
export const ENGORDE_POR_DEFECTO = 90;
// Objetivo de centímetros de comedero por cabeza (provisorio, 25/11: las
// referencias dicen 30 a 50 cm con entrega diaria; falta que lo confirme el jefe).
export const CM_COMEDERO_POR_DEFECTO = 30;
// La salida se marca en ámbar suave si falta menos de una semana; si ya pasó,
// el corral está "atrasado" (ámbar fuerte).
export const DIAS_AVISO_SALIDA = 7;
// "Salen en los próximos 30 días": de hoy a hoy + 30 (sin los atrasados).
export const DIAS_PROXIMAS_SALIDAS = 30;
// "Últimas ventas": las de los últimos 90 días.
export const DIAS_ULTIMAS_VENTAS = 90;
// Los parámetros del feedlot (tabla `parametro`) y su valor si no están.
export const PARAMETROS_FEEDLOT = {
  gmdKg: ['GMD_FEEDLOT_KG', GMD_POR_DEFECTO],
  cicloDias: ['CICLO_FEEDLOT_DIAS', CICLO_POR_DEFECTO],
  adaptacionDias: ['FEEDLOT_ADAPTACION_DIAS', ADAPTACION_POR_DEFECTO],
  engordeDias: ['FEEDLOT_ENGORDE_DIAS', ENGORDE_POR_DEFECTO],
  cmObjetivo: ['FEEDLOT_CM_COMEDERO', CM_COMEDERO_POR_DEFECTO],
};

const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;
const DIA_MS = 86_400_000;
const aDia = (iso) => Date.parse(`${iso}T00:00:00Z`);

// Días entre dos fechas "AAAA-MM-DD" (b − a).
export const diasEntre = (a, b) => Math.round((aDia(b) - aDia(a)) / DIA_MS);
export const sumarDias = (iso, dias) => new Date(aDia(iso) + dias * DIA_MS).toISOString().slice(0, 10);

// --- Etapas del encierre ---

export const ETAPAS = ['ADAPTACION', 'ENGORDE', 'TERMINACION', 'PARA_SALIR', 'SIN_FECHA'];

// Función pura: la etapa de un lote según sus días de encierre. Los límites
// son "hasta" (inclusive): con 20 días todavía está en adaptación; con 121
// (ciclo de 120) ya está para salir. Sin días (sin fecha de entrada): SIN_FECHA.
export function etapaDeEncierre(dias, { adaptacionDias = ADAPTACION_POR_DEFECTO, engordeDias = ENGORDE_POR_DEFECTO, cicloDias = CICLO_POR_DEFECTO } = {}) {
  if (dias == null) return 'SIN_FECHA';
  if (dias <= adaptacionDias) return 'ADAPTACION';
  if (dias <= engordeDias) return 'ENGORDE';
  if (dias <= cicloDias) return 'TERMINACION';
  return 'PARA_SALIR';
}

// Adaptación < engorde < ciclo. Devuelve el mensaje de error, o null si está bien.
export function problemaEtapas({ adaptacionDias, engordeDias, cicloDias }) {
  if (!(adaptacionDias < engordeDias)) return `La adaptación (${adaptacionDias} días) tiene que ser más corta que el engorde (${engordeDias} días)`;
  if (!(engordeDias < cicloDias)) return `El engorde (${engordeDias} días) tiene que terminar antes que el ciclo (${cicloDias} días)`;
  return null;
}

// Las columnas de la tabla de categorías del feedlot, para el front:
//   clave, nombre (título), corto (título en el celular), detalle (qué días
//   cubre), compu (solo en la compu), celular (solo en el celular) y suma (las
//   columnas que junta). En el celular no entran todas: Adaptación y Engorde
//   van juntas en "Hasta N d". "Sin fecha" solo aparece si hay algún lote así.
export function columnasEtapas({ adaptacionDias, engordeDias, cicloDias }, conSinFecha) {
  return [
    { clave: 'ADAPTACION', nombre: 'Adaptación', detalle: `0 a ${adaptacionDias} días`, compu: true },
    { clave: 'ENGORDE', nombre: 'Engorde', detalle: `${adaptacionDias + 1} a ${engordeDias} días`, compu: true },
    { clave: 'HASTA_ENGORDE', nombre: `Hasta ${engordeDias} d`, detalle: `0 a ${engordeDias} días`, celular: true, suma: ['ADAPTACION', 'ENGORDE'] },
    { clave: 'TERMINACION', nombre: 'Terminación', corto: 'Termin.', detalle: `${engordeDias + 1} a ${cicloDias} días` },
    { clave: 'PARA_SALIR', nombre: 'Para salir', detalle: `más de ${cicloDias} días` },
    ...(conSinFecha ? [{ clave: 'SIN_FECHA', nombre: 'Sin fecha', detalle: 'el lote no tiene fecha de entrada' }] : []),
  ];
}

const vacioEtapas = () => ({ ...Object.fromEntries(ETAPAS.map((e) => [e, 0])), total: 0 });

// Función pura: la tabla de categorías del feedlot (como el Resumen de una
// estancia, con las etapas del encierre en vez de CN / Verdeos / Corral).
// Sale de las filas de analisisFeedlot: así el valor es el mismo que el del
// análisis por corral, con el peso estimado de hoy.
// etapas: { adaptacionDias, engordeDias, cicloDias }.
export function resumenPorEtapas(analisis, etapas) {
  const filas = new Map();
  const totales = vacioEtapas();
  for (const f of analisis.filas) {
    const etapa = etapaDeEncierre(f.diasEncierre, etapas);
    if (!filas.has(f.categoriaId)) {
      filas.set(f.categoriaId, {
        orden: f.categoriaOrden ?? 0,
        categoriaId: f.categoriaId,
        categoria: f.categoria,
        ...vacioEtapas(),
        valorUsd: 0,
        valorCompleto: true,
      });
    }
    const fila = filas.get(f.categoriaId);
    fila[etapa] += f.cabezas;
    fila.total += f.cabezas;
    fila.valorUsd = r2(fila.valorUsd + (f.valorUsd ?? 0));
    fila.valorCompleto &&= f.valorCompleto;
    totales[etapa] += f.cabezas;
    totales.total += f.cabezas;
  }
  return {
    fecha: analisis.fecha,
    tipo: 'FEEDLOT',
    etapas,
    columnas: columnasEtapas(etapas, totales.SIN_FECHA > 0),
    filas: [...filas.values()].sort((a, b) => a.orden - b.orden || a.categoria.localeCompare(b.categoria)).map(({ orden, ...fila }) => fila),
    totales,
    valor: { usd: analisis.totales.valorUsd ?? 0, completo: analisis.totales.valorCompleto },
    // Un corral no tiene hectáreas: no hay carga por grupo.
    porGrupo: [],
  };
}

// Función pura: lo que dicen las pesadas de un lote. l.pesadas: las últimas
// (la más nueva primero), [{ fecha, pesoKg }]. Devuelve { pesada, gmdKg }: la
// última pesada (o null) y la ganancia diaria real entre la pesada anterior
// (o la entrada al corral) y esta (null si no se puede calcular).
export function pesoReal(l, pesoEntrada = l.pesoEntradaKg == null ? null : Number(l.pesoEntradaKg)) {
  const [pesada = null, anterior = null] = l.pesadas ?? [];
  if (!pesada) return { pesada: null, gmdKg: null };
  const desde = anterior ?? (l.fechaEntrada && pesoEntrada != null ? { fecha: l.fechaEntrada, pesoKg: pesoEntrada } : null);
  const dias = desde ? diasEntre(desde.fecha, pesada.fecha) : 0;
  return { pesada, gmdKg: desde && dias > 0 ? r2((pesada.pesoKg - desde.pesoKg) / dias) : null };
}

// Función pura: el análisis de una lista de corrales a una fecha.
// corrales: [{ id, nombre, metrosComedero, campo: { id, sigla, nombre }, fecha,
//   lineas: [{ loteId, lote, categoriaId, categoria, cabezas, pesoPromedioKg,
//   fechaEntrada, pesoEntradaKg, pesadas? }] }] (pesadas: ver pesoReal)
// hoy: "AAAA-MM-DD". parametros: lo de parametrosCarga() (para el valor; sin
// él, el valor queda en null).
export function analisisFeedlot({ corrales, hoy, gmdKg = GMD_POR_DEFECTO, cicloDias = CICLO_POR_DEFECTO, parametros = null }) {
  const filas = [];
  const vacios = [];
  let fecha = null;
  for (const c of corrales) {
    const lineas = (c.lineas ?? []).filter((l) => l.cabezas > 0);
    if (c.fecha && (!fecha || c.fecha > fecha)) fecha = c.fecha;
    if (!lineas.length) {
      vacios.push({ corralId: c.id, corral: c.nombre, campo: c.campo });
      continue;
    }
    const cabezasCorral = lineas.reduce((s, l) => s + l.cabezas, 0);
    const metros = c.metrosComedero == null ? null : Number(c.metrosComedero);
    for (const l of lineas) {
      const dias = l.fechaEntrada ? diasEntre(l.fechaEntrada, hoy) : null;
      const pesoEntrada = l.pesoEntradaKg == null ? null : Number(l.pesoEntradaKg);
      const real = pesoReal(l, pesoEntrada);
      // Desde la última pesada, si hay; si no, desde la entrada.
      const pesoEstimado = real.pesada
        ? r1(real.pesada.pesoKg + Math.max(diasEntre(real.pesada.fecha, hoy), 0) * gmdKg)
        : pesoEntrada != null && dias != null
          ? r1(pesoEntrada + Math.max(dias, 0) * gmdKg)
          : null;
      const salida = l.fechaEntrada ? sumarDias(l.fechaEntrada, cicloDias) : null;
      const faltan = salida ? diasEntre(hoy, salida) : null;
      // El valor, con el peso de hoy (estimado) o, si no se puede estimar, el
      // del lote (o el de la categoría, como en el resto de la app: con "≈").
      const pesoValor = pesoEstimado ?? (l.pesoPromedioKg == null ? null : Number(l.pesoPromedioKg));
      const valor = parametros
        ? calcularPotrero({ hectareas: null, hectareasAConfirmar: true, lineas: [{ categoriaId: l.categoriaId, cabezas: l.cabezas, pesoPromedioKg: pesoValor }] }, parametros)
        : null;
      filas.push({
        corralId: c.id,
        corral: c.nombre,
        campo: c.campo,
        loteId: l.loteId,
        lote: l.lote,
        categoriaId: l.categoriaId,
        categoria: l.categoria,
        categoriaOrden: l.categoriaOrden ?? 0,
        cabezas: l.cabezas,
        fechaEntrada: l.fechaEntrada ?? null,
        diasEncierre: dias,
        pesoEntradaKg: pesoEntrada,
        pesoEstimadoKg: pesoEstimado,
        // La última pesada (null si no hay) y la ganancia diaria real.
        ultimaPesada: real.pesada,
        gmdRealKg: real.gmdKg,
        salidaProbable: salida,
        diasParaSalida: faltan,
        // Atrasado: la salida probable ya pasó. Cerca: sale en menos de una semana.
        atrasado: faltan != null && faltan < 0,
        salidaCerca: faltan != null && faltan >= 0 && faltan < DIAS_AVISO_SALIDA,
        metrosComedero: metros,
        mComederoPorCabeza: metros != null ? r2(metros / cabezasCorral) : null,
        cmComederoPorCabeza: metros != null ? Math.round((metros * 100) / cabezasCorral) : null,
        valorUsd: valor?.valorUsd ?? null,
        valorCompleto: valor?.valorCompleto ?? false,
        // Con "≈": sale de un peso estimado (el de hoy o el de la categoría).
        valorAprox: Boolean(valor && (pesoEstimado != null || valor.kilosEstimados)),
      });
    }
  }

  const conDias = filas.filter((f) => f.diasEncierre != null);
  const conGmd = filas.filter((f) => f.gmdRealKg != null);
  const cabConGmd = conGmd.reduce((s, f) => s + f.cabezas, 0);
  const cabConDias = conDias.reduce((s, f) => s + f.cabezas, 0);
  const corralesCon = new Set(filas.map((f) => f.corralId));
  // Un corral está atrasado si alguno de sus lotes lo está. Sale en los
  // próximos 30 días si alguno sale entre hoy y hoy + 30 (y no está atrasado).
  const atrasados = new Set(filas.filter((f) => f.atrasado).map((f) => f.corralId));
  const proximos = new Set(
    filas
      .filter((f) => f.diasParaSalida != null && f.diasParaSalida >= 0 && f.diasParaSalida <= DIAS_PROXIMAS_SALIDAS && !atrasados.has(f.corralId))
      .map((f) => f.corralId),
  );
  return {
    hoy,
    fecha,
    gmdKg,
    cicloDias,
    filas,
    vacios,
    totales: {
      cabezas: filas.reduce((s, f) => s + f.cabezas, 0),
      corrales: corralesCon.size,
      // Ponderado por cabezas, con los lotes que tienen fecha de entrada.
      diasPromedio: cabConDias ? r1(conDias.reduce((s, f) => s + f.diasEncierre * f.cabezas, 0) / cabConDias) : null,
      // La ganancia diaria real, ponderada por cabezas, de los lotes pesados.
      gmdRealPromedio: cabConGmd ? r2(conGmd.reduce((s, f) => s + f.gmdRealKg * f.cabezas, 0) / cabConGmd) : null,
      valorUsd: parametros ? r2(filas.reduce((s, f) => s + (f.valorUsd ?? 0), 0)) : null,
      valorCompleto: Boolean(parametros) && filas.every((f) => f.valorCompleto),
      atrasados: atrasados.size,
      proximos: proximos.size,
    },
  };
}

// --- Un corral en una fila (la tabla de Corrales, 25/11) ---

// Promedio de valor(f) ponderado por cabezas, con las filas que tienen el dato.
function ponderado(filas, valor) {
  let cabezas = 0;
  let suma = 0;
  for (const f of filas) {
    const v = valor(f);
    if (v == null) continue;
    cabezas += f.cabezas;
    suma += v * f.cabezas;
  }
  return cabezas ? suma / cabezas : null;
}

// Función pura: las filas de analisisFeedlot de un mismo corral (una por lote)
// juntas en una, para la tabla de Corrales. Los números se ponderan por
// cabezas con los lotes que tienen el dato; la salida es la del lote que sale
// primero; el corral está atrasado si alguno de sus lotes lo está.
//   gmdKg:        la de las pesadas (real) y, para los lotes sin pesar, la
//                 esperada. gmdReal: true si todos los lotes con peso están pesados.
//   pesoHoyAprox: false solo si todos los pesos son de una pesada de hoy.
// opciones: { hoy, gmdKg (la esperada), etapas: { adaptacionDias, engordeDias,
// cicloDias }, cmObjetivo }.
export function resumenCorral(filas, { hoy, gmdKg = GMD_POR_DEFECTO, etapas = {}, cmObjetivo = CM_COMEDERO_POR_DEFECTO }) {
  const conPeso = filas.filter((f) => f.pesoEstimadoKg != null);
  const ganados = conPeso.filter((f) => f.pesoEntradaKg != null);
  const dias = ponderado(filas, (f) => f.diasEncierre);
  const diasEncierre = dias == null ? null : Math.round(dias);
  const [primera] = filas.filter((f) => f.salidaProbable).sort((a, b) => a.diasParaSalida - b.diasParaSalida);
  const atrasado = filas.some((f) => f.atrasado);
  const cm = filas[0]?.cmComederoPorCabeza ?? null;
  const pesoEntrada = ponderado(filas, (f) => f.pesoEntradaKg);
  const pesoHoy = ponderado(conPeso, (f) => f.pesoEstimadoKg);
  return {
    cabezas: filas.reduce((s, f) => s + f.cabezas, 0),
    diasEncierre,
    fechaEntrada: filas.map((f) => f.fechaEntrada).filter(Boolean).sort()[0] ?? null,
    etapa: etapaDeEncierre(diasEncierre, etapas),
    pesoEntradaKg: pesoEntrada == null ? null : r1(pesoEntrada),
    pesoHoyKg: pesoHoy == null ? null : r1(pesoHoy),
    pesoHoyAprox: conPeso.some((f) => f.ultimaPesada?.fecha !== hoy),
    gmdKg: conPeso.length ? r2(ponderado(conPeso, (f) => f.gmdRealKg ?? gmdKg)) : null,
    gmdReal: conPeso.length > 0 && conPeso.every((f) => f.gmdRealKg != null),
    kgGanadosCab: ganados.length ? r1(ponderado(ganados, (f) => f.pesoEstimadoKg - f.pesoEntradaKg)) : null,
    kgGanadosTotal: ganados.length ? Math.round(ganados.reduce((s, f) => s + (f.pesoEstimadoKg - f.pesoEntradaKg) * f.cabezas, 0)) : null,
    salidaProbable: primera?.salidaProbable ?? null,
    diasParaSalida: primera?.diasParaSalida ?? null,
    atrasado,
    salidaCerca: !atrasado && filas.some((f) => f.salidaCerca),
    cmPorCabeza: cm,
    cmObjetivo,
    apretado: cm != null && cmObjetivo > 0 && cm < cmObjetivo,
    valorUsd: r2(filas.reduce((s, f) => s + (f.valorUsd ?? 0), 0)),
    valorCompleto: filas.every((f) => f.valorCompleto),
    valorAprox: filas.some((f) => f.valorAprox),
    // A algún lote le falta la fecha o el peso de entrada.
    datosIncompletos: filas.some((f) => !f.fechaEntrada || f.pesoEntradaKg == null),
  };
}

// Los datos del feedlot de esos corrales (ids de potreros de un
// confinamiento): Map corralId → resumenCorral. Un corral vacío no está.
export async function datosDeCorrales(potreroIds) {
  if (!potreroIds.length) return new Map();
  const hoy = hoyISO();
  const [corrales, p, parametros] = await Promise.all([cargarCorrales({ id: { in: potreroIds } }), parametrosFeedlot(), parametrosCarga()]);
  const { filas } = analisisFeedlot({ corrales, hoy, gmdKg: p.gmdKg, cicloDias: p.cicloDias, parametros });
  const porCorral = new Map();
  for (const f of filas) porCorral.set(f.corralId, [...(porCorral.get(f.corralId) ?? []), f]);
  const etapas = { adaptacionDias: p.adaptacionDias, engordeDias: p.engordeDias, cicloDias: p.cicloDias };
  return new Map([...porCorral].map(([id, del]) => [id, resumenCorral(del, { hoy, gmdKg: p.gmdKg, etapas, cmObjetivo: p.cmObjetivo })]));
}

// Los corrales de esos campos, con la última versión de stock de cada uno.
async function cargarCorrales(where) {
  const rows = await prisma.potrero.findMany({
    where: { ...where, activo: true },
    select: {
      id: true,
      nombre: true,
      metrosComedero: true,
      campo: { select: { id: true, sigla: true, nombre: true } },
      versionesStock: {
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        take: 1,
        select: {
          fecha: true,
          lineas: {
            select: {
              loteId: true,
              categoriaId: true,
              cabezas: true,
              pesoPromedioKg: true,
              lote: { select: { nombre: true, fechaEntrada: true, pesoEntradaKg: true } },
              categoria: { select: { nombre: true, orden: true } },
            },
            orderBy: { id: 'asc' },
          },
        },
      },
    },
    orderBy: [{ campo: { orden: 'asc' } }, { campo: { sigla: 'asc' } }, { orden: 'asc' }, { nombre: 'asc' }],
  });
  // Las dos últimas pesadas de cada lote (eventos, 20/11).
  const pesadas = await ultimasPesadas([...new Set(rows.flatMap((c) => c.versionesStock[0]?.lineas.map((l) => l.loteId) ?? []))]);
  return rows.map(({ versionesStock, ...c }) => {
    const [v] = versionesStock;
    return {
      ...c,
      fecha: fechaISO(v?.fecha),
      lineas: (v?.lineas ?? []).map((l) => ({
        loteId: l.loteId,
        lote: l.lote.nombre,
        categoriaId: l.categoriaId,
        categoria: l.categoria.nombre,
        categoriaOrden: l.categoria.orden,
        cabezas: l.cabezas,
        pesoPromedioKg: l.pesoPromedioKg == null ? null : Number(l.pesoPromedioKg),
        fechaEntrada: fechaISO(l.lote.fechaEntrada),
        pesoEntradaKg: l.lote.pesoEntradaKg == null ? null : Number(l.lote.pesoEntradaKg),
        pesadas: pesadas.get(l.loteId) ?? [],
      })),
    };
  });
}

// Los parámetros del feedlot: { gmdKg, cicloDias, adaptacionDias, engordeDias, cmObjetivo }.
export async function parametrosFeedlot(db = prisma) {
  const filas = await db.parametro.findMany({ where: { clave: { in: Object.values(PARAMETROS_FEEDLOT).map(([clave]) => clave) } } });
  const valor = new Map(filas.map((p) => [p.clave, Number(p.valor)]));
  return Object.fromEntries(Object.entries(PARAMETROS_FEEDLOT).map(([nombre, [clave, porDefecto]]) => [nombre, valor.get(clave) ?? porDefecto]));
}

// --- Últimas ventas ---

// Función pura: una venta que salió de un corral, con el peso estimado a esa
// fecha (peso de entrada del lote + días × GMD) para compararlo con el real.
// m: { id, fecha, cabezas, pesoPromedioKg, precioVentaUsd, precioVentaPor,
//   corral, campo, categoria, lote: { fechaEntrada, pesoEntradaKg } }.
export function ventaConEstimado(m, gmdKg = GMD_POR_DEFECTO) {
  const pesoReal = m.pesoPromedioKg == null ? null : Number(m.pesoPromedioKg);
  const entrada = m.lote?.pesoEntradaKg == null ? null : Number(m.lote.pesoEntradaKg);
  const dias = m.lote?.fechaEntrada ? diasEntre(m.lote.fechaEntrada, m.fecha) : null;
  const pesoEstimado = entrada != null && dias != null ? r1(entrada + Math.max(dias, 0) * gmdKg) : null;
  const precio = m.precioVentaUsd == null ? null : Number(m.precioVentaUsd);
  return {
    movimientoId: m.id,
    fecha: m.fecha,
    corralId: m.corralId ?? null,
    corral: m.corral,
    campo: m.campo,
    categoria: m.categoria,
    cabezas: m.cabezas,
    diasEncierre: dias,
    pesoRealKg: pesoReal,
    pesoEstimadoKg: pesoEstimado,
    diferenciaKg: pesoReal != null && pesoEstimado != null ? r1(pesoReal - pesoEstimado) : null,
    precioVentaUsd: precio,
    precioVentaPor: precio == null ? null : m.precioVentaPor,
    valorVentaUsd: valorVenta({ cabezas: m.cabezas, pesoPromedioKg: pesoReal, precioVentaUsd: precio, precioVentaPor: m.precioVentaPor }),
  };
}

// Las ventas (tipo VENTA) que salieron de los corrales de esos campos en los
// últimos 90 días, sin las revertidas; de la más nueva a la más vieja.
async function ultimasVentas(campoId, hoy, gmdKg) {
  const rows = await prisma.movimiento.findMany({
    where: {
      modo: 'SALIDA',
      tipo: { clave: 'VENTA' },
      revertidoPor: { is: null },
      potreroOrigen: { campoId },
      fecha: { gte: aFecha(sumarDias(hoy, -DIAS_ULTIMAS_VENTAS)) },
    },
    select: {
      id: true,
      fecha: true,
      cabezas: true,
      pesoPromedioKg: true,
      precioVentaUsd: true,
      precioVentaPor: true,
      categoriaOrigenId: true,
      potreroOrigen: { select: { id: true, nombre: true, campo: { select: { id: true, sigla: true, nombre: true } } } },
      loteOrigen: { select: { fechaEntrada: true, pesoEntradaKg: true, categoria: { select: { nombre: true } } } },
    },
    orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
    take: 200,
  });
  const ids = [...new Set(rows.map((m) => m.categoriaOrigenId).filter((c) => c != null))];
  const categorias = new Map((await prisma.categoria.findMany({ where: { id: { in: ids } }, select: { id: true, nombre: true } })).map((c) => [c.id, c.nombre]));
  return rows.map((m) =>
    ventaConEstimado(
      {
        ...m,
        fecha: fechaISO(m.fecha),
        corralId: m.potreroOrigen.id,
        corral: m.potreroOrigen.nombre,
        campo: m.potreroOrigen.campo,
        categoria: categorias.get(m.categoriaOrigenId) ?? m.loteOrigen?.categoria.nombre ?? null,
        lote: { fechaEntrada: fechaISO(m.loteOrigen?.fechaEntrada), pesoEntradaKg: m.loteOrigen?.pesoEntradaKg },
      },
      gmdKg,
    ),
  );
}

async function analizar(where) {
  const hoy = hoyISO();
  const [corrales, p, parametros] = await Promise.all([cargarCorrales(where), parametrosFeedlot(), parametrosCarga()]);
  const analisis = analisisFeedlot({ corrales, hoy, gmdKg: p.gmdKg, cicloDias: p.cicloDias, parametros });
  return { ...analisis, adaptacionDias: p.adaptacionDias, engordeDias: p.engordeDias, ventas: await ultimasVentas(where.campoId, hoy, p.gmdKg) };
}

async function campoFeedlot(campoId) {
  const campo = await findCampo(campoId);
  if (!campo) throw notFound('Campo no encontrado');
  if (campo.tipo !== 'CONFINAMIENTO') throw badRequest(`${campo.nombre} no es un feedlot`);
  return { id: campo.id, sigla: campo.sigla, nombre: campo.nombre };
}

// Un feedlot. Un campo que no es confinamiento no tiene esta vista.
export async function feedlotCampo(campoId) {
  const campo = await campoFeedlot(campoId);
  return { campo, ...(await analizar({ campoId: campo.id })) };
}

// Los feedlots del usuario (filtro: alcance.js, filtroGrupo).
const camposFeedlot = (filtro) =>
  prisma.campo.findMany({ where: { activo: true, ...filtro }, select: { id: true, sigla: true, nombre: true }, orderBy: [{ orden: 'asc' }, { sigla: 'asc' }] });

// Una fila por feedlot, con lo suyo del análisis.
function porFeedlot(campos, analisis) {
  return campos.map((c) => {
    const filas = analisis.filas.filter((f) => f.campo.id === c.id);
    return {
      ...c,
      cabezas: filas.reduce((s, f) => s + f.cabezas, 0),
      corrales: new Set(filas.map((f) => f.corralId)).size,
      vacios: analisis.vacios.filter((v) => v.campo.id === c.id).length,
      valorUsd: r2(filas.reduce((s, f) => s + (f.valorUsd ?? 0), 0)),
      valorCompleto: filas.every((f) => f.valorCompleto),
    };
  });
}

// "Todos los feedlots", con una fila por feedlot.
export async function feedlotsTodos(filtro) {
  const campos = await camposFeedlot(filtro);
  const analisis = await analizar({ campoId: { in: campos.map((c) => c.id) } });
  return { campo: null, feedlots: porFeedlot(campos, analisis), ...analisis };
}

// --- La tabla de categorías por etapa (el Resumen del feedlot) ---

const etapasDe = (analisis) => ({ adaptacionDias: analisis.adaptacionDias, engordeDias: analisis.engordeDias, cicloDias: analisis.cicloDias });

// El resumen de un feedlot (GET /campos/:id/resumen, si es un confinamiento).
export async function resumenFeedlotCampo(campo) {
  const analisis = await analizar({ campoId: campo.id });
  const { kgPorUg } = await parametrosCarga();
  return { campo: { id: campo.id, sigla: campo.sigla, nombre: campo.nombre }, kgPorUg, ...resumenPorEtapas(analisis, etapasDe(analisis)) };
}

// El de todos los feedlots del usuario (GET /resumen?grupo=feedlots), con una
// fila por feedlot (como `estancias` en el de las estancias).
export async function resumenFeedlots(filtro) {
  const campos = await camposFeedlot(filtro);
  const analisis = await analizar({ campoId: { in: campos.map((c) => c.id) } });
  const { kgPorUg } = await parametrosCarga();
  const estancias = porFeedlot(campos, analisis).map(({ corrales, vacios, ...f }) => ({ ...f, potreros: corrales + vacios, hectareas: 0 }));
  return { campo: null, estancias, kgPorUg, ...resumenPorEtapas(analisis, etapasDe(analisis)) };
}
