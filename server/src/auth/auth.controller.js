import * as users from '../users/users.repository.js';
import { ACCION, registrar } from '../audit/audit.js';
import { badRequest, tooManyRequests, unauthorized } from '../errors.js';
import { DUMMY_HASH, hashPassword, necesitaRehash, verifyPassword } from './password.js';
import { clearSessionCookie, endSession, revokeUserSessions, startSession } from './session.js';

// No hay registro público: los usuarios los crea un administrador.

const CREDENCIALES_INCORRECTAS = 'Usuario o contraseña incorrectos';

function mensajeBloqueo(bloqueadoHasta) {
  const minutos = Math.max(1, Math.ceil((bloqueadoHasta - Date.now()) / 60_000));
  return `Tu usuario quedó bloqueado por demasiados intentos fallidos. Probá de nuevo en ${minutos} ${
    minutos === 1 ? 'minuto' : 'minutos'
  } o pedile a un administrador que lo desbloquee.`;
}

const auditarLogin = (req, usuarioId, accion, detalle) =>
  registrar(req, { accion, usuarioId, entidad: 'usuario', entidadId: usuarioId, detalle });

export async function login(req, res) {
  const { usuario, password } = req.body;
  const found = await users.findByUsuarioWithPassword(usuario);

  // Bloqueado: ni se mira la contraseña.
  if (found?.bloqueadoHasta > new Date()) {
    await auditarLogin(req, found.id, ACCION.LOGIN_FALLIDO, { motivo: 'bloqueado' });
    throw tooManyRequests(mensajeBloqueo(found.bloqueadoHasta), 'USUARIO_BLOQUEADO');
  }

  const passwordOk = await verifyPassword(password, found?.passwordHash ?? DUMMY_HASH);

  // Mismo mensaje si falla el usuario o la contraseña: no revela qué usuarios existen.
  if (!found) {
    await auditarLogin(req, null, ACCION.LOGIN_FALLIDO, { motivo: 'usuario_inexistente' });
    throw unauthorized(CREDENCIALES_INCORRECTAS);
  }
  if (!passwordOk) {
    const { intentos, bloqueadoHasta } = await users.registrarIntentoFallido(found.id);
    await auditarLogin(req, found.id, ACCION.LOGIN_FALLIDO, { motivo: 'password', intentos });
    if (bloqueadoHasta) {
      await auditarLogin(req, found.id, ACCION.USUARIO_BLOQUEADO, { hasta: bloqueadoHasta.toISOString() });
      throw tooManyRequests(mensajeBloqueo(bloqueadoHasta), 'USUARIO_BLOQUEADO');
    }
    throw unauthorized(CREDENCIALES_INCORRECTAS);
  }
  // Solo se avisa después de una contraseña correcta, así no se filtra nada.
  if (!found.activo) {
    await auditarLogin(req, found.id, ACCION.LOGIN_FALLIDO, { motivo: 'desactivado' });
    return res.status(403).json({ errors: ['Tu usuario está desactivado. Consultá con un administrador.'] });
  }

  const { passwordHash, ...user } = found;
  await users.registrarLoginOk(user.id, necesitaRehash(passwordHash) ? await hashPassword(password) : null);
  await startSession(req, res, user.id);
  await auditarLogin(req, user.id, ACCION.LOGIN_OK);
  res.json({ ...user, ultimoAcceso: new Date(), bloqueadoHasta: null });
}

export async function logout(req, res) {
  const usuarioId = await endSession(req, res);
  if (usuarioId) await auditarLogin(req, usuarioId, ACCION.LOGOUT);
  res.sendStatus(204);
}

// Devuelve el usuario de la sesión actual (el front lo llama al cargar).
export function me(req, res) {
  res.json(req.user);
}

// Cambio de la propia contraseña. Cierra las demás sesiones del usuario
// (otros navegadores o celulares) y deja abierta la actual.
export async function changePassword(req, res) {
  const { passwordActual, passwordNueva } = req.body;
  const me = await users.findByIdWithPassword(req.user.id);

  if (!(await verifyPassword(passwordActual, me.passwordHash))) {
    // Cuenta como intento fallido: si alguien usa una sesión ajena para
    // adivinar la contraseña, termina bloqueado y afuera.
    const { intentos, bloqueadoHasta } = await users.registrarIntentoFallido(me.id);
    await registrar(req, { accion: ACCION.PASSWORD_CAMBIO_FALLIDO, entidad: 'usuario', entidadId: me.id, detalle: { intentos } });
    if (bloqueadoHasta) {
      await revokeUserSessions(me.id);
      clearSessionCookie(res);
      await registrar(req, { accion: ACCION.USUARIO_BLOQUEADO, entidad: 'usuario', entidadId: me.id, detalle: { hasta: bloqueadoHasta.toISOString() } });
      throw tooManyRequests(mensajeBloqueo(bloqueadoHasta), 'USUARIO_BLOQUEADO');
    }
    throw badRequest('La contraseña actual no es correcta');
  }

  const user = await users.setPassword(me.id, await hashPassword(passwordNueva), { debeCambiar: false });
  await revokeUserSessions(me.id, { except: req.sesionId });
  await registrar(req, { accion: ACCION.PASSWORD_CAMBIADA, entidad: 'usuario', entidadId: me.id });
  res.json(user);
}
