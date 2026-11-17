// Funciones comunes de lotes. Reciben `db`: el cliente de Prisma o una
// transacción, así se pueden usar dentro de una.
import { badRequest } from '../errors.js';

// La foto actual de un potrero: su última versión de stock, con cada lote.
export async function fotoActual(db, potreroId) {
  const version = await db.versionStock.findFirst({
    where: { potreroId },
    orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      fecha: true,
      lineas: {
        select: {
          loteId: true,
          categoriaId: true,
          cabezas: true,
          pesoPromedioKg: true,
          lote: { select: { nombre: true } },
          categoria: { select: { nombre: true, orden: true } },
        },
      },
    },
  });
  return {
    version,
    lineas: (version?.lineas ?? []).map((l) => ({
      loteId: l.loteId,
      lote: l.lote.nombre,
      categoriaId: l.categoriaId,
      categoria: l.categoria.nombre,
      orden: l.categoria.orden,
      cabezas: l.cabezas,
      pesoPromedioKg: l.pesoPromedioKg == null ? null : Number(l.pesoPromedioKg),
    })),
  };
}

// ¿Hay otro lote en el campo con ese nombre? (sin distinguir mayúsculas)
export async function nombreOcupado(db, campoId, nombre, exceptoId = null) {
  return db.lote.findFirst({
    where: { campoId, nombre: { equals: nombre, mode: 'insensitive' }, ...(exceptoId && { NOT: { id: exceptoId } }) },
    select: { id: true },
  });
}

// Un nombre automático libre: "10.3 · Terneros", o "10.3 · Terneros (2)" si ya existe.
export async function nombreLibre(db, campoId, base) {
  const raiz = base.slice(0, 74);
  for (let i = 1; ; i++) {
    const nombre = i === 1 ? raiz : `${raiz} (${i})`;
    if (!(await nombreOcupado(db, campoId, nombre))) return nombre;
  }
}

// Crea un lote. Con nombre: tiene que estar libre en el campo. Sin nombre:
// "<potrero> · <categoría>".
export async function crearLote(db, { campoId, potrero, categoria, nombre }) {
  let elegido = nombre?.trim();
  if (elegido) {
    if (await nombreOcupado(db, campoId, elegido)) throw badRequest(`Ya existe un lote "${elegido}" en este campo`);
  } else {
    elegido = await nombreLibre(db, campoId, `${potrero.nombre} · ${categoria.nombre}`);
  }
  return db.lote.create({ data: { campoId, potreroId: potrero.id, categoriaId: categoria.id, nombre: elegido } });
}

// Guarda una foto nueva del potrero con estas líneas (las de 0 cabezas no van).
export function crearVersion(db, { potreroId, fecha, origen, lineas, usuarioId, nota = null, importacionId = null }) {
  return db.versionStock.create({
    data: {
      potreroId,
      fecha,
      origen,
      usuarioId,
      nota,
      importacionId,
      lineas: {
        create: lineas
          .filter((l) => l.cabezas > 0)
          .map((l) => ({ loteId: l.loteId, categoriaId: l.categoriaId, cabezas: l.cabezas, pesoPromedioKg: l.pesoPromedioKg ?? null })),
      },
    },
  });
}
