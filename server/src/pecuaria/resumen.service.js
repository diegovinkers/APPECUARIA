// Resumen de un campo, como la tabla que arma el encargado: cada categoría
// repartida en CN / Verdeos / Corral (y Otro, que solo suma al total), con el
// último dato de cada potrero. Más la carga de cada grupo.
// El grupo de un potrero sale de su uso de suelo vigente; un corral (tipo
// CORRAL) es siempre Corral. Nada se guarda calculado.
import { prisma } from '../db.js';
import { notFound } from '../errors.js';
import { calcularPotrero } from './calculos.js';
import { findCampo } from './lugares.repository.js';
import { kgPorUg } from './stock.service.js';
import { fechaISO } from './importaciones.service.js';

export const GRUPOS = ['CN', 'VERDEO', 'CORRAL', 'OTRO'];
const vacio = () => ({ CN: 0, VERDEO: 0, CORRAL: 0, OTRO: 0, total: 0 });
const r2 = (n) => Math.round(n * 100) / 100;

export async function resumenCampo(campoId) {
  const campo = await findCampo(campoId);
  if (!campo) throw notFound('Campo no encontrado');
  const kg = await kgPorUg();

  const potreros = await prisma.potrero.findMany({
    where: { campoId: campo.id, activo: true },
    select: {
      tipo: true,
      hectareas: true,
      hectareasAConfirmar: true,
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
  const totales = vacio();
  const grupos = Object.fromEntries(GRUPOS.map((g) => [g, { potreros: 0, hectareas: 0, todas: [], conHa: [] }]));
  let fecha = null;

  for (const p of potreros) {
    const grupo = p.tipo === 'CORRAL' ? 'CORRAL' : (p.usos[0]?.usoSuelo.grupo ?? 'OTRO');
    const ha = !p.hectareasAConfirmar && p.hectareas != null ? Number(p.hectareas) : null;
    const [version] = p.versionesStock;
    const lineas = (version?.lineas ?? []).map((l) => ({
      ...l,
      pesoPromedioKg: l.pesoPromedioKg == null ? null : Number(l.pesoPromedioKg),
    }));
    if (version && (!fecha || version.fecha > fecha)) fecha = version.fecha;

    const g = grupos[grupo];
    g.potreros++;
    g.todas.push(...lineas);
    if (ha) {
      g.hectareas += ha;
      g.conHa.push(...lineas);
    }

    for (const l of lineas) {
      if (!filas.has(l.categoria.id)) {
        filas.set(l.categoria.id, { orden: l.categoria.orden, categoriaId: l.categoria.id, categoria: l.categoria.nombre, ...vacio() });
      }
      const fila = filas.get(l.categoria.id);
      fila[grupo] += l.cabezas;
      fila.total += l.cabezas;
      totales[grupo] += l.cabezas;
      totales.total += l.cabezas;
    }
  }

  return {
    campo: { id: campo.id, sigla: campo.sigla, nombre: campo.nombre },
    fecha: fechaISO(fecha),
    kgPorUg: kg,
    filas: [...filas.values()]
      .sort((a, b) => a.orden - b.orden || a.categoria.localeCompare(b.categoria))
      .map(({ orden, ...fila }) => fila),
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
        cabHa: carga.cabHa,
        kgPvHa: carga.kgPvHa,
        ugHa: carga.ugHa,
      };
    }),
  };
}
