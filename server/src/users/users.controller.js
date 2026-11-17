import * as users from './users.repository.js';
import { hashPassword } from '../auth/password.js';
import { revokeUserSessions } from '../auth/session.js';
import { ACCION, registrar } from '../audit/audit.js';
import { badRequest, notFound, parseId } from '../errors.js';

const NOT_FOUND = 'Usuario no encontrado';

export async function listUsers(req, res) {
  res.json(await users.list());
}

// La contraseña la elige el administrador, así que es temporal: el usuario la
// tiene que cambiar en su primer ingreso.
export async function createUser(req, res) {
  const { password, ...data } = req.body;
  const user = await users.create({ ...data, passwordHash: await hashPassword(password), debeCambiarPassword: true });
  res.status(201).json(user);
}

// Nadie cambia sus propios roles ni su propio estado: así nadie se sube
// privilegios ni deja el sistema sin administrador por accidente.
export async function setUserRoles(req, res) {
  if (parseId(req.params.id) === req.user.id) throw badRequest('No podés cambiar tus propios roles');
  const user = await users.setRoles(req.params.id, req.body.rolIds);
  if (!user) throw notFound(NOT_FOUND);
  res.json(user);
}

// Busca al usuario sobre el que se va a actuar, que no puede ser uno mismo
// ni otro superadministrador.
async function findTarget(req, { propio, superadmin }) {
  const id = parseId(req.params.id);
  if (id === req.user.id) throw badRequest(propio);
  const target = await users.findById(id);
  if (!target) throw notFound(NOT_FOUND);
  if (target.esSuperadmin && superadmin) throw badRequest(superadmin);
  return target;
}

export async function setUserStatus(req, res) {
  const target = await findTarget(req, {
    propio: 'No podés cambiar el estado de tu propio usuario',
    superadmin: !req.body.activo && 'Un superadministrador no se puede desactivar desde la app',
  });
  res.json(await users.setActivo(target.id, req.body.activo));
}

// Restablece la contraseña con una temporal: cierra todas las sesiones del
// usuario, lo desbloquea y lo obliga a cambiarla al entrar.
export async function resetUserPassword(req, res) {
  const target = await findTarget(req, {
    propio: 'Para cambiar tu propia contraseña usá "Cambiar contraseña" en tu perfil',
    superadmin: 'La contraseña de un superadministrador no se puede restablecer desde la app',
  });
  const user = await users.setPassword(target.id, await hashPassword(req.body.password), { debeCambiar: true });
  await revokeUserSessions(target.id);
  await registrar(req, { accion: ACCION.PASSWORD_RESTABLECIDA, entidad: 'usuario', entidadId: target.id });
  res.json(user);
}

// Levanta el bloqueo por intentos fallidos antes de que venza solo.
export async function unlockUser(req, res) {
  const target = await findTarget(req, { propio: 'No podés desbloquear tu propio usuario' });
  const user = await users.desbloquear(target.id);
  await registrar(req, {
    accion: ACCION.USUARIO_DESBLOQUEADO,
    entidad: 'usuario',
    entidadId: target.id,
    detalle: { estabaBloqueadoHasta: target.bloqueadoHasta?.toISOString() ?? null },
  });
  res.json(user);
}
