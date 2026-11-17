// Sesiones en la base (tabla sesion) con un token opaco en una cookie httpOnly.
//
// - El token es aleatorio (256 bits) y solo vive en la cookie del navegador;
//   la base guarda su SHA-256, así una copia de la base no sirve para entrar.
// - Vence por inactividad (SESION_INACTIVIDAD_MINUTOS) y por tiempo máximo
//   (SESION_MAXIMA_HORAS), lo que pase primero.
// - Se puede revocar: logout, desactivar el usuario o cambiar la contraseña
//   borran la fila y la cookie deja de servir al instante.
// - Roles y estado del usuario se leen de la base en cada request.
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '../db.js';
import { COOKIE_NAME, IS_PRODUCTION, SESION } from '../config.js';
import { toUser, userSelect } from '../users/users.repository.js';

const cookieOptions = {
  httpOnly: true,
  secure: IS_PRODUCTION,
  // Strict: el navegador no manda la cookie en requests que vengan de otro
  // sitio (protege contra CSRF). Requiere que el front y la API estén en el
  // mismo sitio (por ejemplo app.sapsa.com.uy y api.sapsa.com.uy, o el mismo
  // dominio con /api). localhost:5173 y localhost:4000 cuentan como el mismo.
  sameSite: 'strict',
  path: '/',
};

// 32 bytes en base64url = 43 caracteres.
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;
const hashToken = (token) => createHash('sha256').update(token).digest('hex');

function readToken(req) {
  const token = req.cookies?.[COOKIE_NAME];
  return typeof token === 'string' && TOKEN_FORMAT.test(token) ? token : null;
}

const vencida = (sesion, ahora) =>
  sesion.venceEn <= ahora || ahora - sesion.ultimoUso >= SESION.inactividadMs;

// Crea la sesión, pone la cookie y devuelve el id de la sesión.
export async function startSession(req, res, usuarioId) {
  const token = randomBytes(32).toString('base64url');
  const ahora = new Date();
  const venceEn = new Date(ahora.getTime() + SESION.maximaMs);
  const id = hashToken(token);
  await prisma.sesion.create({
    data: {
      id,
      usuarioId,
      creadaEn: ahora,
      ultimoUso: ahora,
      venceEn,
      ip: req.ip?.slice(0, 45) ?? null,
      userAgent: req.get('user-agent')?.slice(0, 255) ?? null,
    },
  });
  // La cookie dura lo mismo que el máximo; la inactividad la controla el servidor.
  res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: SESION.maximaMs });
  return id;
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, cookieOptions);
}

// Devuelve { estado, sesionId, user }:
//   estado 'ninguna' (no hay cookie), 'vencida' (había, pero ya no sirve) u 'ok'.
// Si está vigente, registra la actividad (como mucho una vez por minuto).
export async function readSession(req) {
  const token = readToken(req);
  if (!token) return { estado: req.cookies?.[COOKIE_NAME] ? 'vencida' : 'ninguna' };

  const sesion = await prisma.sesion.findUnique({
    where: { id: hashToken(token) },
    select: { id: true, ultimoUso: true, venceEn: true, usuario: { select: userSelect } },
  });
  if (!sesion) return { estado: 'vencida' };

  const ahora = new Date();
  // Un usuario desactivado tampoco tiene sesión (setActivo ya las borra; esto
  // cubre una desactivación hecha directo en la base).
  if (vencida(sesion, ahora) || !sesion.usuario.activo) {
    await prisma.sesion.deleteMany({ where: { id: sesion.id } });
    return { estado: 'vencida' };
  }
  if (ahora - sesion.ultimoUso >= SESION.actualizarUsoCadaMs) {
    // deleteMany/updateMany no fallan si otra request la borró recién.
    await prisma.sesion.updateMany({ where: { id: sesion.id }, data: { ultimoUso: ahora } });
  }
  return { estado: 'ok', sesionId: sesion.id, user: toUser(sesion.usuario) };
}

// Cierra la sesión de la cookie (si existe). Devuelve el id del usuario o null.
export async function endSession(req, res) {
  clearSessionCookie(res);
  const token = readToken(req);
  if (!token) return null;
  const id = hashToken(token);
  const sesion = await prisma.sesion.findUnique({ where: { id }, select: { usuarioId: true } });
  if (!sesion) return null;
  await prisma.sesion.deleteMany({ where: { id } });
  return sesion.usuarioId;
}

// Cierra todas las sesiones de un usuario, menos (opcionalmente) una.
export async function revokeUserSessions(usuarioId, { except } = {}) {
  await prisma.sesion.deleteMany({ where: { usuarioId, ...(except && { id: { not: except } }) } });
}

// Borra las sesiones vencidas (index.js lo corre al arrancar y cada hora).
export async function purgeExpiredSessions() {
  const ahora = new Date();
  const { count } = await prisma.sesion.deleteMany({
    where: {
      OR: [{ venceEn: { lte: ahora } }, { ultimoUso: { lte: new Date(ahora.getTime() - SESION.inactividadMs) } }],
    },
  });
  return count;
}
