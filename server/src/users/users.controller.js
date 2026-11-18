import * as users from './users.repository.js';
import { hashPassword } from '../auth/password.js';
import { revokeUserSessions } from '../auth/session.js';
import { ACCION, registrar } from '../audit/audit.js';
import { badRequest, forbidden, notFound, parseId } from '../errors.js';

const NOT_FOUND = 'Usuario no encontrado';

export async function listUsers(req, res) {
  res.json(await users.list());
}

export async function listEstancias(req, res) {
  res.json(await users.listEstancias());
}

// Solo el superadmin asigna roles con permisos sobre Usuarios, Roles o
// Auditoría (DECISIONES §3): un administrador no puede crear otro
// administrador ni subirse privilegios por la puerta de atrás.
async function exigirPuedeAsignar(req, rolIds) {
  if (req.user.esSuperadmin) return;
  const deAdmin = await users.rolesDeAdministracion(rolIds);
  if (deAdmin.length) {
    throw forbidden(`Solo el superadministrador puede asignar roles de administración (${deAdmin.join(', ')})`);
  }
}

// La contraseña la elige el administrador, así que es temporal: el usuario la
// tiene que cambiar en su primer ingreso.
export async function createUser(req, res) {
  const { password, ...data } = req.body;
  await exigirPuedeAsignar(req, data.rolIds);
  const user = await users.create({ ...data, passwordHash: await hashPassword(password), debeCambiarPassword: true });
  await registrar(req, {
    accion: ACCION.USUARIO_CREADO,
    entidad: 'usuario',
    entidadId: user.id,
    detalle: {
      usuario: user.usuario,
      roles: user.roles.map((r) => r.nombre),
      todasLasEstancias: user.todasLasEstancias,
      campos: await users.siglasDe(user.campoIds),
    },
  });
  res.status(201).json(user);
}

// Nadie cambia sus propios roles ni su propio estado: así nadie se sube
// privilegios ni deja el sistema sin administrador por accidente.
export async function setUserRoles(req, res) {
  if (parseId(req.params.id) === req.user.id) throw badRequest('No podés cambiar tus propios roles');
  const antes = await users.findById(req.params.id);
  if (!antes) throw notFound(NOT_FOUND);
  // Se controlan los roles que cambian, los que se agregan y los que se sacan:
  // sin ser superadmin tampoco se le saca a alguien un rol de administración.
  const tenia = antes.roles.map((r) => r.id);
  const nuevos = req.body.rolIds;
  const cambian = [...nuevos.filter((id) => !tenia.includes(id)), ...tenia.filter((id) => !nuevos.includes(id))];
  await exigirPuedeAsignar(req, cambian);
  const user = await users.setRoles(antes.id, req.body.rolIds);
  const nombres = (u) => u.roles.map((r) => r.nombre);
  if (JSON.stringify(nombres(antes)) !== JSON.stringify(nombres(user))) {
    await registrar(req, {
      accion: ACCION.ROLES_ASIGNADOS,
      entidad: 'usuario',
      entidadId: user.id,
      detalle: { antes: nombres(antes), despues: nombres(user) },
    });
  }
  res.json(user);
}

// Dónde trabaja: todas las estancias o una lista. Tampoco se cambia uno mismo.
export async function setUserEstancias(req, res) {
  if (parseId(req.params.id) === req.user.id) throw badRequest('No podés cambiar tus propias estancias');
  const antes = await users.findById(req.params.id);
  if (!antes) throw notFound(NOT_FOUND);
  const user = await users.setEstancias(antes.id, req.body);
  const resumen = async (u) => ({ todas: u.todasLasEstancias, campos: await users.siglasDe(u.campoIds) });
  const [a, d] = [await resumen(antes), await resumen(user)];
  if (JSON.stringify(a) !== JSON.stringify(d)) {
    await registrar(req, { accion: ACCION.ESTANCIAS_ASIGNADAS, entidad: 'usuario', entidadId: user.id, detalle: { antes: a, despues: d } });
  }
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
  const user = await users.setActivo(target.id, req.body.activo);
  if (target.activo !== user.activo) {
    await registrar(req, { accion: ACCION.USUARIO_ESTADO_CAMBIADO, entidad: 'usuario', entidadId: user.id, detalle: { activo: user.activo } });
  }
  res.json(user);
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
