import { clearSessionCookie, readSession } from './session.js';
import { forbidden, unauthorized } from '../errors.js';

const NO_SESSION = 'Necesitás iniciar sesión';
const EXPIRED = 'Tu sesión venció. Iniciá sesión de nuevo.';

// Carga la sesión y deja el usuario (sin contraseña) en req.user y el id de
// la sesión en req.sesionId. Con permitirCambioPendiente: false, un usuario
// que tiene que cambiar la contraseña no puede seguir hasta hacerlo.
function authenticate({ permitirCambioPendiente }) {
  return async (req, res, next) => {
    const { estado, sesionId, user } = await readSession(req);
    if (estado !== 'ok') {
      if (estado !== 'ninguna') clearSessionCookie(res);
      throw estado === 'ninguna' ? unauthorized(NO_SESSION) : unauthorized(EXPIRED, 'SESION_VENCIDA');
    }
    if (user.debeCambiarPassword && !permitirCambioPendiente) {
      throw forbidden('Tenés que cambiar tu contraseña antes de seguir', 'DEBE_CAMBIAR_PASSWORD');
    }
    req.user = user;
    req.sesionId = sesionId;
    next();
  };
}

// Exige una sesión vigente de un usuario activo, con la contraseña al día.
export const authRequired = authenticate({ permitirCambioPendiente: false });

// Igual, pero deja pasar a quien todavía tiene que cambiar la contraseña.
// Solo para /verify y para el cambio de contraseña.
export const authAllowPendingPassword = authenticate({ permitirCambioPendiente: true });

// TEMPORAL (fases 2 y 3): las rutas de administración son solo del superadmin.
// En la fase 4 se reemplaza por requirePermission(modulo, accion) en cada ruta.
export function requireSuperadmin(req, res, next) {
  if (!req.user?.esSuperadmin) throw forbidden('No tenés permisos para esta acción');
  next();
}
