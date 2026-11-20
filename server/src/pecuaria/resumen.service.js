// Resumen de un campo, como la tabla que arma el encargado: cada categoría
// repartida en CN / Verdeos / Corral (y Otro, que solo suma al total), con el
// último dato de cada potrero. Más la carga de cada grupo.
// El grupo de un potrero sale de su uso de suelo vigente; un corral (tipo
// CORRAL) es siempre Corral. Nada se guarda calculado.
// Un feedlot (confinamiento) tiene otra tabla: las categorías por etapa del
// encierre (feedlot.service.js: resumenPorEtapas).
import { prisma } from '../db.js';
import { notFound } from '../errors.js';
import { calcularPotrero, hectareasDeCarga } from './calculos.js';
import { findCampo } from './lugares.repository.js';
import { parametrosCarga } from './stock.service.js';
import { fechaISO } from './importaciones.service.js';
import { resumenFeedlotCampo, resumenFeedlots } from './feedlot.service.js';

export const GRUPOS = ['CN', 'VERDEO', 'CORRAL', 'OTRO'];
const vacio = () => ({ CN: 0, VERDEO: 0, CORRAL: 0, OTRO: 0, total: 0 });
const r2 = (n) => Math.round(n * 100) / 100;

// Las columnas de la tabla, para el front (mismo formato que las del feedlot).
// Corral y Otro solo aparecen si tienen animales.
export const COLUMNAS_ESTANCIA = [
  { clave: 'CN', nombre: 'CN', detalle: 'campo natural', grupo: true },
  { clave: 'VERDEO', nombre: 'Verdeos', detalle: 'pasturas sembradas (raigrás, avena, sorgo…)', grupo: true },
  { clave: 'CORRAL', nombre: 'Corral', soloSiHay: true, grupo: true },
  { clave: 'OTRO', nombre: 'Otro', soloSiHay: true, grupo: true },
];

export async function resumenCampo(campoId) {
  const campo = await findCampo(campoId);
  if (!campo) throw notFound('Campo no encontrado');
  if (campo.tipo === 'CONFINAMIENTO') return resumenFeedlotCampo(campo);
  const { porCampo, ...r } = await resumen({ campoId: campo.id, activo: true });
  return { campo: { id: campo.id, sigla: campo.sigla, nombre: campo.nombre }, ...r };
}

// "Todas las estancias" (paso 4 del rediseño): la misma tabla sumando las
// estancias que el usuario puede ver (filtroCampos: undefined = todas), más
// una fila por estancia con sus cabezas, potreros y hectáreas.
// Con grupo 'feedlots', la de todos los feedlots, por etapa del encierre.
export async function resumenTodas(filtroCampos, grupo = 'estancias') {
  if (grupo === 'feedlots') return resumenFeedlots(filtroCampos);
  const campos = await prisma.campo.findMany({
    where: { activo: true, ...filtroCampos },
    select: { id: true, sigla: true, nombre: true },
    orderBy: [{ orden: 'asc' }, { sigla: 'asc' }],
  });
  const { porCampo, ...r } = await resumen({ campoId: { in: campos.map((c) => c.id) }, activo: true });
  const estancias = campos.map((c) => ({ ...c, ...(porCampo.get(c.id) ?? { potreros: 0, cabezas: 0, hectareas: 0, valorUsd: 0, valorCompleto: true }) }));
  return { campo: null, estancias, ...r };
}

async function resumen(where) {
  const kg = await parametrosCarga();

  const potreros = await prisma.potrero.findMany({
    where,
    select: {
      campoId: true,
      tipo: true,
      hectareas: true,
      hectareasAConfirmar: true,
      areaUtilizable: true,
      usos: { where: { hasta: null }, orderBy: { desde: 'desc' }, take: 1, select: { usoSuelo: { select: { grupo: true } } } },
      versionesStock: {
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        take: 1,
        select: {
          fecha: true,
          lineas: { select: { cabezas: true, pesoPromedioKg: true, categoria: { select: { id: true, nombre: true, orden: true } } } },
        },
      },
    },
  });

  const filas = new Map();
  // Las líneas de cada categoría, para su valor (cabezas × precio o kilos × precio).
  const lineasPorCategoria = new Map();
  const totales = vacio();
  const porCampo = new Map();
  const grupos = Object.fromEntries(GRUPOS.map((g) => [g, { potreros: 0, hectareas: 0, todas: [], conHa: [] }]));
  let fecha = null;

  for (const p of potreros) {
    const grupo = p.tipo === 'CORRAL' ? 'CORRAL' : (p.usos[0]?.usoSuelo.grupo ?? 'OTRO');
    // La estancia suma sus hectáreas; la carga por grupo, el área utilizable.
    const ha = !p.hectareasAConfirmar && p.hectareas != null ? Number(p.hectareas) : null;
    const haCarga = hectareasDeCarga(p);
    const [version] = p.versionesStock;
    const lineas = (version?.lineas ?? []).map((l) => ({
      ...l,
      categoriaId: l.categoria.id,
      pesoPromedioKg: l.pesoPromedioKg == null ? null : Number(l.pesoPromedioKg),
    }));
    if (version && (!fecha || version.fecha > fecha)) fecha = version.fecha;

    const c = porCampo.get(p.campoId) ?? { potreros: 0, cabezas: 0, hectareas: 0, valorUsd: 0, valorCompleto: true };
    c.potreros++;
    c.cabezas += lineas.reduce((n, l) => n + l.cabezas, 0);
    c.hectareas = r2(c.hectareas + (ha ?? 0));
    const valor = calcularPotrero({ hectareas: null, hectareasAConfirmar: true, lineas }, kg);
    c.valorUsd = r2(c.valorUsd + valor.valorUsd);
    c.valorCompleto &&= valor.valorCompleto;
    porCampo.set(p.campoId, c);

    const g = grupos[grupo];
    g.potreros++;
    g.todas.push(...lineas);
    if (haCarga) {
      g.hectareas += haCarga;
      g.conHa.push(...lineas);
    }

    for (const l of lineas) {
      if (!filas.has(l.categoria.id)) {
        filas.set(l.categoria.id, { orden: l.categoria.orden, categoriaId: l.categoria.id, categoria: l.categoria.nombre, ...vacio() });
      }
      const fila = filas.get(l.categoria.id);
      lineasPorCategoria.set(l.categoria.id, [...(lineasPorCategoria.get(l.categoria.id) ?? []), l]);
      fila[grupo] += l.cabezas;
      fila.total += l.cabezas;
      totales[grupo] += l.cabezas;
      totales.total += l.cabezas;
    }
  }

  // El valor del ganado: la suma de todos los potreros.
  const todo = calcularPotrero({ hectareas: null, hectareasAConfirmar: true, lineas: GRUPOS.flatMap((g) => grupos[g].todas) }, kg);
  return {
    porCampo,
    tipo: 'ESTANCIA',
    columnas: COLUMNAS_ESTANCIA,
    fecha: fechaISO(fecha),
    valor: { usd: todo.valorUsd, completo: todo.valorCompleto },
    kgPorUg: kg.kgPorUg,
    filas: [...filas.values()]
      .sort((a, b) => a.orden - b.orden || a.categoria.localeCompare(b.categoria))
      .map(({ orden, ...fila }) => {
        const v = calcularPotrero({ hectareas: null, hectareasAConfirmar: true, lineas: lineasPorCategoria.get(fila.categoriaId) }, kg);
        return { ...fila, valorUsd: v.valorUsd, valorCompleto: v.valorCompleto };
      }),
    totales,
    // La carga (por hectárea) se calcula solo con los potreros que tienen
    // hectáreas conocidas; cabezas y kilos, con todos.
    porGrupo: GRUPOS.map((grupo) => {
      const g = grupos[grupo];
      const todo = calcularPotrero({ hectareas: null, hectareasAConfirmar: true, lineas: g.todas }, kg);
      const carga = calcularPotrero({ hectareas: g.hectareas, hectareasAConfirmar: false, lineas: g.conHa }, kg);
      return {
        grupo,
        potreros: g.potreros,
        hectareas: r2(g.hectareas),
        cabezas: todo.cabezas,
        kilos: todo.kilos,
        kilosCompletos: todo.kilosCompletos,
        kilosEstimados: todo.kilosEstimados,
        valorUsd: todo.valorUsd,
        valorCompleto: todo.valorCompleto,
        cabHa: carga.cabHa,
        kgPvHa: carga.kgPvHa,
        ugHa: carga.ugHa,
      };
    }),
  };
}
