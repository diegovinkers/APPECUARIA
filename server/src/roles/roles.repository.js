// Lectura de roles. La edición de roles y permisos llega en la fase 4.
import { prisma } from '../db.js';

export async function list() {
  return prisma.rol.findMany({
    select: { id: true, nombre: true, descripcion: true },
    orderBy: { nombre: 'asc' },
  });
}
