// Roles y su matriz de permisos (módulo × acción). DECISIONES §3.
import { prisma } from '../db.js';
import { Prisma } from '../generated/prisma/client.ts';
import { Accion } from '../generated/prisma/enums.ts';
import { badRequest, conflict, parseId } from '../errors.js';

const rolSelect = {
  id: true,
  nombre: true,
  descripcion: true,
  permisos: { select: { permiso: { select: { accion: true, modulo: { select: { clave: true } } } } } },
  _count: { select: { usuarios: true } },
};

// permisos → ['modulo:ACCION', ...] ordenados; usuarios → cuántos lo tienen.
function toRol(row) {
  if (!row) return null;
  const { permisos, _count, ...rol } = row;
  return {
    ...rol,
    permisos: permisos.map(({ permiso }) => `${permiso.modulo.clave}:${permiso.accion}`).sort(),
    usuarios: _count.usuarios,
  };
}

const esDuplicado = (error) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

export async function list() {
  const rows = await prisma.rol.findMany({ select: rolSelect, orderBy: { nombre: 'asc' } });
  return rows.map(toRol);
}

export async function findById(id) {
  const rolId = parseId(id);
  if (!rolId) return null;
  return toRol(await prisma.rol.findUnique({ where: { id: rolId }, select: rolSelect }));
}

// Lo que se puede marcar en la matriz: los módulos activos y las acciones.
export async function catalogo() {
  const modulos = await prisma.modulo.findMany({
    where: { activo: true },
    select: { clave: true, nombre: true, esAdministracion: true },
    orderBy: [{ orden: 'asc' }, { clave: 'asc' }],
  });
  return { modulos, acciones: Object.values(Accion) };
}

export async function create({ nombre, descripcion = null }) {
  try {
    return toRol(await prisma.rol.create({ data: { nombre, descripcion }, select: rolSelect }));
  } catch (error) {
    if (esDuplicado(error)) throw conflict(`Ya existe un rol llamado "${nombre}"`);
    throw error;
  }
}

// Devuelve { antes, despues } o null si no existe.
export async function update(id, data) {
  const antes = await findById(id);
  if (!antes) return null;
  try {
    const despues = toRol(await prisma.rol.update({ where: { id: antes.id }, data, select: rolSelect }));
    return { antes, despues };
  } catch (error) {
    if (esDuplicado(error)) throw conflict(`Ya existe un rol llamado "${data.nombre}"`);
    throw error;
  }
}

// No se borra un rol que alguien tiene: primero hay que sacárselo.
export async function remove(id) {
  const rol = await findById(id);
  if (!rol) return null;
  if (rol.usuarios > 0) {
    throw conflict(`No se puede borrar: ${rol.usuarios === 1 ? 'un usuario lo tiene' : `${rol.usuarios} usuarios lo tienen`}`);
  }
  await prisma.rol.delete({ where: { id: rol.id } });
  return rol;
}

// Reemplaza la matriz del rol. claves: ['modulo:ACCION', ...]. Devuelve
// { antes, despues } o null si el rol no existe.
export async function setPermisos(id, claves) {
  const antes = await findById(id);
  if (!antes) return null;
  const pares = claves.map((c) => c.split(':'));
  if (pares.some(([, accion]) => !Object.values(Accion).includes(accion))) throw badRequest('Alguno de los permisos elegidos no existe');
  const permisos = pares.length
    ? await prisma.permiso.findMany({
        where: { OR: pares.map(([clave, accion]) => ({ accion, modulo: { clave, activo: true } })) },
        select: { id: true },
      })
    : [];
  if (permisos.length !== claves.length) throw badRequest('Alguno de los permisos elegidos no existe');
  await prisma.$transaction([
    prisma.rolPermiso.deleteMany({ where: { rolId: antes.id } }),
    prisma.rolPermiso.createMany({ data: permisos.map((p) => ({ rolId: antes.id, permisoId: p.id })) }),
  ]);
  return { antes, despues: await findById(antes.id) };
}
