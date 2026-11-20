// El análisis del feedlot (confinamiento), corral por corral (pedido de
// Diego, 19/11). Un feedlot se mira distinto que una estancia: no importa la
// carga por hectárea sino cuánto hace que entraron los animales, cuánto pesan
// hoy y cuándo salen.
//   Días de encierre  = hoy − fecha de entrada del lote
//   Peso estimado hoy = peso de entrada + días × GMD (parámetro GMD_FEEDLOT_KG)
//   Salida probable   = fecha de entrada + días del ciclo (CICLO_FEEDLOT_DIAS)
//   m de comedero/cab = metros de comedero del corral ÷ cabezas del corral
//   Valor             = con el peso estimado y el precio de la categoría
// Si falta un dato, lo que depende de él queda en null ("—"): no se inventa.
// Nada se guarda calculado.
import { prisma } from '../db.js';
import { badRequest, notFound } from '../errors.js';
import { calcularPotrero } from './calculos.js';
import { fechaISO, hoyISO } from './importaciones.service.js';
import { findCampo } from './lugares.repository.js';
import { parametrosCarga } from './stock.service.js';

// Valores de CIGAM (TEA4SISTMANEJO), si el parámetro no está cargado.
export const GMD_POR_DEFECTO = 1.5;
export const CICLO_POR_DEFECTO = 120;
// La salida se marca (en ámbar) si ya pasó o falta menos de una semana.
export const DIAS_AVISO_SALIDA = 7;
// "Salen en los próximos 30 días" (incluye las que ya se pasaron).
export const DIAS_PROXIMAS_SALIDAS = 30;

const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;
const DIA_MS = 86_400_000;
const aDia = (iso) => Date.parse(`${iso}T00:00:00Z`);

// Días entre dos fechas "AAAA-MM-DD" (b − a).
export const diasEntre = (a, b) => Math.round((aDia(b) - aDia(a)) / DIA_MS);
export const sumarDias = (iso, dias) => new Date(aDia(iso) + dias * DIA_MS).toISOString().slice(0, 10);

// Función pura: el análisis de una lista de corrales a una fecha.
// corrales: [{ id, nombre, metrosComedero, campo: { id, sigla, nombre }, fecha,
//   lineas: [{ loteId, lote, categoriaId, categoria, cabezas, pesoPromedioKg,
//   fechaEntrada, pesoEntradaKg }] }]
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
      const pesoEstimado = pesoEntrada != null && dias != null ? r1(pesoEntrada + Math.max(dias, 0) * gmdKg) : null;
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
        cabezas: l.cabezas,
        fechaEntrada: l.fechaEntrada ?? null,
        diasEncierre: dias,
        pesoEntradaKg: pesoEntrada,
        pesoEstimadoKg: pesoEstimado,
        salidaProbable: salida,
        diasParaSalida: faltan,
        salidaCerca: faltan != null && faltan < DIAS_AVISO_SALIDA,
        metrosComedero: metros,
        mComederoPorCabeza: metros != null ? r2(metros / cabezasCorral) : null,
        valorUsd: valor?.valorUsd ?? null,
        valorCompleto: valor?.valorCompleto ?? false,
        // Con "≈": sale de un peso estimado (el de hoy o el de la categoría).
        valorAprox: Boolean(valor && (pesoEstimado != null || valor.kilosEstimados)),
      });
    }
  }

  const conDias = filas.filter((f) => f.diasEncierre != null);
  const cabConDias = conDias.reduce((s, f) => s + f.cabezas, 0);
  const corralesCon = new Set(filas.map((f) => f.corralId));
  const salen = new Set(filas.filter((f) => f.diasParaSalida != null && f.diasParaSalida <= DIAS_PROXIMAS_SALIDAS).map((f) => f.corralId));
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
      valorUsd: parametros ? r2(filas.reduce((s, f) => s + (f.valorUsd ?? 0), 0)) : null,
      valorCompleto: Boolean(parametros) && filas.every((f) => f.valorCompleto),
      salenEn30: salen.size,
    },
  };
}

async function valorParametro(clave, porDefecto) {
  const p = await prisma.parametro.findUnique({ where: { clave } });
  return p ? Number(p.valor) : porDefecto;
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
        cabezas: l.cabezas,
        pesoPromedioKg: l.pesoPromedioKg == null ? null : Number(l.pesoPromedioKg),
        fechaEntrada: fechaISO(l.lote.fechaEntrada),
        pesoEntradaKg: l.lote.pesoEntradaKg == null ? null : Number(l.lote.pesoEntradaKg),
      })),
    };
  });
}

async function analizar(where) {
  const [corrales, gmdKg, cicloDias, parametros] = await Promise.all([
    cargarCorrales(where),
    valorParametro('GMD_FEEDLOT_KG', GMD_POR_DEFECTO),
    valorParametro('CICLO_FEEDLOT_DIAS', CICLO_POR_DEFECTO),
    parametrosCarga(),
  ]);
  return analisisFeedlot({ corrales, hoy: hoyISO(), gmdKg, cicloDias, parametros });
}

// Un feedlot. Un campo que no es confinamiento no tiene esta vista.
export async function feedlotCampo(campoId) {
  const campo = await findCampo(campoId);
  if (!campo) throw notFound('Campo no encontrado');
  if (campo.tipo !== 'CONFINAMIENTO') throw badRequest(`${campo.nombre} no es un feedlot`);
  const analisis = await analizar({ campoId: campo.id });
  return { campo: { id: campo.id, sigla: campo.sigla, nombre: campo.nombre }, ...analisis };
}

// "Todos los feedlots": los del usuario (filtro: alcance.js, filtroGrupo), con
// una fila por feedlot.
export async function feedlotsTodos(filtro) {
  const campos = await prisma.campo.findMany({
    where: { activo: true, ...filtro },
    select: { id: true, sigla: true, nombre: true },
    orderBy: [{ orden: 'asc' }, { sigla: 'asc' }],
  });
  const analisis = await analizar({ campoId: { in: campos.map((c) => c.id) } });
  const feedlots = campos.map((c) => {
    const filas = analisis.filas.filter((f) => f.campo.id === c.id);
    return {
      ...c,
      cabezas: filas.reduce((s, f) => s + f.cabezas, 0),
      corrales: new Set(filas.map((f) => f.corralId)).size,
      valorUsd: r2(filas.reduce((s, f) => s + (f.valorUsd ?? 0), 0)),
    };
  });
  return { campo: null, feedlots, ...analisis };
}
