// Permisos por rol (fase 4 / paso 3 del rediseño, DECISIONES §3 y §11).
//
// Cada ruta declara qué pide con requirePermission(modulo, accion). El usuario
// lo tiene si alguno de sus roles tiene ese permiso; el superadmin pasa siempre.
// Los permisos del usuario llegan en req.user.permisos (los lee la sesión de la
// base en cada request, así un cambio de rol vale al instante).
import { MODULOS } from '../seed/catalog.js';
import { Accion } from '../generated/prisma/enums.ts';
import { forbidden } from '../errors.js';

const MODULOS_VALIDOS = new Set(MODULOS.map((m) => m.clave));
const ACCIONES_VALIDAS = new Set(Object.values(Accion));

export const SIN_PERMISO = 'No tenés permiso para esto';

export function tienePermiso(user, modulo, accion) {
  if (!user) return false;
  return user.esSuperadmin || user.permisos.includes(`${modulo}:${accion}`);
}

// Un módulo o una acción mal escritos hacen fallar la API al arrancar (al
// importar el archivo de rutas), no en el momento en que alguien la usa.
export function requirePermission(modulo, accion) {
  if (!MODULOS_VALIDOS.has(modulo)) throw new Error(`requirePermission: el módulo "${modulo}" no existe en el catálogo`);
  if (!ACCIONES_VALIDAS.has(accion)) throw new Error(`requirePermission: la acción "${accion}" no existe`);
  const middleware = (req, res, next) => {
    if (!tienePermiso(req.user, modulo, accion)) throw forbidden(SIN_PERMISO);
    next();
  };
  // Lo lee el test que exige que cada ruta declare su permiso.
  middleware.permiso = `${modulo}:${accion}`;
  return middleware;
}

// Para las pocas rutas que solo necesitan la sesión (las listas de catálogos
// las usan todas las pantallas): lo deja explícito para el test.
export function soloSesion(req, res, next) {
  next();
}
soloSesion.permiso = 'sesion';
