// Catálogo del "libro del rodeo": tipos de movimiento y causas. Se editan
// desde Configuración; nada se borra (se desactiva).
import { prisma } from '../db.js';
import { Prisma } from '../generated/prisma/client.ts';
import { badRequest, conflict, parseId } from '../errors.js';
import { normalizarTexto } from './normalizar.js';
import { MODO_A_TIPO, TIPOS_MOVIMIENTO } from '../seed/pecuaria.catalog.js';

const isPrismaError = (error, code) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;

// El orden de la tabla de la propuesta: de lo más grande a lo más chico.
export const NIVELES = ['CAMPO', 'POTRERO', 'CATEGORIA', 'LOTE', 'PARTE_LOTE'];
const ordenarNiveles = (lista) => NIVELES.filter((n) => lista.includes(n));

// Los tipos que usa la app para mover: no se desactivan ni cambian de efecto.
const CLAVES_SISTEMA = new Set(Object.values(MODO_A_TIPO));

// "Dosificación" → "DOSIFICACION"; "Venta o faena" → "VENTA_O_FAENA".
export const claveDesdeNombre = (nombre) =>
  normalizarTexto(nombre)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30) || 'TIPO';

// --- Tipos de movimiento ---

const selectTipo = {
  id: true,
  clave: true,
  nombre: true,
  efecto: true,
  pideCausa: true,
  pideGuia: true,
  sexo: true,
  niveles: true,
  idTipoEventoCigam: true,
  activo: true,
  orden: true,
  causas: { select: { causa: { select: { id: true, codigo: true, nombre: true, activo: true, orden: true } } } },
};

const toTipo = (row) =>
  row && {
    ...row,
    niveles: ordenarNiveles(row.niveles),
    sistema: CLAVES_SISTEMA.has(row.clave),
    causas: row.causas
      .map(({ causa }) => causa)
      .sort((a, b) => a.orden - b.orden || a.codigo.localeCompare(b.codigo))
      .map(({ orden, ...c }) => c),
  };

async function findTipo(id) {
  const rowId = parseId(id);
  if (!rowId) return null;
  return toTipo(await prisma.tipoMovimiento.findUnique({ where: { id: rowId }, select: selectTipo }));
}

export async function listTipos() {
  const rows = await prisma.tipoMovimiento.findMany({ select: selectTipo, orderBy: [{ orden: 'asc' }, { nombre: 'asc' }] });
  return rows.map(toTipo);
}

// Nombre y clave no se repiten (el nombre, sin importar mayúsculas).
async function assertTipoLibre({ nombre, clave }, idPropio = null) {
  const otro = await prisma.tipoMovimiento.findFirst({
    where: {
      OR: [{ nombre: { equals: nombre, mode: 'insensitive' } }, ...(clave ? [{ clave }] : [])],
      ...(idPropio && { NOT: { id: idPropio } }),
    },
    select: { nombre: true, clave: true },
  });
  if (!otro) return;
  if (clave && otro.clave === clave) throw conflict(`Ya existe un tipo con la clave ${clave} ("${otro.nombre}")`);
  throw conflict(`Ya existe el tipo de movimiento "${otro.nombre}"`);
}

export async function createTipo({ clave, niveles, ...data }) {
  const fila = { ...data, clave: clave ?? claveDesdeNombre(data.nombre), niveles: ordenarNiveles(niveles) };
  await assertTipoLibre(fila);
  try {
    return toTipo(await prisma.tipoMovimiento.create({ data: fila, select: selectTipo }));
  } catch (error) {
    if (isPrismaError(error, 'P2002')) throw conflict(`Ya existe el tipo de movimiento "${fila.nombre}"`);
    throw error;
  }
}

// La clave no se edita. Devuelve { antes, despues }, o null si no existe.
export async function updateTipo(id, { niveles, ...data }) {
  const antes = await findTipo(id);
  if (!antes) return null;
  const cambiaEfecto = data.efecto !== undefined && data.efecto !== antes.efecto;
  if (antes.sistema && (cambiaEfecto || data.activo === false)) {
    throw conflict(`"${antes.nombre}" lo usa la app para mover animales: no se puede desactivar ni cambiar su efecto`);
  }
  if (cambiaEfecto && (await prisma.movimiento.count({ where: { tipoId: antes.id } }))) {
    throw conflict(`"${antes.nombre}" ya tiene movimientos: no se puede cambiar su efecto`);
  }
  if (data.nombre !== undefined) await assertTipoLibre({ nombre: data.nombre }, antes.id);
  try {
    await prisma.tipoMovimiento.update({
      where: { id: antes.id },
      data: { ...data, ...(niveles && { niveles: ordenarNiveles(niveles) }) },
    });
  } catch (error) {
    if (isPrismaError(error, 'P2002')) throw conflict(`Ya existe el tipo de movimiento "${data.nombre}"`);
    throw error;
  }
  return { antes, despues: await findTipo(antes.id) };
}

// El tipo de un modo de la pantalla Mover (SUMAR, NUEVO...). Si falta en el
// catálogo (una base recién vaciada), lo crea como en el seed.
export async function tipoDeModo(db, modo) {
  const clave = MODO_A_TIPO[modo];
  const definicion = TIPOS_MOVIMIENTO.find((t) => t.clave === clave);
  if (!definicion) throw new Error(`Modo sin tipo de movimiento: ${modo}`);
  return db.tipoMovimiento.upsert({ where: { clave }, update: {}, create: definicion, select: { id: true, clave: true, nombre: true } });
}

// --- Causas ---

const selectCausa = {
  id: true,
  codigo: true,
  nombre: true,
  activo: true,
  orden: true,
  tipos: { select: { tipo: { select: { id: true, clave: true, nombre: true, orden: true } } } },
};

const toCausa = (row) => {
  if (!row) return null;
  const tipos = row.tipos.map(({ tipo }) => tipo).sort((a, b) => a.orden - b.orden || a.id - b.id);
  return {
    ...row,
    tipos: tipos.map(({ orden, ...t }) => t),
    // Para auditar los cambios de tipos.
    tipoIds: tipos.map((t) => t.id).sort((a, b) => a - b),
  };
};

async function findCausa(id) {
  const rowId = parseId(id);
  if (!rowId) return null;
  return toCausa(await prisma.causaMovimiento.findUnique({ where: { id: rowId }, select: selectCausa }));
}

export async function listCausas() {
  const rows = await prisma.causaMovimiento.findMany({ select: selectCausa, orderBy: [{ orden: 'asc' }, { codigo: 'asc' }] });
  return rows.map(toCausa);
}

async function assertTiposExisten(tipoIds) {
  if (!tipoIds?.length) return;
  const encontrados = await prisma.tipoMovimiento.count({ where: { id: { in: tipoIds } } });
  if (encontrados !== tipoIds.length) throw badRequest('Hay tipos de movimiento que no existen');
}

async function assertCodigoLibre(codigo, idPropio = null) {
  const otra = await prisma.causaMovimiento.findFirst({
    where: { codigo, ...(idPropio && { NOT: { id: idPropio } }) },
    select: { codigo: true, nombre: true },
  });
  if (otra) throw conflict(`Ya existe la causa ${otra.codigo} ("${otra.nombre}")`);
}

export async function createCausa({ tipoIds = [], ...data }) {
  await assertCodigoLibre(data.codigo);
  await assertTiposExisten(tipoIds);
  try {
    return toCausa(
      await prisma.causaMovimiento.create({
        data: { ...data, tipos: { create: tipoIds.map((tipoId) => ({ tipoId })) } },
        select: selectCausa,
      }),
    );
  } catch (error) {
    if (isPrismaError(error, 'P2002')) throw conflict(`Ya existe la causa ${data.codigo}`);
    throw error;
  }
}

// Si vienen tipoIds, reemplazan a los anteriores. Devuelve { antes, despues }, o null.
export async function updateCausa(id, { tipoIds, ...data }) {
  const antes = await findCausa(id);
  if (!antes) return null;
  if (data.codigo !== undefined) await assertCodigoLibre(data.codigo, antes.id);
  await assertTiposExisten(tipoIds);
  try {
    await prisma.$transaction([
      prisma.causaMovimiento.update({ where: { id: antes.id }, data }),
      ...(tipoIds
        ? [
            prisma.causaTipoMovimiento.deleteMany({ where: { causaId: antes.id } }),
            prisma.causaTipoMovimiento.createMany({ data: tipoIds.map((tipoId) => ({ causaId: antes.id, tipoId })) }),
          ]
        : []),
    ]);
  } catch (error) {
    if (isPrismaError(error, 'P2002')) throw conflict(`Ya existe la causa ${data.codigo}`);
    throw error;
  }
  return { antes, despues: await findCausa(antes.id) };
}
