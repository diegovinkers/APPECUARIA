// Campos y potreros. Las hectáreas se guardan como decimal y salen como número.
import { prisma } from '../db.js';
import { Prisma } from '../generated/prisma/client.ts';
import { badRequest, conflict, parseId } from '../errors.js';
import { calcularPotrero } from './calculos.js';

const isPrismaError = (error, code) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;

// --- Campos ---

const campoSelect = {
  id: true,
  sigla: true,
  nombre: true,
  tipo: true,
  idFazendaCigam: true,
  activo: true,
  orden: true,
};

async function guardarCampo(operacion, sigla) {
  try {
    return await operacion();
  } catch (error) {
    if (isPrismaError(error, 'P2002')) {
      throw conflict(sigla ? `Ya existe un campo con la sigla ${sigla}` : 'Ya existe un campo con esa clave de CIGAM');
    }
    throw error;
  }
}

export async function findCampo(id) {
  const campoId = parseId(id);
  if (!campoId) return null;
  return prisma.campo.findUnique({ where: { id: campoId }, select: campoSelect });
}

// where: el filtro de alcance (alcance.js: filtroCampos). Sin filtro, todas.
export function listCampos(where) {
  return prisma.campo.findMany({ where, select: campoSelect, orderBy: [{ orden: 'asc' }, { sigla: 'asc' }] });
}

export async function createCampo(data) {
  if (await prisma.campo.findUnique({ where: { sigla: data.sigla }, select: { id: true } })) {
    throw conflict(`Ya existe un campo con la sigla ${data.sigla}`);
  }
  return guardarCampo(() => prisma.campo.create({ data, select: campoSelect }), data.sigla);
}

// Devuelve { antes, despues }, o null si no existe.
export async function updateCampo(id, data) {
  const antes = await findCampo(id);
  if (!antes) return null;
  if (data.sigla && data.sigla !== antes.sigla && (await prisma.campo.findUnique({ where: { sigla: data.sigla } }))) {
    throw conflict(`Ya existe un campo con la sigla ${data.sigla}`);
  }
  const despues = await guardarCampo(
    () => prisma.campo.update({ where: { id: antes.id }, data, select: campoSelect }),
    data.sigla,
  );
  return { antes, despues };
}

// --- Potreros ---

const potreroSelect = {
  id: true,
  campoId: true,
  nombre: true,
  tipo: true,
  hectareas: true,
  hectareasAConfirmar: true,
  idAreaManejoCigam: true,
  activo: true,
  orden: true,
  subdivisiones: { select: { id: true, codigo: true, idTalhaoCigam: true }, orderBy: { id: 'asc' } },
};

const toPotrero = (row) => row && { ...row, hectareas: row.hectareas == null ? null : Number(row.hectareas) };

async function guardarPotrero(operacion, nombre) {
  try {
    return toPotrero(await operacion());
  } catch (error) {
    if (isPrismaError(error, 'P2002')) throw conflict(`Ya existe el potrero "${nombre}" en este campo`);
    throw error;
  }
}

export async function findPotrero(id) {
  const potreroId = parseId(id);
  if (!potreroId) return null;
  return toPotrero(await prisma.potrero.findUnique({ where: { id: potreroId }, select: potreroSelect }));
}

// null si el campo no existe. Cada potrero trae su uso de suelo vigente y los
// cálculos de su última versión de stock (null si nunca tuvo).
export async function listPotreros(campoId) {
  const campo = await findCampo(campoId);
  if (!campo) return null;
  // Los dados de baja (activo: false: un potrero que ya no se usa) no se
  // listan; su historial queda y se pueden reactivar por la API.
  const rows = await prisma.potrero.findMany({
    where: { campoId: campo.id, activo: true },
    select: {
      ...potreroSelect,
      usos: {
        where: { hasta: null },
        orderBy: { desde: 'desc' },
        take: 1,
        select: { desde: true, usoSuelo: { select: { id: true, nombre: true, grupo: true } } },
      },
      versionesStock: {
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        take: 1,
        select: {
          fecha: true,
          lineas: {
            select: {
              loteId: true,
              cabezas: true,
              pesoPromedioKg: true,
              lote: { select: { nombre: true } },
              categoria: { select: { id: true, nombre: true, orden: true } },
            },
          },
        },
      },
    },
    orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
  });
  const parametro = await prisma.parametro.findUnique({ where: { clave: 'KG_POR_UG' } });
  const kgPorUg = parametro ? Number(parametro.valor) : 380;
  return rows.map(({ usos, versionesStock, ...row }) => {
    const [uso] = usos;
    const [version] = versionesStock;
    const potrero = toPotrero(row);
    const lotes = (version?.lineas ?? [])
      .map((l) => ({
        loteId: l.loteId,
        lote: l.lote.nombre,
        categoriaId: l.categoria.id,
        categoria: l.categoria.nombre,
        cabezas: l.cabezas,
        pesoPromedioKg: l.pesoPromedioKg == null ? null : Number(l.pesoPromedioKg),
        orden: l.categoria.orden,
      }))
      .sort((a, b) => a.orden - b.orden || a.lote.localeCompare(b.lote))
      .map(({ orden, ...l }) => l);
    const lineas = lotes;
    return {
      ...potrero,
      usoActual: uso ? { ...uso.usoSuelo, desde: uso.desde.toISOString().slice(0, 10) } : null,
      stock: version ? { fecha: version.fecha.toISOString().slice(0, 10), ...calcularPotrero({ ...potrero, lineas }, kgPorUg), lotes } : null,
    };
  });
}

// null si el campo no existe.
export async function createPotrero(campoId, { subdivisiones = [], ...data }) {
  const campo = await findCampo(campoId);
  if (!campo) return null;
  return guardarPotrero(
    () =>
      prisma.potrero.create({
        data: { ...data, campoId: campo.id, subdivisiones: { create: subdivisiones.map((codigo) => ({ codigo })) } },
        select: potreroSelect,
      }),
    data.nombre,
  );
}

// Si vienen subdivisiones, reemplazan a las anteriores. Devuelve
// { antes, despues }, o null si no existe.
export async function updatePotrero(id, { subdivisiones, ...data }) {
  const antes = await findPotrero(id);
  if (!antes) return null;
  // Un potrero con animales no se da de baja: primero hay que sacarlos.
  if (data.activo === false && antes.activo) {
    const ultima = await prisma.versionStock.findFirst({
      where: { potreroId: antes.id },
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
      select: { lineas: { select: { cabezas: true } } },
    });
    const cabezas = (ultima?.lineas ?? []).reduce((s, l) => s + l.cabezas, 0);
    if (cabezas > 0) throw badRequest(`${antes.nombre} tiene ${cabezas} cabezas: movelas antes de darlo de baja`);
  }
  const despues = await guardarPotrero(
    () =>
      prisma.potrero.update({
        where: { id: antes.id },
        data: {
          ...data,
          ...(subdivisiones && {
            subdivisiones: { deleteMany: {}, create: subdivisiones.map((codigo) => ({ codigo })) },
          }),
        },
        select: potreroSelect,
      }),
    data.nombre ?? antes.nombre,
  );
  return { antes, despues };
}
