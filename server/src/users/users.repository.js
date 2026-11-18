// Acceso a datos de usuarios. Siempre devuelve objetos planos y nunca la
// contraseña, salvo las funciones ...WithPassword (solo para verificarla).
import { prisma } from '../db.js';
import { Prisma } from '../generated/prisma/client.ts';
import { LOGIN } from '../config.js';
import { badRequest, conflict, parseId } from '../errors.js';

export const userSelect = {
  id: true,
  usuario: true,
  nombre: true,
  email: true,
  codigoCigam: true,
  esSuperadmin: true,
  activo: true,
  debeCambiarPassword: true,
  todasLasEstancias: true,
  bloqueadoHasta: true,
  ultimoAcceso: true,
  creadoEn: true,
  actualizadoEn: true,
  roles: {
    select: {
      rol: {
        select: {
          id: true,
          nombre: true,
          permisos: { select: { permiso: { select: { accion: true, modulo: { select: { clave: true, activo: true } } } } } },
        },
      },
    },
    orderBy: { rol: { nombre: 'asc' } },
  },
  campos: { select: { campoId: true }, orderBy: { campoId: 'asc' } },
};

// Deja el usuario plano:
//   roles → [{ id, nombre }]
//   permisos → ['pecuaria:VER', ...]: la suma de los permisos de sus roles
//     (de módulos activos), sin repetir y ordenada. Se leen de la base en cada
//     request, así un cambio de rol vale al instante.
//   campoIds → las estancias asignadas (si no tiene todasLasEstancias).
export function toUser(row) {
  if (!row) return null;
  const { roles, campos, ...user } = row;
  const permisos = new Set();
  for (const { rol } of roles) {
    for (const { permiso } of rol.permisos) {
      if (permiso.modulo.activo) permisos.add(`${permiso.modulo.clave}:${permiso.accion}`);
    }
  }
  return {
    ...user,
    roles: roles.map(({ rol }) => ({ id: rol.id, nombre: rol.nombre })),
    permisos: [...permisos].sort(),
    campoIds: campos.map((c) => c.campoId),
  };
}

const isPrismaError = (error, code) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;

// update que devuelve null (en vez de fallar) si el usuario no existe.
async function updateUser(id, data) {
  const userId = parseId(id);
  if (!userId) return null;
  try {
    return toUser(await prisma.usuario.update({ where: { id: userId }, data, select: userSelect }));
  } catch (error) {
    if (isPrismaError(error, 'P2025')) return null;
    throw error;
  }
}

export async function findById(id) {
  const userId = parseId(id);
  if (!userId) return null;
  return toUser(await prisma.usuario.findUnique({ where: { id: userId }, select: userSelect }));
}

// Incluyen passwordHash: usar solo para verificar credenciales.
export async function findByUsuarioWithPassword(usuario) {
  const row = await prisma.usuario.findUnique({
    where: { usuario: usuario.toLowerCase() },
    select: { ...userSelect, passwordHash: true },
  });
  return row && { ...toUser(row), passwordHash: row.passwordHash };
}

export async function findByIdWithPassword(id) {
  const row = await prisma.usuario.findUnique({ where: { id }, select: { ...userSelect, passwordHash: true } });
  return row && { ...toUser(row), passwordHash: row.passwordHash };
}

export async function list() {
  const rows = await prisma.usuario.findMany({ select: userSelect, orderBy: { usuario: 'asc' } });
  return rows.map(toUser);
}

// Todas las estancias, para asignarlas (id, sigla, nombre).
export function listEstancias() {
  return prisma.campo.findMany({ select: { id: true, sigla: true, nombre: true, activo: true }, orderBy: [{ orden: 'asc' }, { sigla: 'asc' }] });
}

// Dice cuál de los campos únicos ya está en uso, con un mensaje claro.
async function assertUnique({ usuario, email, codigoCigam }) {
  const checks = [
    ['usuario', usuario, 'Ya existe un usuario con ese nombre de usuario'],
    ['email', email, 'Ya existe un usuario con ese email'],
    ['codigoCigam', codigoCigam, 'Ya existe un usuario con ese código CIGAM'],
  ];
  for (const [field, value, message] of checks) {
    if (value && (await prisma.usuario.findUnique({ where: { [field]: value }, select: { id: true } }))) {
      throw conflict(message);
    }
  }
}

async function assertCamposExist(campoIds) {
  if (campoIds.length === 0) return;
  const found = await prisma.campo.count({ where: { id: { in: campoIds } } });
  if (found !== campoIds.length) throw badRequest('Alguna de las estancias elegidas no existe');
}

// Los nombres de los roles (de esa lista) que dan permisos sobre Usuarios,
// Roles o Auditoría: solo el superadmin los puede asignar (DECISIONES §3).
export async function rolesDeAdministracion(rolIds) {
  if (rolIds.length === 0) return [];
  const rows = await prisma.rol.findMany({
    where: { id: { in: rolIds }, permisos: { some: { permiso: { modulo: { esAdministracion: true } } } } },
    select: { nombre: true },
    orderBy: { nombre: 'asc' },
  });
  return rows.map((r) => r.nombre);
}

// Para la auditoría: las siglas de esas estancias.
export async function siglasDe(campoIds) {
  if (campoIds.length === 0) return [];
  const rows = await prisma.campo.findMany({ where: { id: { in: campoIds } }, select: { sigla: true }, orderBy: { sigla: 'asc' } });
  return rows.map((c) => c.sigla);
}

async function assertRolesExist(rolIds) {
  if (rolIds.length === 0) return;
  const found = await prisma.rol.count({ where: { id: { in: rolIds } } });
  if (found !== rolIds.length) throw badRequest('Alguno de los roles elegidos no existe');
}

export async function create({
  usuario,
  nombre,
  email = null,
  codigoCigam = null,
  passwordHash,
  rolIds = [],
  esSuperadmin = false,
  debeCambiarPassword = false,
  todasLasEstancias = false,
  campoIds = [],
}) {
  await assertUnique({ usuario, email, codigoCigam });
  await assertRolesExist(rolIds);
  await assertCamposExist(campoIds);
  try {
    const row = await prisma.usuario.create({
      data: {
        usuario,
        nombre,
        email,
        codigoCigam,
        passwordHash,
        esSuperadmin,
        debeCambiarPassword,
        todasLasEstancias,
        roles: { create: rolIds.map((rolId) => ({ rolId })) },
        campos: { create: (todasLasEstancias ? [] : campoIds).map((campoId) => ({ campoId })) },
      },
      select: userSelect,
    });
    return toUser(row);
  } catch (error) {
    // Dos altas simultáneas con el mismo dato: lo frena el índice único.
    if (isPrismaError(error, 'P2002')) {
      throw conflict('Ya existe un usuario con ese nombre de usuario, email o código CIGAM');
    }
    throw error;
  }
}

// Reemplaza todos los roles del usuario por los indicados. null si no existe.
export async function setRoles(id, rolIds) {
  const userId = parseId(id);
  if (!userId) return null;
  if (!(await prisma.usuario.findUnique({ where: { id: userId }, select: { id: true } }))) return null;
  await assertRolesExist(rolIds);
  await prisma.$transaction([
    prisma.usuarioRol.deleteMany({ where: { usuarioId: userId } }),
    prisma.usuarioRol.createMany({ data: rolIds.map((rolId) => ({ usuarioId: userId, rolId })) }),
  ]);
  return findById(userId);
}

// Dónde trabaja: todas las estancias, o la lista. Con "todas" la lista se
// vacía (una estancia nueva le aparece sola). null si no existe.
export async function setEstancias(id, { todasLasEstancias, campoIds }) {
  const userId = parseId(id);
  if (!userId) return null;
  if (!(await prisma.usuario.findUnique({ where: { id: userId }, select: { id: true } }))) return null;
  const ids = todasLasEstancias ? [] : campoIds;
  await assertCamposExist(ids);
  await prisma.$transaction([
    prisma.usuarioCampo.deleteMany({ where: { usuarioId: userId } }),
    prisma.usuarioCampo.createMany({ data: ids.map((campoId) => ({ usuarioId: userId, campoId })) }),
    prisma.usuario.update({ where: { id: userId }, data: { todasLasEstancias }, select: { id: true } }),
  ]);
  return findById(userId);
}

// Activa o desactiva. null si no existe. Los usuarios no se borran nunca.
// Desactivar también cierra todas sus sesiones abiertas.
export async function setActivo(id, activo) {
  const user = await updateUser(id, { activo });
  if (user && !activo) await prisma.sesion.deleteMany({ where: { usuarioId: user.id } });
  return user;
}

// --- Login y contraseñas ---

// Login correcto: limpia los intentos fallidos y anota el acceso. Si el hash
// es de un costo viejo, guarda el nuevo.
export async function registrarLoginOk(id, nuevoHash) {
  await prisma.usuario.update({
    where: { id },
    data: {
      intentosFallidos: 0,
      bloqueadoHasta: null,
      ultimoAcceso: new Date(),
      ...(nuevoHash && { passwordHash: nuevoHash }),
    },
    select: { id: true },
  });
}

// Suma un intento fallido. Al llegar al máximo bloquea la cuenta un rato y
// reinicia el contador. Devuelve { intentos, bloqueadoHasta } (null si no
// se bloqueó).
export async function registrarIntentoFallido(id) {
  // El incremento lo hace la base: dos intentos simultáneos cuentan los dos.
  const { intentosFallidos } = await prisma.usuario.update({
    where: { id },
    data: { intentosFallidos: { increment: 1 } },
    select: { intentosFallidos: true },
  });
  if (intentosFallidos < LOGIN.maxIntentos) return { intentos: intentosFallidos, bloqueadoHasta: null };

  const bloqueadoHasta = new Date(Date.now() + LOGIN.bloqueoMs);
  await prisma.usuario.update({ where: { id }, data: { intentosFallidos: 0, bloqueadoHasta }, select: { id: true } });
  return { intentos: intentosFallidos, bloqueadoHasta };
}

// Guarda una contraseña nueva y levanta cualquier bloqueo. Con
// debeCambiar: true (restablecida por un administrador) el usuario la tiene
// que cambiar al entrar. null si no existe.
export function setPassword(id, passwordHash, { debeCambiar }) {
  return updateUser(id, { passwordHash, debeCambiarPassword: debeCambiar, intentosFallidos: 0, bloqueadoHasta: null });
}

export function desbloquear(id) {
  return updateUser(id, { intentosFallidos: 0, bloqueadoHasta: null });
}
